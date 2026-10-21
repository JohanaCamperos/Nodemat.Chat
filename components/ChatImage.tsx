import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, RefreshCw, Download, Share2, Maximize2, X, Wand2 } from 'lucide-react';
import { shareImage, shareOutcomeLabel } from '../services/fileService';
import { requestImageEdit } from '../services/imageBus';

interface ChatImageProps {
    src?: string;
    alt?: string;
    onDownload: (src: string) => void;
}

export const ChatImage: React.FC<ChatImageProps> = ({ src, alt, onDownload }) => {
    const [error, setError] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [toast, setToast] = useState('');
    const [zoomed, setZoomed] = useState(false);

    if (error) {
        return (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg inline-flex items-center gap-2 my-2 max-w-full overflow-hidden">
                <AlertTriangle size={16} className="text-red-500 shrink-0" />
                <div className="flex flex-col overflow-hidden">
                    <span className="text-xs text-red-500 font-medium">Error cargando imagen (¿el enlace expiró?)</span>
                    {src && !src.startsWith('data:') && (
                        <a href={src} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline truncate">
                            {src}
                        </a>
                    )}
                </div>
            </div>
        );
    }

    const handleShare = async (e: React.MouseEvent) => {
        e.preventDefault();
        if (!src) return;
        const outcome = await shareImage(src);
        if (outcome !== 'shared' && outcome !== 'cancelled') {
            setToast(shareOutcomeLabel[outcome]);
            setTimeout(() => setToast(''), 2000);
        }
    };

    const btn = "bg-black/60 hover:bg-black/80 text-white p-2 rounded-lg backdrop-blur-sm shadow-md hover:scale-105 transition-all";

    return (
        <>
            <span className="relative group inline-block max-w-full my-2">
                {!isLoaded && (
                    <span className="w-64 h-48 bg-surface-highlight animate-pulse rounded-xl border border-border flex items-center justify-center text-text-muted">
                        <RefreshCw className="animate-spin" />
                    </span>
                )}
                <img
                    src={src}
                    alt={alt || "Imagen generada"}
                    className={`rounded-xl border border-border shadow-sm max-h-[500px] object-contain bg-black/5 transition-opacity duration-300 cursor-zoom-in ${isLoaded ? 'opacity-100' : 'opacity-0 absolute top-0 left-0'}`}
                    onLoad={() => setIsLoaded(true)}
                    onError={() => setError(true)}
                    onClick={() => setZoomed(true)}
                    loading="lazy"
                />
                {isLoaded && (
                    <span className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.preventDefault(); setZoomed(true); }} className={btn} title="Ampliar">
                            <Maximize2 size={16} />
                        </button>
                        {src?.startsWith('data:') && (
                            <button onClick={(e) => { e.preventDefault(); requestImageEdit(src); }} className={btn} title="Editar o crear variaciones" aria-label="Editar imagen">
                                <Wand2 size={16} />
                            </button>
                        )}
                        <button onClick={handleShare} className={btn} title="Compartir / copiar" aria-label="Compartir imagen">
                            <Share2 size={16} />
                        </button>
                        <button onClick={(e) => { e.preventDefault(); onDownload(src || ''); }} className={btn} title="Descargar imagen">
                            <Download size={16} />
                        </button>
                    </span>
                )}
                {toast && (
                    <span className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/80 text-white text-xs px-3 py-1 rounded-full">
                        {toast}
                    </span>
                )}
            </span>

            {/* Portal: la imagen suele renderizarse dentro de un <p> del markdown */}
            {zoomed && createPortal(
                <div className="fixed inset-0 z-[120] bg-black/90 flex items-center justify-center p-4" onClick={() => setZoomed(false)}>
                    <button className="absolute top-4 right-4 text-white/80 hover:text-white" onClick={() => setZoomed(false)} title="Cerrar">
                        <X size={28} />
                    </button>
                    <img src={src} alt={alt} className="max-w-full max-h-full object-contain rounded-lg" onClick={e => e.stopPropagation()} />
                </div>,
                document.body
            )}
        </>
    );
};
