import React from 'react';
import { Ban, CheckCircle2, Play, Wrench } from 'lucide-react';
import { ToolApprovalRequest } from '../services/llmService';


export type ToolDecision = 'deny' | 'allow' | 'always';

export const ToolApprovalModal = ({ pendingTool, onConfirm }: { pendingTool: (ToolApprovalRequest & { resolve: (v: boolean) => void }) | null, onConfirm: (decision: ToolDecision) => void }) => {
    if (!pendingTool) return null;
    const destructive = pendingTool.annotations?.destructiveHint === true && pendingTool.annotations?.readOnlyHint !== true;
    const readOnly = pendingTool.annotations?.readOnlyHint === true;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-surface rounded-2xl w-full max-w-lg shadow-2xl p-0 border border-border overflow-hidden animate-in zoom-in-95">
                <div className="bg-amber-50 dark:bg-amber-900/20 p-5 border-b border-amber-100 dark:border-amber-800/30 flex items-start gap-4">
                    <div className="bg-amber-100 dark:bg-amber-800/40 p-2 rounded-lg text-amber-600 dark:text-amber-400">
                        <Wrench size={24} />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-lg font-bold text-text-main">Solicitud de Herramienta</h3>
                        <p className="text-sm text-text-muted truncate">
                            La IA quiere ejecutar una acción en <strong className="text-text-main">{pendingTool.serverName}</strong>
                        </p>
                    </div>
                </div>

                <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                    <div>
                        <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Herramienta</span>
                        <div className="font-mono text-lg font-semibold text-primary mt-1 break-all">{pendingTool.originalName}</div>
                        {pendingTool.description && <p className="text-xs text-text-muted mt-1 line-clamp-4">{pendingTool.description}</p>}
                        <div className="flex gap-2 mt-2">
                            {readOnly && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">SOLO LECTURA</span>}
                            {destructive && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">⚠️ PUEDE MODIFICAR / BORRAR DATOS</span>}
                        </div>
                    </div>

                    <div>
                        <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Argumentos (Datos)</span>
                        <div className="mt-2 bg-background p-4 rounded-lg border border-border overflow-x-auto">
                            <pre className="text-xs font-mono text-text-main whitespace-pre-wrap break-all">
                                {JSON.stringify(pendingTool.args, null, 2)}
                            </pre>
                        </div>
                    </div>
                </div>

                <div className="p-5 bg-surface-highlight border-t border-border flex flex-wrap gap-3 justify-end">
                    <button
                        onClick={() => onConfirm('deny')}
                        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-border text-text-muted hover:text-red-500 hover:border-red-200 rounded-xl font-medium transition-colors"
                    >
                        <Ban size={18} /> Rechazar
                    </button>
                    {!destructive && (
                        <button
                            onClick={() => onConfirm('always')}
                            className="flex items-center gap-2 px-4 py-2 border border-primary text-primary hover:bg-primary/10 rounded-xl font-medium transition-colors"
                            title="No volver a preguntar por esta herramienta hasta recargar la página"
                        >
                            <CheckCircle2 size={18} /> Permitir siempre
                        </button>
                    )}
                    <button
                        autoFocus
                        onClick={() => onConfirm('allow')}
                        className="flex items-center gap-2 px-5 py-2 bg-primary text-white hover:bg-primary-hover shadow-md hover:shadow-lg rounded-xl font-bold transition-all transform active:scale-95"
                    >
                        <Play size={18} /> Aprobar
                    </button>
                </div>
            </div>
        </div>
    );
};
