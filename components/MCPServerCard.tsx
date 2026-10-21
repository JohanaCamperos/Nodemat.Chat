import React, { useState } from 'react';
import {
    AlertCircle, CheckCircle2, ChevronDown, Globe, Key, Lock, Plug, Plus, Power, RefreshCw, Server, ShieldCheck, Terminal, Trash2, Wrench, X
} from 'lucide-react';
import { MCPAuthType, MCPServer, MCPTransport } from '../types';
import { SecretInput } from './SecretInput';
import { redirectUri } from '../services/mcpOAuth';

interface Props {
    server: MCPServer;
    index: number;
    update: (patch: Partial<MCPServer>) => void;
    onConnect: () => void;
    /** Abre la ventana de OAuth (debe llamarse directo desde el clic) y luego conecta */
    onAuthorize: () => void;
    onCancel: () => void;
    onDisconnect: () => void;
    onRemove: () => void;
    onToggleTool: (toolName: string) => void;
}

const inputCls = "w-full p-2 text-sm border border-border bg-background text-text-main rounded-lg outline-none focus:ring-2 focus:ring-primary disabled:opacity-60";
const labelCls = "block text-xs font-medium text-text-muted mb-1 uppercase flex items-center gap-1";

/** Configuración, estado y herramientas de un servidor MCP. */
export const MCPServerCard: React.FC<Props> = ({ server, index, update, onConnect, onAuthorize, onCancel, onDisconnect, onRemove, onToggleTool }) => {
    const [showOAuthOptions, setShowOAuthOptions] = useState(false);
    const [showHeaders, setShowHeaders] = useState((server.headers?.length || 0) > 0);
    const [showLog, setShowLog] = useState(false);

    const locked = server.status === 'connected' || server.status === 'loading';
    const isStdio = server.transport === 'stdio';
    const headers = server.headers || [];
    const oauth = server.oauth || {};
    const authorized = !!oauth.accessToken;

    const setHeader = (i: number, patch: Partial<{ name: string; value: string }>) =>
        update({ headers: headers.map((h, j) => j === i ? { ...h, ...patch } : h) });

    return (
        <div className="bg-surface p-4 rounded-xl space-y-4 border border-border shadow-sm">
            <div className="flex justify-between items-start gap-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    {isStdio ? <Terminal size={14} className="shrink-0 text-text-muted" /> : <Server size={14} className="shrink-0 text-text-muted" />}
                    <input
                        value={server.name || ''}
                        onChange={e => update({ name: e.target.value })}
                        placeholder={server.serverInfo?.title || server.serverInfo?.name || `Servidor #${index + 1}`}
                        className="font-bold text-sm text-text-main bg-transparent outline-none min-w-0 flex-1 placeholder:text-text-main"
                        title="Nombre (opcional)"
                        aria-label="Nombre del servidor"
                    />
                    {server.status === 'connected' && <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="Conectado" />}
                </div>
                <button onClick={onRemove} className="text-text-muted hover:text-red-500" title="Quitar servidor" aria-label="Quitar servidor">
                    <Trash2 size={16} />
                </button>
            </div>

            {/* Transporte y destino */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="md:w-56">
                    <label className={labelCls}>Transporte</label>
                    <select value={server.transport} disabled={locked} onChange={e => update({ transport: e.target.value as MCPTransport })} className={inputCls}>
                        <option value="auto">Auto (recomendado)</option>
                        <option value="http-stream">Streamable HTTP (/mcp)</option>
                        <option value="sse">SSE legacy (/sse)</option>
                        <option value="stdio">Comando local (stdio)</option>
                    </select>
                </div>
                {!isStdio && (
                    <div className="flex-1">
                        <label className={labelCls}><Globe size={12} /> URL</label>
                        <input type="text" value={server.url} disabled={locked} onChange={e => update({ url: e.target.value })}
                            placeholder="https://servidor.com/mcp" className={`${inputCls} font-mono`} />
                    </div>
                )}
            </div>

            {isStdio && (
                <div className="space-y-3 bg-surface-highlight/30 p-3 rounded-lg border border-border/50">
                    <p className="text-xs text-text-muted">
                        Nodemat lanza el comando en <strong>tu máquina</strong> y le habla por stdin/stdout. Sólo funciona con Nodemat
                        corriendo en local (<code>npm run dev</code> o <code>npm start</code>), no en Vercel. Es ejecutar un programa:
                        usa sólo servidores en los que confíes.
                    </p>
                    <div className="flex flex-col md:flex-row gap-3">
                        <div className="md:w-40">
                            <label className={labelCls}>Comando</label>
                            <input value={server.stdio?.command || ''} disabled={locked} placeholder="npx"
                                onChange={e => update({ stdio: { args: '', env: '', ...server.stdio, command: e.target.value } })}
                                className={`${inputCls} font-mono`} />
                        </div>
                        <div className="flex-1">
                            <label className={labelCls}>Argumentos</label>
                            <input value={server.stdio?.args || ''} disabled={locked} placeholder="-y @modelcontextprotocol/server-filesystem C:\Documentos"
                                onChange={e => update({ stdio: { command: '', env: '', ...server.stdio, args: e.target.value } })}
                                className={`${inputCls} font-mono`} />
                        </div>
                    </div>
                    <div className="flex flex-col md:flex-row gap-3">
                        <div className="flex-1">
                            <label className={labelCls}><Key size={12} /> Variables de entorno (una por línea)</label>
                            <textarea value={server.stdio?.env || ''} disabled={locked} rows={2} placeholder={'GITHUB_TOKEN=ghp_...\nOTRA=valor'}
                                onChange={e => update({ stdio: { command: '', args: '', ...server.stdio, env: e.target.value } })}
                                className={`${inputCls} font-mono text-xs`} />
                        </div>
                        <div className="md:w-56">
                            <label className={labelCls}>Carpeta de trabajo</label>
                            <input value={server.stdio?.cwd || ''} disabled={locked} placeholder="(opcional)"
                                onChange={e => update({ stdio: { command: '', args: '', env: '', ...server.stdio, cwd: e.target.value } })}
                                className={`${inputCls} font-mono`} />
                        </div>
                    </div>
                </div>
            )}

            {/* Autenticación */}
            {!isStdio && (
                <div className="space-y-3 bg-surface-highlight/30 p-3 rounded-lg border border-border/50">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="md:w-56">
                            <label className={labelCls}><Lock size={12} /> Autenticación</label>
                            <select value={server.authType} disabled={locked} onChange={e => update({ authType: e.target.value as MCPAuthType })} className={inputCls}>
                                <option value="none">Ninguna</option>
                                <option value="oauth">OAuth (iniciar sesión)</option>
                                <option value="bearer">Token Bearer</option>
                                <option value="api-key">API Key en un header</option>
                            </select>
                        </div>

                        {server.authType === 'api-key' && (
                            <div className="md:w-44">
                                <label className={labelCls}>Header</label>
                                <input type="text" placeholder="Authorization" value={server.authHeader || ''} disabled={locked}
                                    onChange={e => update({ authHeader: e.target.value })} className={`${inputCls} font-mono`}
                                    title="Vacío = 'Authorization: Bearer <key>'. Ej: X-API-Key" />
                            </div>
                        )}

                        {(server.authType === 'api-key' || server.authType === 'bearer') && (
                            <div className="flex-1">
                                <label className={labelCls}><Key size={12} /> {server.authType === 'bearer' ? 'Token' : 'Key'}</label>
                                <SecretInput value={server.authToken} disabled={locked} onChange={e => update({ authToken: e.target.value })} className={`${inputCls} font-mono`} />
                            </div>
                        )}

                        {server.authType === 'oauth' && (
                            <div className="flex-1 flex flex-col justify-end gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`text-xs flex items-center gap-1 ${authorized ? 'text-green-600' : 'text-text-muted'}`}>
                                        {authorized ? <><ShieldCheck size={14} /> Autorizado{oauth.expiresAt ? ` · vence ${new Date(oauth.expiresAt).toLocaleString()}` : ''}</> : 'Sin autorizar todavía'}
                                    </span>
                                    {!locked && (
                                        <button onClick={onAuthorize} className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary-hover">
                                            {authorized ? 'Volver a autorizar' : 'Autorizar y conectar'}
                                        </button>
                                    )}
                                    {authorized && !locked && (
                                        <button onClick={() => update({ oauth: { ...oauth, accessToken: undefined, refreshToken: undefined, expiresAt: undefined } })}
                                            className="text-xs text-red-500 hover:underline">Olvidar tokens</button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {server.authType === 'oauth' && (
                        <div>
                            <button onClick={() => setShowOAuthOptions(v => !v)} className="text-xs text-text-muted hover:text-text-main flex items-center gap-1">
                                Opciones de OAuth <ChevronDown size={12} className={`transition-transform ${showOAuthOptions ? 'rotate-180' : ''}`} />
                            </button>
                            {showOAuthOptions && (
                                <div className="mt-2 space-y-2 text-xs text-text-muted">
                                    <p>
                                        Normalmente no hace falta nada: Nodemat se registra solo en el servidor. Si el proveedor no lo permite
                                        (ej. GitHub), crea una aplicación OAuth con esta URL de retorno y carga su Client ID:
                                        <code className="block mt-1 p-1.5 bg-background rounded border border-border select-all break-all">{redirectUri()}</code>
                                    </p>
                                    <div className="flex flex-col md:flex-row gap-2">
                                        <input value={oauth.clientId || ''} disabled={locked} placeholder="Client ID (opcional)"
                                            onChange={e => update({ oauth: { ...oauth, clientId: e.target.value || undefined } })} className={`${inputCls} font-mono`} />
                                        <SecretInput value={oauth.clientSecret || ''} disabled={locked} placeholder="Client secret (si lo exige)"
                                            onChange={e => update({ oauth: { ...oauth, clientSecret: e.target.value || undefined } })} className={`${inputCls} font-mono`} />
                                        <input value={oauth.scope || ''} disabled={locked} placeholder="Scopes (opcional)"
                                            onChange={e => update({ oauth: { ...oauth, scope: e.target.value || undefined } })} className={`${inputCls} font-mono`} />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Headers extra */}
            {!isStdio && (
                <div>
                    <button onClick={() => setShowHeaders(v => !v)} className="text-xs text-text-muted hover:text-text-main flex items-center gap-1">
                        Headers adicionales {headers.length > 0 && `(${headers.length})`}
                        <ChevronDown size={12} className={`transition-transform ${showHeaders ? 'rotate-180' : ''}`} />
                    </button>
                    {showHeaders && (
                        <div className="mt-2 space-y-2">
                            {headers.map((h, i) => (
                                <div key={i} className="flex gap-2 items-center">
                                    <input value={h.name} disabled={locked} placeholder="X-Mi-Header" onChange={e => setHeader(i, { name: e.target.value })}
                                        className={`${inputCls} font-mono md:w-56`} />
                                    <SecretInput value={h.value} disabled={locked} placeholder="valor" onChange={e => setHeader(i, { value: e.target.value })}
                                        className={`${inputCls} font-mono`} />
                                    <button disabled={locked} onClick={() => update({ headers: headers.filter((_, j) => j !== i) })}
                                        className="p-1 text-text-muted hover:text-red-500 disabled:opacity-40" aria-label="Quitar header"><X size={16} /></button>
                                </div>
                            ))}
                            <button disabled={locked} onClick={() => update({ headers: [...headers, { name: '', value: '' }] })}
                                className="text-xs text-primary hover:underline flex items-center gap-1 disabled:opacity-40"><Plus size={12} /> Agregar header</button>
                        </div>
                    )}
                </div>
            )}

            {!isStdio && (
                <label className="flex items-start gap-2 text-xs text-text-muted cursor-pointer select-none">
                    <input type="checkbox" className="mt-0.5" checked={!!server.useProxy} disabled={locked} onChange={e => update({ useProxy: e.target.checked })} />
                    <span>
                        <strong className="text-text-main">Conectar vía proxy</strong> — evita el bloqueo CORS pasando por <code>/api/mcp</code> de esta app
                        (necesario para n8n Cloud y muchos servidores OAuth). El proxy no guarda nada; en Vercel sólo conecta con servidores https públicos.
                    </span>
                </label>
            )}

            {/* Acciones */}
            <div className="flex items-center gap-3 pt-1 flex-wrap">
                {server.status === 'connected' ? (
                    <button onClick={onDisconnect} className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg font-medium text-sm">
                        <Power size={16} /> Desconectar
                    </button>
                ) : server.status === 'loading' ? (
                    <>
                        <span className="flex items-center gap-2 px-4 py-2 bg-text-main text-text-inverted rounded-lg font-medium text-sm opacity-70">
                            <RefreshCw className="animate-spin" size={16} /> Conectando…
                        </span>
                        <button onClick={onCancel} className="text-xs text-text-muted hover:underline">Cancelar</button>
                    </>
                ) : (
                    <button onClick={server.authType === 'oauth' && !authorized && !isStdio ? onAuthorize : onConnect}
                        className="flex items-center gap-2 px-4 py-2 bg-text-main text-text-inverted hover:opacity-90 rounded-lg font-medium text-sm">
                        <Plug size={16} /> Conectar servidor
                    </button>
                )}
                {(server.connectionLog?.length || 0) > 0 && (
                    <button onClick={() => setShowLog(v => !v)} className="text-xs text-text-muted hover:text-text-main flex items-center gap-1 ml-auto">
                        Detalle de la conexión <ChevronDown size={12} className={`transition-transform ${showLog ? 'rotate-180' : ''}`} />
                    </button>
                )}
            </div>

            {showLog && (
                <pre className="text-[11px] font-mono text-text-muted bg-background border border-border rounded-lg p-2 whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {server.connectionLog?.join('\n')}
                </pre>
            )}

            {/* Información del handshake (educativo: qué se negoció) */}
            {server.status === 'connected' && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-muted bg-green-50/50 dark:bg-green-900/10 border border-green-200/60 dark:border-green-800/30 rounded-lg p-3">
                    {server.serverInfo && <span><strong className="text-text-main">{server.serverInfo.title || server.serverInfo.name}</strong>{server.serverInfo.version ? ` v${server.serverInfo.version}` : ''}</span>}
                    {server.resolvedTransport && <span>Transporte: <code>{server.resolvedTransport}</code></span>}
                    {server.protocolVersion && <span>Protocolo: <code>{server.protocolVersion}</code>{server.era && ` (${server.era === 'modern' ? 'moderno, sin sesión' : 'clásico, con sesión'})`}</span>}
                    {(server.resources?.length || server.resourceTemplates?.length) ? <span>{(server.resources?.length || 0) + (server.resourceTemplates?.length || 0)} recursos</span> : null}
                    {server.prompts?.length ? <span>{server.prompts.length} prompts</span> : null}
                    <label className="flex items-center gap-2 ml-auto cursor-pointer select-none">
                        <input type="checkbox" checked={!!server.autoApprove} onChange={e => update({ autoApprove: e.target.checked })} />
                        Ejecutar sin pedir confirmación
                    </label>
                </div>
            )}

            {server.status === 'error' && (
                <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 rounded-lg flex items-start gap-3 animate-in slide-in-from-top-2">
                    <AlertCircle className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" size={20} />
                    <div className="flex-1">
                        <h5 className="text-sm font-bold text-red-700 dark:text-red-300 mb-1">Error de conexión</h5>
                        <p className="text-sm text-red-600 dark:text-red-400 leading-relaxed whitespace-pre-wrap">{server.errorMessage}</p>
                    </div>
                </div>
            )}

            {/* Herramientas */}
            {server.status === 'connected' && server.tools.length > 0 && (
                <div className="p-4 bg-surface-highlight/50 rounded-xl border border-border animate-in fade-in">
                    <h5 className="font-semibold text-sm mb-3 flex items-center gap-2 text-text-main">
                        <Wrench size={16} className="text-primary" />
                        Herramientas ({server.enabledTools.length}/{server.tools.length})
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {server.tools.map(tool => {
                            const isEnabled = server.enabledTools.includes(tool.name);
                            return (
                                <button
                                    key={tool.name}
                                    onClick={() => onToggleTool(tool.name)}
                                    className={`p-3 rounded-lg border text-left transition-all hover:shadow-sm flex items-start gap-3 ${isEnabled ? 'bg-surface border-primary ring-1 ring-primary' : 'bg-background border-border hover:bg-surface'}`}
                                >
                                    <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${isEnabled ? 'bg-primary border-primary' : 'bg-transparent border-gray-400'}`}>
                                        {isEnabled && <CheckCircle2 size={12} className="text-white" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className={`text-sm font-bold truncate flex items-center gap-1.5 ${isEnabled ? 'text-primary' : 'text-text-main'}`}>
                                            <span className="truncate">{tool.title || tool.annotations?.title || tool.name}</span>
                                            {tool.annotations?.readOnlyHint && <span className="text-[9px] px-1.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 shrink-0">lectura</span>}
                                            {tool.annotations?.destructiveHint && !tool.annotations?.readOnlyHint && <span className="text-[9px] px-1.5 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 shrink-0">destructiva</span>}
                                        </div>
                                        <div className="text-xs text-text-muted line-clamp-2 leading-relaxed">{tool.description || 'Sin descripción.'}</div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
