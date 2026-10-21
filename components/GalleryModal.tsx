import React, { useMemo, useState } from 'react';
import { Download, Images, MessageSquare, Paperclip, Wand2, X } from 'lucide-react';
import { Attachment, ChatSession } from '../types';
import { downloadImage } from '../services/fileService';
import { requestImageEdit } from '../services/imageBus';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    sessions: ChatSession[];
    onOpenChat: (sessionId: string) => void;
    onAttach: (att: Attachment) => void;
}

type Origin = 'subida' | 'generada' | 'herramienta';
interface GalleryItem { key: string; src: string; name: string; type: string; origin: Origin; sessionId: string; sessionTitle: string; timestamp: number; }

const ORIGIN_LABEL: Record<Origin, string> = { subida: 'Subidas', generada: 'Generadas', herramienta: 'De herramientas' };

/** Todas las imágenes de todas las conversaciones: subidas, generadas y devueltas por herramientas. */
export const GalleryModal: React.FC<Props> = ({ isOpen, onClose, sessions, onOpenChat, onAttach }) => {
    const [filter, setFilter] = useState<Origin | 'todas'>('todas');
    const [zoom, setZoom] = useState<GalleryItem | null>(null);

    const items = useMemo(() => {
        if (!isOpen) return [];
        const out: GalleryItem[] = [];
        const seen = new Set<string>();
        sessions.forEach(s => s.messages.forEach(m => {
            const origin: Origin = m.role === 'user' ? 'subida' : m.role === 'tool' && !m.toolMeta?.originalName?.startsWith('Generar imagen') ? 'herramienta' : 'generada';
            const add = (src: string, name: string, type: string) => {
                // La misma imagen puede estar en varios mensajes: se muestra una vez
                const key = `${src.length}:${src.slice(-64)}`;
                if (seen.has(key)) return;
                seen.add(key);
                out.push({ key, src, name, type, origin, sessionId: s.id, sessionTitle: s.title, timestamp: m.timestamp });
            };
            (m.attachments || []).filter(a => a.type.startsWith('image/')).forEach(a => add(a.data, a.name, a.type));
            // Imágenes insertadas como markdown en el texto
            for (const match of (m.content || '').matchAll(/!\[([^\]]*)\]\((data:image\/[^)]+)\)/g)) add(match[2], match[1] || 'imagen', match[2].slice(5, match[2].indexOf(';')));
        }));
        return out.sort((a, b) => b.timestamp - a.timestamp);
    }, [isOpen, sessions]);

    if (!isOpen) return null;
    const visible = filter === 'todas' ? items : items.filter(i => i.origin === filter);
    const counts = (o: Origin) => items.filter(i => i.origin === o).length;
    const iconBtn = "p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80";

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 md:p-4" onClick={onClose}>
            <div className="bg-surface border border-border rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="gallery-title">
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 id="gallery-title" className="font-bold text-lg text-text-main flex items-center gap-2"><Images size={20} className="text-primary" /> Galería</h2>
                    <button onClick={onClose} className="p-2 hover:bg-surface-highlight rounded-lg text-text-muted" aria-label="Cerrar"><X size={20} /></button>
                </div>
                <div className="flex flex-wrap gap-2 px-4 pt-3">
                    {(['todas', 'generada', 'subida', 'herramienta'] as const).map(f => (
                        <button key={f} onClick={() => setFilter(f)}
                            className={`px-3 py-1.5 rounded-full text-xs border ${filter === f ? 'bg-primary text-white border-primary' : 'border-border text-text-muted hover:bg-surface-highlight'}`}>
                            {f === 'todas' ? `Todas (${items.length})` : `${ORIGIN_LABEL[f]} (${counts(f)})`}
                        </button>
                    ))}
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                    {visible.length === 0 ? (
                        <p className="text-center text-sm text-text-muted py-16">Todavía no hay imágenes {filter !== 'todas' ? 'de este tipo ' : ''}en tus conversaciones.</p>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {visible.map(item => (
                                <figure key={item.key} className="relative group rounded-xl overflow-hidden border border-border bg-black/5">
                                    <button onClick={() => setZoom(item)} className="block w-full aspect-square" aria-label={`Ampliar ${item.name}`}>
                                        <img src={item.src} alt={item.name} loading="lazy" className="w-full h-full object-cover" />
                                    </button>
                                    <figcaption className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 to-transparent text-[10px] text-white truncate">{item.sessionTitle}</figcaption>
                                    <div className="absolute top-2 right-2 flex gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                        <button className={iconBtn} title="Editar / variaciones" aria-label="Editar" onClick={() => { requestImageEdit(item.src); onClose(); }}><Wand2 size={14} /></button>
                                        <button className={iconBtn} title="Adjuntar al próximo mensaje" aria-label="Adjuntar" onClick={() => { onAttach({ name: item.name, type: item.type, data: item.src }); onClose(); }}><Paperclip size={14} /></button>
                                        <button className={iconBtn} title="Ir a la conversación" aria-label="Ir a la conversación" onClick={() => { onOpenChat(item.sessionId); onClose(); }}><MessageSquare size={14} /></button>
                                        <button className={iconBtn} title="Descargar" aria-label="Descargar" onClick={() => downloadImage(item.src, 'nodemat')}><Download size={14} /></button>
                                    </div>
                                </figure>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            {zoom && (
                <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" onClick={(e) => { e.stopPropagation(); setZoom(null); }}>
                    <button className="absolute top-4 right-4 text-white/80 hover:text-white" aria-label="Cerrar"><X size={28} /></button>
                    <img src={zoom.src} alt={zoom.name} className="max-w-full max-h-full object-contain rounded-lg" onClick={e => e.stopPropagation()} />
                </div>
            )}
        </div>
    );
};
