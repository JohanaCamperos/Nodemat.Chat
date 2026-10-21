import React from 'react';
import { AlertTriangle, Download, Trash2 } from 'lucide-react';
import { storageService } from '../services/storageService';
import { formatBytes } from '../services/fileService';

export const StorageWarningModal = ({
    isOpen,
    onClose,
    onBackup,
    onCleanup
}: {
    isOpen: boolean,
    onClose: () => void,
    onBackup: () => void,
    onCleanup: () => void
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-surface border border-border rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6">
                    <div className="flex items-center gap-3 text-amber-500 mb-4">
                        <AlertTriangle size={32} />
                        <h2 className="text-xl font-bold text-text-main">Almacenamiento Lleno</h2>
                    </div>

                    <p className="text-text-muted mb-4 leading-relaxed">
                        El navegador no permite guardar más datos (límite de ~5MB alcanzado).
                        Tus nuevos mensajes <strong>no se guardarán</strong> si cierras la pestaña.
                    </p>

                    <div className="space-y-3">
                        <button
                            onClick={onBackup}
                            className="w-full flex items-center justify-center gap-2 p-3 bg-surface-highlight hover:bg-surface-hover text-text-main rounded-xl transition-colors border border-border font-medium"
                        >
                            <Download size={18} />
                            Descargar Copia de Seguridad (JSON)
                        </button>

                        <button
                            onClick={onCleanup}
                            className="w-full flex items-center justify-center gap-2 p-3 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors font-medium shadow-sm"
                        >
                            <Trash2 size={18} />
                            Borrar Mensajes Antiguos y Guardar
                        </button>
                    </div>

                    <div className="mt-4 pt-4 border-t border-border flex justify-end">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-text-muted hover:text-text-main text-sm font-medium transition-colors"
                        >
                            Cancelar (Riesgo de pérdida)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Storage Helpers --- (formatBytes viene de services/fileService)
export const getStorageUsage = async () => {
    const estimate = await storageService.getUsageEstimate();
    if (estimate) {
        return { used: estimate.usage, formatted: formatBytes(estimate.usage) };
    }
    return { used: 0, formatted: 'Calculando...' };
};
