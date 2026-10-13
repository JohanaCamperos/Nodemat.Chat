import React, { useState } from 'react';
import { Paperclip, X, Image, FileCode, FileText, Info, Upload } from 'lucide-react';

interface FileUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectFile: () => void;
    onFilesDropped?: (files: File[]) => void;
}

export const FileUploadModal: React.FC<FileUploadModalProps> = ({ isOpen, onClose, onSelectFile, onFilesDropped }) => {
    const [dragOver, setDragOver] = useState(false);
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-surface rounded-2xl p-6 w-full max-w-md shadow-xl border border-border animate-in fade-in zoom-in-95" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-text-main flex items-center gap-2">
                        <Paperclip size={20} className="text-primary" /> Adjuntar Archivo
                    </h2>
                    <button onClick={onClose} className="text-text-muted hover:text-text-main">
                        <X size={20} />
                    </button>
                </div>

                <div className="space-y-4">
                    <div className="p-4 bg-surface-highlight rounded-xl border border-border/50">
                        <h3 className="text-sm font-semibold text-text-main mb-2">Formatos Permitidos:</h3>
                        <ul className="grid grid-cols-1 gap-2 text-xs text-text-muted">
                            <li className="flex items-center gap-1.5"><Image size={12} className="text-blue-500" /> Imágenes (JPG, PNG, WebP, GIF) — se reducen automáticamente</li>
                            <li className="flex items-center gap-1.5"><FileText size={12} className="text-red-500" /> PDF hasta 15 MB (OpenAI, OpenRouter y Gemini)</li>
                            <li className="flex items-center gap-1.5"><FileCode size={12} className="text-green-500" /> Texto y código (.txt, .md, .csv, .json, .py, .ts…) hasta 2 MB</li>
                        </ul>
                    </div>

                    <div
                        className={`p-4 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-3 py-8 transition-colors cursor-pointer group ${dragOver ? 'border-primary bg-primary/5' : 'border-border bg-background/30 hover:bg-background/50'}`}
                        onClick={onSelectFile}
                        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={e => {
                            e.preventDefault();
                            setDragOver(false);
                            if (e.dataTransfer.files.length) onFilesDropped?.(Array.from(e.dataTransfer.files));
                        }}
                    >
                        <div className="p-3 bg-surface-highlight rounded-full group-hover:scale-110 transition-transform">
                            <Upload size={32} className="text-primary" />
                        </div>
                        <div className="text-center">
                            <p className="text-sm font-medium text-text-main">Click o arrastra archivos aquí</p>
                            <p className="text-xs text-text-muted">También puedes pegar imágenes (Ctrl+V) o soltarlas sobre el chat</p>
                        </div>
                    </div>

                    <div className="bg-blue-500/10 p-3 rounded-lg flex gap-3 text-xs text-blue-500 border border-blue-500/20">
                        <Info size={16} className="shrink-0" />
                        <p>Los archivos se envían directamente al proveedor elegido y se guardan sólo en tu navegador. Con proveedores sin soporte de PDF, el PDF se omite con un aviso.</p>
                    </div>

                    <button
                        onClick={onClose}
                        className="w-full py-2.5 bg-surface-highlight hover:bg-border text-text-main rounded-xl text-sm font-medium transition-colors"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
};
