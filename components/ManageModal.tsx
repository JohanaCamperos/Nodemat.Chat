import React, { useState } from 'react';
import { AlertTriangle, Download, Settings, Upload, X } from 'lucide-react';
import { ConfigBackupSection } from './ConfigBackupSection';

export const ManageModal: React.FC<any> = ({ isOpen, onClose, onExport, onImport, onDeleteAll, storageUsage, settings, sessions, onImportConfig }) => {
    const [filename, setFilename] = useState(`nexus_backup_${new Date().toISOString().slice(0, 10)}`);

    if (!isOpen) return null;

    const limit = 5 * 1024 * 1024; // 5MB approx limit
    const percentage = Math.min(100, (storageUsage.used / limit) * 100);

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface rounded-2xl w-full max-w-md shadow-2xl p-6 border border-border text-text-main max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <Settings size={20} className="text-text-muted" /> Gestión de Datos
                    </h3>
                    <button onClick={onClose} className="text-text-muted hover:text-text-main"><X size={20} /></button>
                </div>

                <div className="mb-6 p-4 bg-surface-highlight/50 rounded-xl border border-border">
                    <div className="flex justify-between text-sm font-medium mb-2">
                        <span>Almacenamiento (IndexedDB)</span>
                        <span className="text-primary">{storageUsage.formatted}</span>
                    </div>
                    {/* Progress bar removed as IDB is huge */}
                    <p className="text-xs text-text-muted mt-2">
                        Almacenamiento masivo habilitado. El límite depende de tu disco duro.
                    </p>
                </div>

                <ConfigBackupSection settings={settings} sessions={sessions} onImported={onImportConfig} />


                <div className="mb-6">
                    <p className="text-sm text-text-muted mb-3">
                        Opciones de exportación y limpieza:
                    </p>

                    <div className="mb-3">
                        <label className="block text-xs font-semibold text-text-muted mb-1 uppercase">Nombre del Archivo</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={filename}
                                onChange={(e) => setFilename(e.target.value)}
                                className="flex-1 p-2 bg-background border border-border rounded-lg text-sm outline-none focus:border-primary text-text-main"
                                placeholder="Nombre del backup..."
                            />
                            <span className="text-sm text-text-muted font-mono">.json</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-3">
                    <button
                        onClick={() => onExport(filename)}
                        className="w-full flex items-center justify-center gap-3 p-3 bg-primary-light text-primary rounded-xl hover:opacity-90 transition-colors font-medium"
                    >
                        <Download size={20} /> Exportar Todos los Chats
                    </button>

                    <label className="w-full flex items-center justify-center gap-3 p-3 border border-border text-text-main rounded-xl hover:bg-surface-highlight transition-colors font-medium cursor-pointer">
                        <Upload size={20} /> Importar Chats (JSON)
                        <input
                            type="file"
                            accept="application/json,.json"
                            className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ''; }}
                        />
                    </label>

                    <button
                        onClick={onDeleteAll}
                        className="w-full flex items-center justify-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors font-medium border border-red-100 dark:border-red-900/30"
                    >
                        <AlertTriangle size={20} /> Borrar Todo y Resetear
                    </button>
                </div>
            </div>
        </div>
    );
};
