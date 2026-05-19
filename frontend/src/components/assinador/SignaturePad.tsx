'use client';

import { useRef, useEffect, useImperativeHandle, forwardRef, useState } from 'react';
import { Trash2, PenLine } from 'lucide-react';

export interface SignaturePadRef {
  toDataURL(): string | null;
  isEmpty(): boolean;
  clear(): void;
}

interface Props {
  onSign?: () => void;
}

export const SignaturePad = forwardRef<SignaturePadRef, Props>(function SignaturePad({ onSign }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  useImperativeHandle(ref, () => ({
    toDataURL() {
      if (empty) return null;
      return canvasRef.current?.toDataURL('image/png') ?? null;
    },
    isEmpty() { return empty; },
    clear() { clearCanvas(); },
  }));

  function getCtx() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    return ctx;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setEmpty(true);
  }

  function getPos(e: PointerEvent): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set internal resolution higher than display for sharpness
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    function onDown(e: PointerEvent) {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      drawing.current = true;
      lastPoint.current = getPos(e);

      // Start a new path at the dot position (for tap-dots)
      const ctx = getCtx()!;
      ctx.beginPath();
      ctx.arc(lastPoint.current.x, lastPoint.current.y, 0.8, 0, Math.PI * 2);
      ctx.fillStyle = '#0E1015';
      ctx.fill();
      setEmpty(false);
    }

    function onMove(e: PointerEvent) {
      if (!drawing.current) return;
      e.preventDefault();
      const ctx = getCtx();
      if (!ctx || !lastPoint.current) return;

      const pos = getPos(e);
      // Vary line width slightly with pressure (stylus) or speed
      const pressure = e.pressure > 0 ? e.pressure : 0.5;
      const lineWidth = Math.max(1, pressure * 2.8);

      ctx.beginPath();
      ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = '#0E1015';
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      lastPoint.current = pos;
      setEmpty(false);
    }

    function onUp(e: PointerEvent) {
      if (!drawing.current) return;
      drawing.current = false;
      lastPoint.current = null;
      onSign?.();
    }

    canvas.addEventListener('pointerdown', onDown, { passive: false });
    canvas.addEventListener('pointermove', onMove, { passive: false });
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    };
  }, [onSign]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#424957]">
          <PenLine size={13} className="text-[#1351B4]" />
          Assine com o dedo ou caneta
        </div>
        {!empty && (
          <button
            type="button"
            onClick={clearCanvas}
            className="flex items-center gap-1 text-xs text-[#8A91A0] hover:text-[#C53030] transition-colors"
          >
            <Trash2 size={12} /> Limpar
          </button>
        )}
      </div>

      <div className={`relative rounded-xl border-2 transition-colors ${
        empty ? 'border-dashed border-[#D6DAE1]' : 'border-[#1351B4]'
      } bg-white overflow-hidden`} style={{ height: 130 }}>
        <canvas
          ref={canvasRef}
          className="w-full h-full touch-none cursor-crosshair"
          style={{ display: 'block' }}
        />
        {empty && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none gap-1">
            <PenLine size={20} className="text-[#D6DAE1]" />
            <span className="text-xs text-[#B8BDC7]">Desenhe sua assinatura aqui</span>
          </div>
        )}
        {/* baseline guide */}
        <div className="absolute bottom-8 left-6 right-6 border-b border-dashed border-[#E4E7ED] pointer-events-none" />
      </div>

      {empty && (
        <p className="text-[11px] text-[#8A91A0]">
          Use o dedo, caneta stylus ou mouse. A assinatura será inserida no PDF.
        </p>
      )}
    </div>
  );
});
