import React, { useState } from 'react';
import { Wrench, ChevronDown, CheckCircle2, AlertCircle, Ban, Server } from 'lucide-react';
import { Message } from '../types';
import { ChatImage } from './ChatImage';
import { AttachmentIcon } from './AttachmentIcon';
import { downloadAttachment } from '../services/fileService';

/**
 * Muestra las llamadas a herramientas MCP y sus resultados dentro del chat.
 * EDUCATIVO: permite ver exactamente qué pidió el modelo (nombre + argumentos)
 * y qué le devolvió el servidor MCP.
 */

export const ToolCallsBlock: React.FC<{ message: Message }> = ({ message }) => {
    if (!message.toolCalls?.length) return null;
    return (
        <div className="space-y-1.5 mt-2">
            {message.toolCalls.map(tc => (
                <div key={tc.id} className="flex items-start gap-2 text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-200/70 dark:border-amber-800/40 rounded-lg px-3 py-2">
                    <Wrench size={14} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                        <span className="font-semibold text-text-main">El modelo pidió ejecutar </span>
                        <code className="font-mono text-amber-700 dark:text-amber-300">{tc.function.name}</code>
                        <pre className="mt-1 font-mono text-[11px] text-text-muted whitespace-pre-wrap break-all">{prettyArgs(tc.function.arguments)}</pre>
                    </div>
                </div>
            ))}
        </div>
    );
};

export const ToolResultCard: React.FC<{ message: Message; onDownload: (src: string) => void }> = ({ message, onDownload }) => {
    const meta = message.toolMeta;
    const [open, setOpen] = useState(!!meta?.isError);
    const content = message.content || '';
    const isLong = content.length > 300;

    const status = meta?.denied
        ? { icon: <Ban size={14} className="text-text-muted" />, label: 'Rechazada', cls: 'border-border' }
        : meta?.isError
            ? { icon: <AlertCircle size={14} className="text-red-500" />, label: 'Error', cls: 'border-red-200 dark:border-red-800/50' }
            : { icon: <CheckCircle2 size={14} className="text-green-600" />, label: 'OK', cls: 'border-green-200 dark:border-green-800/50' };

    return (
        <div className={`bg-surface border ${status.cls} rounded-xl text-xs overflow-hidden`}>
            <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-highlight/60 text-left">
                {status.icon}
                <span className="font-mono font-semibold text-text-main truncate">{meta?.originalName || message.name}</span>
                {meta?.serverName && (
                    <span className="hidden sm:flex items-center gap-1 text-text-muted truncate"><Server size={11} /> {meta.serverName}</span>
                )}
                <span className="ml-auto flex items-center gap-2 text-text-muted shrink-0">
                    {status.label}{meta?.durationMs !== undefined && !meta.denied ? ` · ${meta.durationMs} ms` : ''}
                    <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
                </span>
            </button>
            {!open && !isLong && content && (
                <div className="px-3 pb-2 text-text-muted font-mono whitespace-pre-wrap break-words">{content}</div>
            )}
            {open && (
                <div className="px-3 pb-3 space-y-2 border-t border-border/60 pt-2">
                    {meta?.args !== undefined && (
                        <div>
                            <div className="text-[10px] uppercase font-bold text-text-muted mb-1">Argumentos</div>
                            <pre className="bg-background p-2 rounded-lg font-mono text-[11px] whitespace-pre-wrap break-all">{JSON.stringify(meta.args, null, 2)}</pre>
                        </div>
                    )}
                    <div>
                        <div className="text-[10px] uppercase font-bold text-text-muted mb-1">Resultado (enviado al modelo)</div>
                        <pre className="bg-background p-2 rounded-lg font-mono text-[11px] whitespace-pre-wrap break-words max-h-80 overflow-y-auto">{content}</pre>
                    </div>
                </div>
            )}
            {message.attachments?.filter(a => a.type.startsWith('image/')).map((att, i) => (
                <div key={i} className="px-3 pb-3"><ChatImage src={att.data} alt={att.name} onDownload={onDownload} /></div>
            ))}
            {/* Audio y archivos que devolvió la herramienta */}
            {message.attachments?.filter(a => !a.type.startsWith('image/')).map((att, i) => (
                <div key={`f${i}`} className="px-3 pb-3 flex flex-col gap-1.5">
                    <button onClick={() => downloadAttachment(att)} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-surface-highlight w-fit max-w-full" title="Descargar">
                        <AttachmentIcon type={att.type} name={att.name} />
                        <span className="truncate">{att.name}</span>
                    </button>
                    {att.type.startsWith('audio/') && <audio controls src={att.data} className="h-9 max-w-full" aria-label={`Reproducir ${att.name}`} />}
                </div>
            ))}
        </div>
    );
};

function prettyArgs(raw: string) {
    try { return JSON.stringify(JSON.parse(raw || '{}'), null, 2); } catch { return raw; }
}
