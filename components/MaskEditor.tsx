import React, { useEffect, useRef, useState } from 'react';
import { Brush, Eraser, RotateCcw, X } from 'lucide-react';

export interface MaskResult {
    /** PNG del tamaño de la imagen: transparente donde hay que cambiar (formato que pide OpenAI) */
    mask: string;
    /** La imagen con la zona pintada en magenta, para modelos que no aceptan máscara */
    overlay: string;
}

interface Props {
    image: string;
    onCancel: () => void;
    onDone: (result: MaskResult) => void;
}

/**
 * Pintar sobre la imagen la zona que se quiere modificar (inpainting).
 * EDUCATIVO: OpenAI recibe una máscara PNG donde lo transparente es lo que se
 * edita. Los modelos sin máscara (Gemini, OpenRouter) reciben en cambio la
 * imagen con la zona marcada y la instrucción de tocar sólo eso.
 */
export const MaskEditor: React.FC<Props> = ({ image, onCancel, onDone }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);
    const drawing = useRef(false);
    const last = useRef<{ x: number; y: number } | null>(null);
    const [brush, setBrush] = useState(40);
    const [erase, setErase] = useState(false);
    const [painted, setPainted] = useState(false);

    useEffect(() => {
        const img = new Image();
        img.onload = () => {
            imgRef.current = img;
            const c = canvasRef.current!;
            c.width = img.naturalWidth;
            c.height = img.naturalHeight;
        };
        img.src = image;
    }, [image]);

    const pos = (e: React.PointerEvent) => {
        const c = canvasRef.current!;
        const r = c.getBoundingClientRect();
        return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
    };

    const stroke = (from: { x: number; y: number }, to: { x: number; y: number }) => {
        const c = canvasRef.current!;
        const ctx = c.getContext('2d')!;
        const scale = c.width / c.getBoundingClientRect().width;
        ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
        ctx.strokeStyle = 'rgba(255, 0, 200, 0.55)';
        ctx.lineWidth = brush * scale;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        if (!erase) setPainted(true);
    };

    const down = (e: React.PointerEvent) => {
        (e.target as Element).setPointerCapture(e.pointerId);
        drawing.current = true;
        const p = pos(e);
        last.current = p;
        stroke(p, p);
    };
    const move = (e: React.PointerEvent) => {
        if (!drawing.current || !last.current) return;
        const p = pos(e);
        stroke(last.current, p);
        last.current = p;
    };
    const up = () => { drawing.current = false; last.current = null; };

    const clear = () => {
        const c = canvasRef.current!;
        c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
        setPainted(false);
    };

    const finish = () => {
        const c = canvasRef.current!;
        const img = imgRef.current!;
        const strokes = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);

        // Máscara: opaca en todo, transparente donde se pintó
        const mask = document.createElement('canvas');
        mask.width = c.width;
        mask.height = c.height;
        const mctx = mask.getContext('2d')!;
        const data = mctx.createImageData(c.width, c.height);
        for (let i = 0; i < data.data.length; i += 4) {
            data.data[i + 3] = strokes.data[i + 3] > 0 ? 0 : 255;
        }
        mctx.putImageData(data, 0, 0);

        // Vista con la zona marcada
        const overlay = document.createElement('canvas');
        overlay.width = c.width;
        overlay.height = c.height;
        const octx = overlay.getContext('2d')!;
        octx.drawImage(img, 0, 0);
        octx.drawImage(c, 0, 0);

        onDone({ mask: mask.toDataURL('image/png'), overlay: overlay.toDataURL('image/png') });
    };

    const tool = (active: boolean) => `p-2 rounded-lg border ${active ? 'bg-primary text-white border-primary' : 'border-border text-text-muted hover:bg-surface-highlight'}`;

    return (
        <div className="fixed inset-0 z-[130] bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Marcar la zona a modificar">
            <div className="bg-surface rounded-2xl border border-border shadow-2xl w-full max-w-3xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="font-bold text-text-main">Pinta la zona que quieres cambiar</h3>
                    <button onClick={onCancel} className="text-text-muted hover:text-text-main" aria-label="Cerrar"><X size={20} /></button>
                </div>
                <div className="relative mx-auto w-fit max-w-full">
                    <img src={image} alt="" className="max-h-[60vh] max-w-full rounded-lg select-none" draggable={false} />
                    <canvas
                        ref={canvasRef}
                        className="absolute inset-0 w-full h-full rounded-lg cursor-crosshair touch-none"
                        onPointerDown={down}
                        onPointerMove={move}
                        onPointerUp={up}
                        onPointerLeave={up}
                    />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <button onClick={() => setErase(false)} className={tool(!erase)} title="Pincel" aria-label="Pincel"><Brush size={16} /></button>
                    <button onClick={() => setErase(true)} className={tool(erase)} title="Borrar trazo" aria-label="Goma"><Eraser size={16} /></button>
                    <button onClick={clear} className={tool(false)} title="Empezar de nuevo" aria-label="Limpiar"><RotateCcw size={16} /></button>
                    <label className="flex items-center gap-2 text-xs text-text-muted">
                        Tamaño
                        <input type="range" min={8} max={120} value={brush} onChange={e => setBrush(Number(e.target.value))} />
                    </label>
                    <div className="ml-auto flex gap-2">
                        <button onClick={onCancel} className="px-4 py-2 text-sm text-text-muted hover:text-text-main">Cancelar</button>
                        <button onClick={finish} disabled={!painted} className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover disabled:opacity-50">Usar esta zona</button>
                    </div>
                </div>
            </div>
        </div>
    );
};
