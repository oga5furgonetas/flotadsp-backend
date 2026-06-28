/**
 * PolygonEditor.jsx
 * Editor visual de polígono para corrección precisa de daños.
 *
 * Controles:
 *   - Arrastrar punto existente  → moverlo
 *   - Clic en borde del polígono → insertar nuevo punto ahí
 *   - Doble clic en punto        → eliminarlo (mínimo 3 puntos)
 *   - Botón "Confirmar"          → devuelve [[y,x],...] en 0-1000
 */
import { useRef, useState, useEffect, useCallback } from "react";

const HIT_RADIUS = 10;
const EDGE_HIT_RADIUS = 8;

export default function PolygonEditor({ photoUrl, currentPolygon, currentBox, onConfirm, onCancel }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [points, setPoints] = useState([]);
  const [dragging, setDragging] = useState(null);
  const [hovering, setHovering] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ w: 1, h: 1 });

  const toCanvas = useCallback((poly, cw, ch) =>
    poly.map(([py, px]) => ({ x: (px / 1000) * cw, y: (py / 1000) * ch })),
  []);

  const toGemini = useCallback((pts, cw, ch) =>
    pts.map(({ x, y }) => [
      Math.max(0, Math.min(1000, Math.round((y / ch) * 1000))),
      Math.max(0, Math.min(1000, Math.round((x / cw) * 1000))),
    ]),
  []);

  const onImgLoad = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const maxW = Math.min(800, img.naturalWidth);
    const ratio = maxW / img.naturalWidth;
    canvas.width = maxW;
    canvas.height = img.naturalHeight * ratio;
    setCanvasSize({ w: canvas.width, h: canvas.height });
    if (currentPolygon && currentPolygon.length >= 3) {
      setPoints(toCanvas(currentPolygon, canvas.width, canvas.height));
    } else if (currentBox) {
      const [ymin, xmin, ymax, xmax] = currentBox;
      const cw = canvas.width, ch = canvas.height;
      setPoints([
        { x: (xmin / 1000) * cw, y: (ymin / 1000) * ch },
        { x: (xmax / 1000) * cw, y: (ymin / 1000) * ch },
        { x: (xmax / 1000) * cw, y: (ymax / 1000) * ch },
        { x: (xmin / 1000) * cw, y: (ymax / 1000) * ch },
      ]);
    }
    setImgLoaded(true);
  };

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !imgLoaded || points.length === 0) return;
    const ctx = canvas.getContext("2d");
    const { width: cw, height: ch } = canvas;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, cw, ch);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(0, 0, cw, ch);
    if (points.length >= 2) {
      ctx.beginPath();
      points.forEach(({ x, y }, i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
      ctx.closePath();
      ctx.fillStyle = "rgba(239,68,68,0.2)";
      ctx.fill();
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    points.forEach(({ x, y }, i) => {
      const isHover = hovering === i;
      const isDrag = dragging === i;
      ctx.beginPath();
      ctx.arc(x, y, isDrag ? 9 : isHover ? 8 : 6, 0, Math.PI * 2);
      ctx.fillStyle = isDrag ? "#f97316" : isHover ? "#fbbf24" : "#ef4444";
      ctx.fill();
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = "bold 10px sans-serif";
      ctx.fillStyle = "white";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(i + 1, x, y);
    });
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.textAlign = "left";
    ctx.fillText("Arrastra puntos · Clic en borde para añadir · Doble clic para eliminar", 10, ch - 10);
  }, [imgLoaded, points, hovering, dragging]);

  useEffect(() => { redraw(); }, [redraw]);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const bounds = canvas.getBoundingClientRect();
    const scaleX = canvas.width / bounds.width;
    const scaleY = canvas.height / bounds.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - bounds.left) * scaleX, y: (clientY - bounds.top) * scaleY };
  };

  const findPointAt = (pos) => {
    for (let i = 0; i < points.length; i++) {
      const dx = points[i].x - pos.x, dy = points[i].y - pos.y;
      if (Math.sqrt(dx * dx + dy * dy) < HIT_RADIUS) return i;
    }
    return -1;
  };

  const findEdgeAt = (pos) => {
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      if (len2 === 0) continue;
      let t = ((pos.x - a.x) * dx + (pos.y - a.y) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const cx = a.x + t * dx, cy = a.y + t * dy;
      const ex = pos.x - cx, ey = pos.y - cy;
      if (Math.sqrt(ex * ex + ey * ey) < EDGE_HIT_RADIUS) {
        return { edgeIdx: i, insertPt: { x: cx, y: cy } };
      }
    }
    return null;
  };

  const onMouseDown = (e) => {
    e.preventDefault();
    const pos = getPos(e);
    const ptIdx = findPointAt(pos);
    if (ptIdx >= 0) { setDragging(ptIdx); return; }
    const edge = findEdgeAt(pos);
    if (edge) {
      const newPoints = [...points];
      newPoints.splice(edge.edgeIdx + 1, 0, edge.insertPt);
      setPoints(newPoints);
      setDragging(edge.edgeIdx + 1);
      setConfirmed(false);
    }
  };

  const onMouseMove = (e) => {
    e.preventDefault();
    const pos = getPos(e);
    if (dragging !== null) {
      const canvas = canvasRef.current;
      const newPts = [...points];
      newPts[dragging] = {
        x: Math.max(0, Math.min(canvas.width, pos.x)),
        y: Math.max(0, Math.min(canvas.height, pos.y)),
      };
      setPoints(newPts);
    } else {
      const ptIdx = findPointAt(pos);
      setHovering(ptIdx >= 0 ? ptIdx : null);
    }
  };

  const onMouseUp = (e) => { e.preventDefault(); setDragging(null); };

  const onDblClick = (e) => {
    e.preventDefault();
    if (points.length <= 3) return;
    const pos = getPos(e);
    const ptIdx = findPointAt(pos);
    if (ptIdx >= 0) {
      setPoints(points.filter((_, i) => i !== ptIdx));
      setConfirmed(false);
    }
  };

  const handleConfirm = () => {
    const canvas = canvasRef.current;
    onConfirm(toGemini(points, canvas.width, canvas.height));
    setConfirmed(true);
  };

  const handleReset = () => {
    if (currentPolygon && currentPolygon.length >= 3) {
      setPoints(toCanvas(currentPolygon, canvasSize.w, canvasSize.h));
    }
    setConfirmed(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 20, fontSize: 12, color: "#9ca3af", flexWrap: "wrap" }}>
        <span>🔴 Arrastra un punto para moverlo</span>
        <span>➕ Clic en borde para añadir punto</span>
        <span>✖️ Doble clic en punto para eliminarlo</span>
      </div>
      <div style={{ fontSize: 12, color: "#6b7280" }}>
        Polígono: <strong style={{ color: "#ef4444" }}>{points.length} puntos</strong>
        {points.length < 4 && " (mínimo 3 para confirmar)"}
      </div>
      <div style={{ position: "relative" }}>
        <img
          ref={imgRef}
          src={photoUrl}
          onLoad={onImgLoad}
          style={{ display: "none" }}
          crossOrigin="anonymous"
          alt=""
        />
        <canvas
          ref={canvasRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onDoubleClick={onDblClick}
          onTouchStart={onMouseDown}
          onTouchMove={onMouseMove}
          onTouchEnd={onMouseUp}
          style={{
            width: "100%", maxWidth: 800,
            border: "2px solid #374151", borderRadius: 8,
            display: "block", touchAction: "none",
            cursor: hovering !== null ? "grab" : "crosshair",
          }}
        />
        {!imgLoaded && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af" }}>
            Cargando imagen...
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={handleConfirm}
          disabled={points.length < 3 || confirmed}
          style={{
            padding: "8px 20px", borderRadius: 6, border: "none",
            background: confirmed ? "#065f46" : "#ef4444",
            color: "white", fontWeight: 600,
            cursor: points.length >= 3 ? "pointer" : "not-allowed",
            opacity: points.length >= 3 ? 1 : 0.5,
          }}
        >
          {confirmed ? "✓ Polígono enviado" : `Confirmar polígono (${points.length} pts)`}
        </button>
        <button onClick={handleReset} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #374151", background: "transparent", color: "#9ca3af", cursor: "pointer" }}>
          Resetear
        </button>
        <button onClick={onCancel} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #374151", background: "transparent", color: "#9ca3af", cursor: "pointer" }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
