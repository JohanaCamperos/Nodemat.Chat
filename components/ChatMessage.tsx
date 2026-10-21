import React from 'react';
import { Copy, Pencil, RefreshCw, Share2 } from 'lucide-react';
import { AttachmentIcon } from './AttachmentIcon';
import { Message } from '../types';
import { ChatImage } from './ChatImage';
import { Markdown } from './Markdown';
import { ToolCallsBlock, ToolResultCard } from './ToolMessage';
import { downloadAttachment, downloadImage, formatBytes } from '../services/fileService';

interface Props {
    msg: Message;
    onCopy: (msg: Message) => void;
    onShare: (msg: Message) => void;
    /** Mensajes del usuario: editar y reenviar desde ahí */
    onEdit?: (msg: Message) => void;
    /** Última respuesta: pedirla de nuevo */
    onRegenerate?: () => void;
}

/** Una burbuja del chat: mensaje del usuario, respuesta del modelo, error o resultado de herramienta. */
export const ChatMessage: React.FC<Props> = ({ msg, onCopy, onShare, onEdit, onRegenerate }) => {
    // Resultados de herramientas MCP: tarjeta compacta
    if (msg.role === 'tool') {
        return (
            <div className="flex justify-start">
                <div className="max-w-[90%] md:max-w-[80%] w-full md:w-auto md:min-w-[320px] space-y-1">
                    <ToolResultCard message={msg} onDownload={downloadImage} />
                    {onRegenerate && (
                        <button onClick={onRegenerate} className="text-xs text-text-muted hover:text-text-main flex items-center gap-1"><RefreshCw size={12} /> Reintentar</button>
                    )}
                </div>
            </div>
        );
    }

    const isUser = msg.role === 'user';
    const isAssistant = msg.role === 'model' || msg.role === 'assistant';
    const onlyToolCalls = isAssistant && !!msg.toolCalls?.length && !msg.content;
    const imageAtts = msg.attachments?.filter(a => a.type.startsWith('image/')) || [];
    const fileAtts = msg.attachments?.filter(a => !a.type.startsWith('image/')) || [];

    return (
        <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[90%] md:max-w-[80%] space-y-2 group/msg">
                <div className={`${onlyToolCalls ? 'p-0' : 'p-4 rounded-2xl shadow-sm'} ${onlyToolCalls ? '' : isUser
                    ? 'bg-primary text-white rounded-br-none'
                    : msg.role === 'system'
                        ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-100 dark:border-red-800'
                        : 'bg-surface border border-border text-text-main rounded-bl-none'
                    }`}>
                    {/* Adjuntos del usuario: miniaturas */}
                    {isUser && imageAtts.length > 0 && (
                        <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
                            {imageAtts.map((att, i) => (
                                <a key={i} href="#" onClick={(e) => { e.preventDefault(); downloadImage(att.data, 'adjunto'); }} title={`${att.name} — clic para descargar`} className="shrink-0">
                                    <img src={att.data} alt={att.name} className="h-20 w-20 object-cover rounded-lg border border-white/20" />
                                </a>
                            ))}
                        </div>
                    )}
                    {fileAtts.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                            {fileAtts.map((att, i) => (
                                <div key={i} className="flex flex-col gap-1.5">
                                    <button onClick={() => downloadAttachment(att)} title={att.extractedText ? 'Descargar (el modelo recibió el texto extraído)' : 'Descargar'}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border max-w-[240px] ${isUser ? 'bg-white/10 border-white/20' : 'bg-surface-highlight border-border'}`}>
                                        <AttachmentIcon type={att.type} name={att.name} />
                                        <span className="truncate">{att.name}</span>
                                        {att.size ? <span className="opacity-70 shrink-0">{formatBytes(att.size)}</span> : null}
                                    </button>
                                    {att.type.startsWith('audio/') && att.data.startsWith('data:') && (
                                        <audio controls src={att.data} className="h-9 max-w-[260px]" aria-label={`Reproducir ${att.name}`} />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="leading-relaxed">
                        {isAssistant ? (
                            <>
                                {msg.reasoning && (
                                    <details className="mb-2 text-xs text-text-muted group/reason">
                                        <summary className="cursor-pointer select-none hover:text-text-main">Ver el razonamiento del modelo</summary>
                                        <div className="mt-2 pl-3 border-l-2 border-border whitespace-pre-wrap leading-relaxed">{msg.reasoning}</div>
                                    </details>
                                )}
                                {msg.content && <Markdown>{msg.content}</Markdown>}
                                {/* Imágenes generadas por el modelo */}
                                {imageAtts.length > 0 && (
                                    <div className="flex flex-wrap gap-3">
                                        {imageAtts.map((att, i) => <ChatImage key={i} src={att.data} alt={att.name} onDownload={downloadImage} />)}
                                    </div>
                                )}
                                <ToolCallsBlock message={msg} />
                            </>
                        ) : (
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                        )}
                    </div>
                </div>
                {!onlyToolCalls && (
                    <div className={`flex items-center gap-2 text-xs text-text-muted ${isUser ? 'justify-end' : 'justify-start'}`}>
                        <span>{isUser ? 'Tú' : msg.role === 'system' ? 'Sistema' : 'Nodemat AI'} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {msg.usage && isAssistant && (
                            <span className="bg-surface-highlight px-1.5 py-0.5 rounded text-[10px] text-text-muted font-mono" title="Tokens de entrada | salida">
                                ⬇ {msg.usage.input} | ⬆ {msg.usage.output}
                            </span>
                        )}
                        {(onEdit || onRegenerate) && (
                            <span className="flex items-center gap-1 opacity-100 md:opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100 transition-opacity">
                                {onEdit && (
                                    <button onClick={() => onEdit(msg)} className="p-1 hover:text-text-main rounded" title="Editar y reenviar" aria-label="Editar mensaje">
                                        <Pencil size={12} />
                                    </button>
                                )}
                                {onRegenerate && (
                                    <button onClick={onRegenerate} className="p-1 hover:text-text-main rounded" title="Generar de nuevo" aria-label="Generar de nuevo">
                                        <RefreshCw size={12} />
                                    </button>
                                )}
                            </span>
                        )}
                        {msg.content && msg.role !== 'system' && (
                            <span className="flex items-center gap-1 opacity-100 md:opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100 transition-opacity">
                                <button onClick={() => onCopy(msg)} className="p-1 hover:text-text-main rounded" title="Copiar">
                                    <Copy size={12} />
                                </button>
                                <button onClick={() => onShare(msg)} className="p-1 hover:text-text-main rounded" title="Compartir">
                                    <Share2 size={12} />
                                </button>
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
