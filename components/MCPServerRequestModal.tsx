import React, { useEffect, useState } from 'react';
import { ExternalLink, MessageSquareText, RefreshCw, ServerCog } from 'lucide-react';
import { MCPServer } from '../types';

/** Un pedido que el servidor MCP le hace a Nodemat y que necesita al usuario. */
export interface PendingServerRequest {
    server: MCPServer;
    method: string;
    params: any;
    resolve: (result: any) => void;
    reject: (err: any) => void;
}

interface Props {
    request: PendingServerRequest | null;
    /** Genera la respuesta del modelo para sampling/createMessage */
    runSampling: (params: any) => Promise<any>;
    onDone: () => void;
}

const serverLabel = (s: MCPServer) => s.name || s.serverInfo?.title || s.serverInfo?.name || s.url;

const samplingText = (content: any): string => {
    const list = Array.isArray(content) ? content : [content];
    return list.map((c: any) => c?.type === 'text' ? c.text : `[${c?.type || 'contenido'}${c?.mimeType ? ` ${c.mimeType}` : ''}]`).join('\n');
};

/** Campo de formulario a partir de una propiedad del requestedSchema (elicitación). */
const Field: React.FC<{ name: string; schema: any; required: boolean; value: any; onChange: (v: any) => void }> = ({ name, schema, required, value, onChange }) => {
    const label = schema.title || name;
    const cls = "w-full p-2 text-sm border border-border bg-background text-text-main rounded-lg outline-none focus:ring-2 focus:ring-primary";
    const options: { value: string; label: string }[] | null =
        schema.enum ? schema.enum.map((v: string, i: number) => ({ value: v, label: schema.enumNames?.[i] || v }))
            : schema.oneOf ? schema.oneOf.map((o: any) => ({ value: o.const, label: o.title || o.const }))
                : null;

    return (
        <label className="block text-sm">
            <span className="block text-xs font-semibold text-text-muted mb-1">{label}{required && ' *'}</span>
            {schema.type === 'boolean' ? (
                <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />
            ) : options ? (
                <select className={cls} value={value ?? ''} onChange={e => onChange(e.target.value)}>
                    <option value="">—</option>
                    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            ) : (
                <input
                    className={cls}
                    type={schema.type === 'number' || schema.type === 'integer' ? 'number' : schema.format === 'email' ? 'email' : schema.format === 'date' ? 'date' : 'text'}
                    value={value ?? ''}
                    onChange={e => onChange(schema.type === 'number' || schema.type === 'integer' ? (e.target.value === '' ? undefined : Number(e.target.value)) : e.target.value)}
                />
            )}
            {schema.description && <span className="block text-[11px] text-text-muted mt-1">{schema.description}</span>}
        </label>
    );
};

/**
 * Sampling y elicitación: el servidor MCP le pide algo a Nodemat.
 * EDUCATIVO: en ambos casos el usuario tiene la última palabra.
 */
export const MCPServerRequestModal: React.FC<Props> = ({ request, runSampling, onDone }) => {
    const [values, setValues] = useState<Record<string, any>>({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        setValues({});
        setError('');
        setBusy(false);
        // Valores por defecto del formulario
        const props = request?.params?.requestedSchema?.properties || {};
        const defaults: Record<string, any> = {};
        Object.entries(props).forEach(([k, s]: [string, any]) => { if (s?.default !== undefined) defaults[k] = s.default; });
        setValues(defaults);
    }, [request]);

    if (!request) return null;
    const { server, method, params } = request;
    const finish = (fn: () => void) => { fn(); onDone(); };
    const isSampling = method === 'sampling/createMessage';
    const isUrlMode = !isSampling && params?.mode === 'url';
    const schema = params?.requestedSchema || {};
    const required: string[] = schema.required || [];

    const accept = async () => {
        setError('');
        if (isSampling) {
            setBusy(true);
            try {
                const result = await runSampling(params);
                finish(() => request.resolve(result));
            } catch (e: any) {
                setError(e?.message || String(e));
                setBusy(false);
            }
            return;
        }
        if (isUrlMode) {
            window.open(params.url, '_blank', 'noopener');
            finish(() => request.resolve({ action: 'accept' }));
            return;
        }
        const missing = required.filter(k => values[k] === undefined || values[k] === '');
        if (missing.length) { setError(`Completa: ${missing.join(', ')}`); return; }
        finish(() => request.resolve({ action: 'accept', content: values }));
    };

    const decline = () => finish(() =>
        isSampling ? request.reject(Object.assign(new Error('El usuario rechazó el pedido de sampling'), { code: -1 }))
            : request.resolve({ action: 'decline' }));

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[120] backdrop-blur-sm p-4">
            <div className="bg-surface rounded-2xl p-6 w-full max-w-lg shadow-xl border border-border space-y-4 max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true">
                <h2 className="text-lg font-bold text-text-main flex items-center gap-2">
                    {isSampling ? <MessageSquareText size={20} className="text-primary" /> : <ServerCog size={20} className="text-primary" />}
                    {isSampling ? 'El servidor pide usar tu modelo' : 'El servidor te pide datos'}
                </h2>
                <p className="text-xs text-text-muted">Servidor: <strong className="text-text-main">{serverLabel(server)}</strong></p>

                {isSampling ? (
                    <div className="space-y-2 text-sm">
                        <p className="text-text-muted text-xs">
                            Quiere que el modelo que tienes activo genere una respuesta a estos mensajes (consume tu cuota del proveedor).
                        </p>
                        {params?.systemPrompt && <pre className="text-xs whitespace-pre-wrap bg-background border border-border rounded-lg p-2 text-text-muted">{params.systemPrompt}</pre>}
                        <div className="max-h-60 overflow-y-auto space-y-2">
                            {(params?.messages || []).map((m: any, i: number) => (
                                <div key={i} className="text-xs bg-surface-highlight rounded-lg p-2">
                                    <span className="font-semibold text-text-main">{m.role === 'user' ? 'Usuario' : 'Asistente'}: </span>
                                    <span className="whitespace-pre-wrap text-text-main">{samplingText(m.content)}</span>
                                </div>
                            ))}
                        </div>
                        {params?.maxTokens && <p className="text-[11px] text-text-muted">Máximo {params.maxTokens} tokens.</p>}
                    </div>
                ) : isUrlMode ? (
                    <div className="space-y-2 text-sm text-text-main">
                        <p className="whitespace-pre-wrap">{params?.message}</p>
                        <p className="text-xs text-text-muted break-all flex items-center gap-1"><ExternalLink size={12} /> {params?.url}</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <p className="text-sm text-text-main whitespace-pre-wrap">{params?.message}</p>
                        {Object.entries(schema.properties || {}).map(([k, s]) => (
                            <Field key={k} name={k} schema={s} required={required.includes(k)} value={values[k]} onChange={v => setValues(prev => ({ ...prev, [k]: v }))} />
                        ))}
                        <p className="text-[11px] text-text-muted">No compartas contraseñas ni datos sensibles con servidores que no conozcas.</p>
                    </div>
                )}

                {error && <p className="text-xs text-red-500 whitespace-pre-wrap">{error}</p>}

                <div className="flex justify-end gap-2 pt-2">
                    {!isSampling && !isUrlMode && (
                        <button onClick={() => finish(() => request.resolve({ action: 'cancel' }))} disabled={busy} className="px-4 py-2 text-sm text-text-muted hover:text-text-main">Cancelar</button>
                    )}
                    <button onClick={decline} disabled={busy} className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-text-main hover:bg-surface-highlight">Rechazar</button>
                    <button onClick={accept} disabled={busy} className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover flex items-center gap-2 disabled:opacity-60">
                        {busy && <RefreshCw size={14} className="animate-spin" />}
                        {isSampling ? 'Generar y enviar' : isUrlMode ? 'Abrir enlace' : 'Enviar'}
                    </button>
                </div>
            </div>
        </div>
    );
};
