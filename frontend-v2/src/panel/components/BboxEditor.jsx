/**
 * BboxEditor.jsx
 * Editor visual de bounding box (rectángulo) para corrección rápida de daños.
 * - Clic y arrastra para dibujar un nuevo rectángulo
 * - El box existente se muestra como referencia al cargar
 * - Confirmar devuelve [ymin, xmin, ymax, xmax] en 0-1000
 */
import { useRef, useState, useCallback, useEffect } from "react";

export default function BboxEditor({ photoUrl, currentBox, onConfirm, onCancel }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [start, setStart] = useState(null);
  const [box, setBox] = useState(null); // {x1,y1,x2,y2} en px canvas
  const [confirmed, setConfirmed] = useState(false);

  const onImgLoad = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const maxW = Math.min(800, img.naturalWidth);
    const ratio = maxW / img.naturalWidth;
    canvas.width = maxW;
    canvas.height = img.naturalHeight * ratio;
    if (currentBox) {
      const [ymin, xmin, ymax, xmax] = currentBox;
      const cw = canvas.width, ch = canvas.height;
      setBox({
        x1: (xmin / 1000) * cw, y1: (ymin / 1000) * ch,
        x2: (xmax / 1000) * cw, y2: (ymax / 1000) * ch,
      });
    }
    setImgLoaded(true);
  };

  const redraw = useCallback((liveBox) => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !imgLoaded) return;
    const ctx = canvas.getContext("2d");
    const { width: cw, height: ch } = canvas;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, cw, ch);
    const b = liveBox ?? box;
    if (b) {
      const x = Math.min(b.x1, b.x2), y = Math.min(b.y1, b.y2);
      const w = Math.abs(b.x2 - b.x1), h = Math.abs(b.y2 - b.y1);
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = "rgba(239,68,68,0.15)";
      ctx.fillRect(x, y, w, h);
      // Dimensiones
      ctx.font = "11px sans-serif";
      ctx.fillStyle = "#ef4444";
      ctx.textAlign = "left";
      ctx.fillText(`${Math.round(w)}×${Math.round(h)}px`, x + 4, y + 14);
    }
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.textAlign = "left";
    ctx.fillText("Arrastra para dibujar el área del daño", 10, ch - 10);
  }, [imgLoaded, box]);

  useEffect(() => { redraw(); }, [redraw]);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const bounds = canvas.getBoundingClientRect();
    const scaleX = canvas.width / bounds.width;
    const scaleY = canvas.height / bounds.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: Math.max(0, Math.min(canvas.width, (clientX - bounds.left) * scaleX)),
      y: Math.max(0, Math.min(canvas.height, (clientY - bounds.top) * scaleY)),
    };
  };

  const onMouseDown = (e) => {
    e.preventDefault();
    const pos = getPos(e);
    setStart(pos);
    setDrawing(true);
    setConfirmed(false);
  };

  const onMouseMove = (e) => {
    e.preventDefault();
    if (!drawing || !start) return;
    const pos = getPos(e);
    const liveBox = { x1: start.x, y1: start.y, x2: pos.x, y2: pos.y };
    redraw(liveBox);
  };

  const onMouseUp = (e) => {
    e.preventDefault();
    if (!drawing || !start) return;
    const pos = getPos(e);
    setBox({ x1: start.x, y1: start.y, x2: pos.x, y2: pos.y });
    setDrawing(false);
    setStart(null);
  };

  const handleConfirm = () => {
    if (!box) return;
    const canvas = canvasRef.current;
    const cw = canvas.width, ch = canvas.height;
    const ymin = Math.round((Math.min(box.y1, box.y2) / ch) * 1000);
    const xmin = Math.round((Math.min(box.x1, box.x2) / cw) * 1000);
    const ymax = Math.round((Math.max(box.y1, box.y2) / ch) * 1000);
    const xmax = Math.round((Math.max(box.x1, box.x2) / cw) * 1000);
    onConfirm([ymin, xmin, ymax, xmax]);
    setConfirmed(true);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 12, color: "#9ca3af" }}>
        Arrastra sobre la foto para dibujar el rectángulo correcto del daño.
        {box && !confirmed && <span style={{ color: "#fbbf24", marginLeft: 8 }}>⬜ Rectángulo listo — pulsa Confirmar</span>}
      </div>
      <div style={{ position: "relative" }}>
        <img ref={imgRef} src={photoUrl} onLoad={onImgLoad} style={{ display: "none" }} crossOrigin="anonymous" alt="" />
        <canvas
          ref={canvasRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onTouchStart={onMouseDown}
          onTouchMove={onMouseMove}
          onTouchEnd={onMouseUp}
          style={{
            width: "100%", maxWidth: 800,
            border: "2px solid #374151", borderRadius: 8,
            display: "block", touchAction: "none", cursor: "crosshair",
          }}
        />
        {!imgLoaded && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af" }}>
            Cargando imagen...
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleConfirm}
          disabled={!box || confirmed}
          style={{
            padding: "8px 20px", borderRadius: 6, border: "none",
            background: confirmed ? "#065f46" : "#ef4444",
            color: "white", fontWeight: 600,
            cursor: box ? "pointer" : "not-allowed",
            opacity: box ? 1 : 0.5,
          }}
        >
          {confirmed ? "✓ Bbox enviada" : "Confirmar rectángulo"}
        </button>
        <button onClick={onCancel} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #374151", background: "transparent", color: "#9ca3af", cursor: "pointer" }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
