"use client";

import { useRef, useState, useEffect } from "react";

type Props = {
  onSignature: (svgContent: string) => void;
  width?: number;
  height?: number;
};

export default function SignatureCanvas({
  onSignature,
  width = 400,
  height = 160,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [strokes, setStrokes] = useState<{ x: number; y: number }[][]>([]);
  const [currentStroke, setCurrentStroke] = useState<{ x: number; y: number }[]>([]);

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const t = e.touches[0];
      return {
        x: (t.clientX - rect.left) * scaleX,
        y: (t.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    setDrawing(true);
    const pos = getPos(e);
    setCurrentStroke([pos]);
  }

  function moveDraw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing) return;
    e.preventDefault();
    const pos = getPos(e);
    setCurrentStroke((s) => [...s, pos]);
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx && currentStroke.length > 0) {
      const prev = currentStroke[currentStroke.length - 1];
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
  }

  function endDraw() {
    if (!drawing) return;
    setDrawing(false);
    if (currentStroke.length > 1) {
      setStrokes((s) => [...s, currentStroke]);
    }
    setCurrentStroke([]);
  }

  function clear() {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, width, height);
    setStrokes([]);
    setCurrentStroke([]);
  }

  function toSvg(): string {
    const paths = strokes
      .map((stroke) => {
        const d = stroke
          .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
          .join(" ");
        return `<path d="${d}" stroke="black" stroke-width="2" fill="none" stroke-linecap="round"/>`;
      })
      .join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${paths}</svg>`;
  }

  const totalPoints = strokes.reduce((n, s) => n + s.length, 0);
  const isValid = strokes.length >= 1 && totalPoints >= 8;

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full touch-none rounded-xl border-2 border-dashed border-slate-300 bg-white"
        style={{ maxWidth: width }}
        onMouseDown={startDraw}
        onMouseMove={moveDraw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={moveDraw}
        onTouchEnd={endDraw}
      />
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={clear}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Löschen
        </button>
        <button
          type="button"
          onClick={() => {
            if (isValid) onSignature(toSvg());
          }}
          disabled={!isValid}
          className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-brand-700 disabled:opacity-40"
        >
          Unterschrift bestätigen
        </button>
      </div>
      {!isValid && strokes.length > 0 && (
        <p className="text-center text-[10px] text-amber-600">
          Bitte deutlicher unterschreiben
        </p>
      )}
    </div>
  );
}
