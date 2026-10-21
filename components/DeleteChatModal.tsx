import React, { useState, useEffect } from 'react';
import { Download, Trash2 } from 'lucide-react';

export const DeleteChatModal = ({
    isOpen,
    onClose,
    onConfirm,
    onExport,
    onDownloadOnly,
    chatTitle
}: {
    isOpen: boolean,
    onClose: () => void,
    onConfirm: () => void,
    onExport: (name: string) => void,
    onDownloadOnly: (name: string) => void,
    chatTitle: string
}) => {
    const [filename, setFilename] = useState('');

    useEffect(() => {
        if (isOpen && chatTitle) {
            const safeTitle = chatTitle.substring(0, 30).replace(/[^a-z0-9]/gi, '_').toLowerCase();
            setFilename(`${safeTitle}_${new Date().toISOString().slice(0, 10)}`);
        }
    }, [isOpen, chatTitle]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-border text-text-main animate-in zoom-in-95 duration-200">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-500">
                        <Trash2 size={20} />
                    </div>
                    <h3 className="text-lg font-bold">¿Borrar este chat?</h3>
                </div>
                <p className="text-text-muted mb-6">
                    Estás a punto de eliminar permanentemente <strong>"{chatTitle}"</strong>.
                    <br /><br />
                    Esta acción <strong>no afectará</strong> a tus otros chats.
                </p>

                <div className="mb-4 bg-surface-highlight/30 p-3 rounded-xl border border-border">
                    <label className="block text-xs font-semibold text-text-muted mb-1 uppercase">Guardar copia como:</label>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={filename}
                            onChange={(e) => setFilename(e.target.value)}
                            className="flex-1 p-2 bg-background border border-border rounded-lg text-sm outline-none focus:border-primary text-text-main"
                            placeholder="nombre_archivo"
                        />
                        <span className="text-xs text-text-muted">.json</span>
                    </div>
                </div>

                <div className="space-y-2 mb-4">
                    <button
                        onClick={() => { onDownloadOnly(filename); onClose(); }}
                        className="w-full flex items-center justify-center gap-2 p-3 bg-primary-light hover:bg-primary/20 text-primary rounded-xl transition-colors border border-primary/20 font-medium text-sm"
                    >
                        <Download size={16} /> Solo Descargar
                    </button>
                    <button
                        onClick={() => onExport(filename)}
                        className="w-full flex items-center justify-center gap-2 p-3 bg-surface-highlight hover:bg-surface-hover text-text-main rounded-xl transition-colors border border-border font-medium text-sm"
                    >
                        <Download size={16} /> Descargar y Borrar
                    </button>
                </div>

                <div className="flex gap-3 justify-end pt-2 border-t border-border">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl hover:bg-surface-highlight text-text-muted font-medium transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium shadow-sm transition-colors"
                    >
                        Borrar sin Guardar
                    </button>
                </div>
            </div>
        </div>
    );
};
