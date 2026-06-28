from __future__ import annotations

import base64
import logging
import os
import time
from typing import Optional

import cv2 as _cv2
import numpy as _np

logger = logging.getLogger(__name__)

_REPLICATE_URL = "https://api.replicate.com/v1/predictions"
_REPLICATE_SAM2_VERSION = "fe97b453a6455861e3bac769b441ca1f1086110da7466dbb65cf1eecfd60dc83"
_REPLICATE_TOKEN = None


def _get_replicate_token():
    global _REPLICATE_TOKEN
    if _REPLICATE_TOKEN is None:
        _REPLICATE_TOKEN = os.environ.get("REPLICATE_API_TOKEN")
    return _REPLICATE_TOKEN


def _segment_with_sam_api(img_bytes: bytes, box_2d: list, timeout: int = 30) -> Optional[list]:
    """SAM2 via Replicate API — HTTPS puro, sin torch, funciona en Fly.io."""
    token = _get_replicate_token()
    if not token:
        logger.debug("[SAM] REPLICATE_API_TOKEN no configurado, usando OpenCV.")
        return None
    try:
        import requests

        buf = _np.frombuffer(img_bytes, _np.uint8)
        img_bgr = _cv2.imdecode(buf, _cv2.IMREAD_COLOR)
        if img_bgr is None:
            return None
        H, W = img_bgr.shape[:2]

        MAX_DIM = 1024
        scale = min(MAX_DIM / max(H, W), 1.0)
        if scale < 1.0:
            W_s, H_s = int(W * scale), int(H * scale)
            img_bgr = _cv2.resize(img_bgr, (W_s, H_s), interpolation=_cv2.INTER_AREA)
        else:
            H_s, W_s = H, W

        ymin, xmin, ymax, xmax = box_2d
        x1 = int(xmin / 1000 * W_s)
        y1 = int(ymin / 1000 * H_s)
        x2 = int(xmax / 1000 * W_s)
        y2 = int(ymax / 1000 * H_s)

        img_rgb = _cv2.cvtColor(img_bgr, _cv2.COLOR_BGR2RGB)
        _, jpeg_buf = _cv2.imencode(".jpg", img_rgb, [_cv2.IMWRITE_JPEG_QUALITY, 90])
        img_b64 = base64.b64encode(jpeg_buf.tobytes()).decode("utf-8")
        data_uri = f"data:image/jpeg;base64,{img_b64}"

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Prefer": "wait",
        }
        payload = {
            "version": _REPLICATE_SAM2_VERSION,
            "input": {
                "image": data_uri,
                "input_box": f"[[{x1}, {y1}, {x2}, {y2}]]",
                "multimask_output": False,
            }
        }

        resp = requests.post(_REPLICATE_URL, json=payload, headers=headers, timeout=timeout)

        if resp.status_code == 202:
            prediction = resp.json()
            poll_url = prediction.get("urls", {}).get("get")
            if not poll_url:
                return None
            deadline = time.time() + timeout
            while time.time() < deadline:
                time.sleep(2)
                pr = requests.get(poll_url, headers={"Authorization": f"Bearer {token}"}, timeout=10)
                p = pr.json()
                if p.get("status") == "succeeded":
                    prediction = p
                    break
                if p.get("status") in ("failed", "canceled"):
                    logger.warning(f"[SAM] Predicción fallida: {p.get('error')}")
                    return None
            else:
                logger.warning("[SAM] Timeout esperando predicción Replicate.")
                return None
        elif resp.status_code in (200, 201):
            prediction = resp.json()
        else:
            logger.warning(f"[SAM] HTTP {resp.status_code}: {resp.text[:300]}")
            return None

        if prediction.get("status") != "succeeded":
            return None

        output = prediction.get("output")
        if not output:
            return None

        # Output: {"combined_mask": url, "individual_masks": [...]} o str o list
        if isinstance(output, dict):
            mask_url = output.get("combined_mask") or (output.get("individual_masks") or [None])[0]
        elif isinstance(output, str):
            mask_url = output
        elif isinstance(output, list):
            mask_url = output[0]
        else:
            mask_url = None
        if not mask_url:
            return None

        mask_resp = requests.get(mask_url, timeout=15)
        if mask_resp.status_code != 200:
            return None

        mask_arr = _np.frombuffer(mask_resp.content, _np.uint8)
        mask = _cv2.imdecode(mask_arr, _cv2.IMREAD_GRAYSCALE)
        if mask is None:
            return None

        if mask.shape != (H_s, W_s):
            mask = _cv2.resize(mask, (W_s, H_s), interpolation=_cv2.INTER_NEAREST)
        _, mask = _cv2.threshold(mask, 127, 255, _cv2.THRESH_BINARY)

        bbox_area = max(1, (y2 - y1) * (x2 - x1))
        overlap_px = float(_np.sum(mask[y1:y2, x1:x2] > 0))
        if overlap_px / bbox_area < 0.10:
            logger.debug(f"[SAM] Overlap bajo ({overlap_px/bbox_area:.2f}) → None")
            return None

        total_px = float(_np.sum(mask > 0))
        if total_px > bbox_area * 5 or total_px < 200:
            logger.debug(f"[SAM] Tamaño máscara inválido ({total_px:.0f}px) → None")
            return None

        contours, _ = _cv2.findContours(mask, _cv2.RETR_EXTERNAL, _cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return None

        best_c = max(contours, key=_cv2.contourArea)
        if _cv2.contourArea(best_c) < 100:
            return None

        approx = _cv2.approxPolyDP(best_c, 0.015 * _cv2.arcLength(best_c, True), True)
        if len(approx) < 4:
            return None

        poly = [
            [max(0, min(1000, round(float(pt[0][1]) / H_s * 1000))),
             max(0, min(1000, round(float(pt[0][0]) / W_s * 1000)))]
            for pt in approx
        ]
        logger.info(f"[SAM] OK via Replicate — puntos={len(poly)}")
        return poly

    except Exception as e:
        logger.warning(f"[SAM] Error Replicate: {e}")
        return None


def _segment_with_opencv(img_bytes: bytes, box_2d: list, scale_max: int = 900) -> Optional[list]:
    """Fallback OpenCV con señal absoluta + ratio test + overlap obligatorio."""
    try:
        buf = _np.frombuffer(img_bytes, _np.uint8)
        img_bgr = _cv2.imdecode(buf, _cv2.IMREAD_COLOR)
        if img_bgr is None:
            return None
        H_orig, W_orig = img_bgr.shape[:2]

        scale = min(scale_max / max(H_orig, W_orig), 1.0)
        if scale < 1.0:
            W_p, H_p = int(W_orig * scale), int(H_orig * scale)
            img_p = _cv2.resize(img_bgr, (W_p, H_p), interpolation=_cv2.INTER_AREA)
        else:
            W_p, H_p = W_orig, H_orig
            img_p = img_bgr.copy()

        ymin, xmin, ymax, xmax = box_2d
        bh, bw = ymax - ymin, xmax - xmin
        cy1 = int(max(0.0, (ymin - bh * 0.4) / 1000) * H_p)
        cx1 = int(max(0.0, (xmin - bw * 0.4) / 1000) * W_p)
        cy2 = int(min(1.0, (ymax + bh * 0.4) / 1000) * H_p)
        cx2 = int(min(1.0, (xmax + bw * 0.4) / 1000) * W_p)
        crop = img_p[cy1:cy2, cx1:cx2]
        if crop.size == 0 or crop.shape[0] < 30 or crop.shape[1] < 30:
            return None

        L = _cv2.cvtColor(crop, _cv2.COLOR_BGR2LAB)[:, :, 0].astype(_np.float32)
        blur_L = _cv2.GaussianBlur(L, (51, 51), 0)

        bx1_c = max(0, int(xmin / 1000 * W_p) - cx1)
        bx2_c = min(crop.shape[1], int(xmax / 1000 * W_p) - cx1)
        by1_c = max(0, int(ymin / 1000 * H_p) - cy1)
        by2_c = min(crop.shape[0], int(ymax / 1000 * H_p) - cy1)
        if bx2_c <= bx1_c or by2_c <= by1_c:
            return None

        gx = _cv2.Sobel(L, _cv2.CV_32F, 1, 0, ksize=3)
        gy = _cv2.Sobel(L, _cv2.CV_32F, 0, 1, ksize=3)
        cand_abs = (
            _np.sqrt(gx ** 2 + gy ** 2) * 0.40
            + _np.clip(blur_L - L, 0, 255) * 0.35
            + _np.clip(L - blur_L, 0, 255) * 0.25
        )

        inner = float(_np.mean(cand_abs[by1_c:by2_c, bx1_c:bx2_c]))
        if inner < 20.0:
            return None
        outer_b = _np.ones(crop.shape[:2], dtype=bool)
        outer_b[by1_c:by2_c, bx1_c:bx2_c] = False
        outer = float(_np.mean(cand_abs[outer_b])) if outer_b.any() else inner
        if outer > 0 and (inner / outer) < 1.3:
            return None

        cand_u8 = _cv2.GaussianBlur(
            _cv2.normalize(cand_abs, None, 0, 255, _cv2.NORM_MINMAX).astype(_np.uint8),
            (21, 21), 0,
        )
        _, binary = _cv2.threshold(cand_u8, 0, 255, _cv2.THRESH_BINARY + _cv2.THRESH_OTSU)
        ksize = max(9, int(min(crop.shape[:2]) * 0.04)) | 1
        kernel = _cv2.getStructuringElement(_cv2.MORPH_ELLIPSE, (ksize, ksize))
        final_mask = _cv2.dilate(
            _cv2.morphologyEx(binary, _cv2.MORPH_CLOSE, kernel, iterations=3),
            kernel, iterations=2,
        )

        contours, _ = _cv2.findContours(final_mask, _cv2.RETR_EXTERNAL, _cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return None

        bbox_mask = _np.zeros(crop.shape[:2], _np.uint8)
        bbox_mask[by1_c:by2_c, bx1_c:bx2_c] = 255
        bbox_area = float(max(1, (by2_c - by1_c) * (bx2_c - bx1_c)))
        bx_cx = (bx1_c + bx2_c) / 2.0
        bx_cy = (by1_c + by2_c) / 2.0
        bbox_diag = ((bx2_c - bx1_c) ** 2 + (by2_c - by1_c) ** 2) ** 0.5

        def _score(c):
            m = _np.zeros(crop.shape[:2], _np.uint8)
            _cv2.drawContours(m, [c], -1, 255, _cv2.FILLED)
            ov = float(_np.sum((m > 0) & (bbox_mask > 0))) / bbox_area
            if ov < 0.05:
                return float("inf")
            M = _cv2.moments(c)
            if M["m00"] < 1:
                return float("inf")
            d = ((M["m10"] / M["m00"] - bx_cx) ** 2 + (M["m01"] / M["m00"] - bx_cy) ** 2) ** 0.5
            return d / max(bbox_diag, 1) - ov * 2.0

        best = min(contours, key=_score)
        bm = _np.zeros(crop.shape[:2], _np.uint8)
        _cv2.drawContours(bm, [best], -1, 255, _cv2.FILLED)
        if float(_np.sum((bm > 0) & (bbox_mask > 0))) / bbox_area < 0.05:
            return None
        if _cv2.contourArea(best) < 50:
            return None

        M_b = _cv2.moments(best)
        if M_b["m00"] > 0:
            drift = (
                ((M_b["m10"] / M_b["m00"]) - bx_cx) ** 2
                + ((M_b["m01"] / M_b["m00"]) - bx_cy) ** 2
            ) ** 0.5
            if drift > bbox_diag * 1.5:
                return None

        approx = _cv2.approxPolyDP(best, 0.02 * _cv2.arcLength(best, True), True)
        if len(approx) < 4:
            return None

        poly = []
        for pt in approx:
            poly.append([
                max(0, min(1000, round((float(pt[0][1]) + cy1) / scale / H_orig * 1000))),
                max(0, min(1000, round((float(pt[0][0]) + cx1) / scale / W_orig * 1000))),
            ])
        return poly

    except Exception as e:
        logger.warning(f"[OpenCV] {e}")
        return None


def segment_damage(img_bytes: bytes, box_2d: list, debug: bool = False) -> tuple:
    """Cascada: SAM2 via Replicate → OpenCV mejorado → None.
    box_2d = [ymin, xmin, ymax, xmax] en 0-1000 (formato Gemini)."""
    info = {}

    poly = _segment_with_sam_api(img_bytes, box_2d)
    if poly is not None:
        info["method"] = "sam-replicate"
        return poly, info if debug else None

    poly = _segment_with_opencv(img_bytes, box_2d)
    if poly is not None:
        info["method"] = "opencv"
        return poly, info if debug else None

    info["method"] = "none"
    return None, info if debug else None


def preload_sam():
    """Verificar token Replicate al arranque."""
    token = _get_replicate_token()
    if token:
        logger.info("[SAM] REPLICATE_API_TOKEN detectado — SAM2 disponible via Replicate.")
    else:
        logger.warning("[SAM] REPLICATE_API_TOKEN no configurado — solo OpenCV fallback.")
        logger.warning("[SAM] Token gratis en: https://replicate.com/account/api-tokens")
