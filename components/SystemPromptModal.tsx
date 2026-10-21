import React from 'react';
import { Terminal, X } from 'lucide-react';

export const SystemPromptModal = ({ isOpen, onClose, prompt, onChange, educationalMode }: any) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 text-text-main">
            <div className="bg-surface rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col border border-border">
                <div className="flex items-center justify-between p-6 border-b border-border">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Terminal className="text-primary" /> Instrucciones personalizadas
                    </h2>
                    <button onClick={onClose} className="text-text-muted hover:text-text-main">
                        <X size={24} />
                    </button>
                </div>
                <div className="p-6 space-y-4">

                    <textarea
                        value={prompt}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder="Escribe aquí las instrucciones globales para la IA..."
                        className="w-full h-48 p-4 bg-background border border-border rounded-xl resize-none focus:ring-2 focus:ring-primary outline-none text-text-main font-mono text-sm leading-relaxed"
                    />
                </div>
                <div className="p-6 border-t border-border flex justify-end">
                    <button onClick={onClose} className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover font-medium">
                        Guardar
                    </button>
                </div>
            </div>
        </div>
    );
};
