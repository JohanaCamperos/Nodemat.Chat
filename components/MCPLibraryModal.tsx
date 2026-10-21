import React, { useMemo, useState } from 'react';
import { BookOpen, FileText, MessageSquareText, RefreshCw, Search, X } from 'lucide-react';
import { Attachment, MCPPrompt, MCPServer } from '../types';
import { getServerPrompt, readServerResource, resourceToAttachment } from '../services/mcpClient';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    servers: MCPServer[];
    /** Inserta el resultado en el compositor del chat */
    onInsert: (text: string, attachments: Attachment[]) => void;
}

type Selected =
    | { kind: 'prompt'; server: MCPServer; prompt: MCPPrompt }
    | { kind: 'template'; server: MCPServer; uriTemplate: string; name: string };

const label = (s: MCPServer) => s.name || s.serverInfo?.title || s.serverInfo?.name || s.url;

/** Variables de una plantilla de URI (RFC 6570, lo básico): {nombre} */
const templateVars = (t: string) => [...t.matchAll(/\{[+#./;?&]?([^}]+)\}/g)].flatMap(m => m[1].split(',').map(v => v.replace(/\*$/, '')));
const fillTemplate = (t: string, vals: Record<string, string>) =>
    t.replace(/\{([+#./;?&]?)([^}]+)\}/g, (_m, op, names: string) =>
        names.split(',').map(n => (op === '+' ? vals[n.replace(/\*$/, '')] : encodeURIComponent(vals[n.replace(/\*$/, '')] || ''))).join(','));

/**
 * Prompts y recursos que ofrecen los servidores MCP conectados.
 * EDUCATIVO: las herramientas las usa el MODELO; los prompts y recursos los
 * elige el USUARIO para darle contexto a la conversación.
 */
export const MCPLibraryModal: React.FC<Props> = ({ isOpen, onClose, servers, onInsert }) => {
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<Selected | null>(null);
    const [args, setArgs] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');

    const connected = useMemo(() => servers.filter(s => s.status === 'connected'), [servers]);
    if (!isOpen) return null;

    const q = query.trim().toLowerCase();
    const match = (...xs: (string | undefined)[]) => !q || xs.some(x => x?.toLowerCase().includes(q));

    const run = async (key: string, fn: () => Promise<void>) => {
        setBusy(key);
        setError('');
        try { await fn(); } catch (e: any) { setError(e?.message || String(e)); } finally { setBusy(''); }
    };

    const close = () => { setSelected(null); setArgs({}); setError(''); onClose(); };

    const applyPrompt = (server: MCPServer, prompt: MCPPrompt, values: Record<string, string>) => run(`p:${prompt.name}`, async () => {
        const res = await getServerPrompt(server, prompt.name, values);
        const texts: string[] = [];
        const atts: Attachment[] = [];
        (res.messages || []).forEach((m: any, i: number) => {
            const c = m.content || {};
            if (c.type === 'text') texts.push(c.text);
            else if (c.type === 'image' && c.data) atts.push({ name: `prompt-imagen-${i + 1}.png`, type: c.mimeType || 'image/png', data: `data:${c.mimeType || 'image/png'};base64,${c.data}` });
            else if (c.type === 'resource' && c.resource) {
                const a = resourceToAttachment(c.resource, `recurso-${i + 1}`);
                if (a) atts.push(a);
            }
        });
        onInsert(texts.join('\n\n'), atts);
        close();
    });

    const applyResource = (server: MCPServer, uri: string) => run(`r:${uri}`, async () => {
        const atts = await readServerResource(server, uri);
        if (!atts.length) throw new Error('El recurso vino vacío.');
        onInsert('', atts);
        close();
    });

    const pick = (sel: Selected) => {
        const needsForm = sel.kind === 'template' || (sel.prompt.arguments?.length || 0) > 0;
        if (!needsForm && sel.kind === 'prompt') { applyPrompt(sel.server, sel.prompt, {}); return; }
        setArgs({});
        setSelected(sel);
    };

    const fields = selected?.kind === 'prompt'
        ? (selected.prompt.arguments || []).map(a => ({ name: a.name, description: a.description, required: !!a.required }))
        : selected ? templateVars(selected.uriTemplate).map(n => ({ name: n, description: undefined, required: true })) : [];

    const submit = () => {
        if (!selected) return;
        const missing = fields.filter(f => f.required && !args[f.name]?.trim()).map(f => f.name);
        if (missing.length) { setError(`Completa: ${missing.join(', ')}`); return; }
        if (selected.kind === 'prompt') applyPrompt(selected.server, selected.prompt, args);
        else applyResource(selected.server, fillTemplate(selected.uriTemplate, args));
    };

    const itemCls = "w-full text-left p-3 rounded-lg border border-border bg-background hover:bg-surface-highlight transition-colors flex items-start gap-3 disabled:opacity-60";

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm p-4" onClick={close}>
            <div className="bg-surface rounded-2xl w-full max-w-2xl shadow-xl border border-border flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="mcp-lib-title">
                <div className="flex items-center justify-between p-5 border-b border-border">
                    <h2 id="mcp-lib-title" className="text-lg font-bold text-text-main flex items-center gap-2"><BookOpen size={20} className="text-primary" /> Prompts y recursos MCP</h2>
                    <button onClick={close} className="text-text-muted hover:text-text-main" aria-label="Cerrar"><X size={20} /></button>
                </div>

                {selected ? (
                    <div className="p-5 space-y-3 overflow-y-auto">
                        <p className="text-sm font-semibold text-text-main">
                            {selected.kind === 'prompt' ? (selected.prompt.title || selected.prompt.name) : selected.name}
                        </p>
                        {selected.kind === 'prompt' && selected.prompt.description && <p className="text-xs text-text-muted">{selected.prompt.description}</p>}
                        {fields.map(f => (
                            <label key={f.name} className="block">
                                <span className="block text-xs font-semibold text-text-muted mb-1">{f.name}{f.required && ' *'}</span>
                                <input value={args[f.name] || ''} onChange={e => setArgs(a => ({ ...a, [f.name]: e.target.value }))}
                                    className="w-full p-2 text-sm border border-border bg-background text-text-main rounded-lg outline-none focus:ring-2 focus:ring-primary" />
                                {f.description && <span className="block text-[11px] text-text-muted mt-1">{f.description}</span>}
                            </label>
                        ))}
                        {error && <p className="text-xs text-red-500">{error}</p>}
                        <div className="flex justify-end gap-2">
                            <button onClick={() => { setSelected(null); setError(''); }} className="px-4 py-2 text-sm text-text-muted hover:text-text-main">Volver</button>
                            <button onClick={submit} disabled={!!busy} className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover flex items-center gap-2 disabled:opacity-60">
                                {busy && <RefreshCw size={14} className="animate-spin" />} Usar
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="p-5 space-y-5 overflow-y-auto">
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar…" autoFocus
                                className="w-full pl-9 p-2 text-sm border border-border bg-background text-text-main rounded-lg outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        {error && <p className="text-xs text-red-500">{error}</p>}
                        {connected.length === 0 && <p className="text-sm text-text-muted">No hay servidores MCP conectados.</p>}
                        {connected.map(server => {
                            const prompts = (server.prompts || []).filter(p => match(p.name, p.title, p.description));
                            const resources = (server.resources || []).filter(r => match(r.name, r.title, r.uri, r.description));
                            const templates = (server.resourceTemplates || []).filter(t => match(t.name, t.title, t.uriTemplate, t.description));
                            if (!prompts.length && !resources.length && !templates.length) return null;
                            return (
                                <section key={server.id} className="space-y-2">
                                    <h3 className="text-xs font-bold uppercase text-text-muted">{label(server)}</h3>
                                    {prompts.map(p => (
                                        <button key={`p-${p.name}`} className={itemCls} disabled={!!busy} onClick={() => pick({ kind: 'prompt', server, prompt: p })}>
                                            {busy === `p:${p.name}` ? <RefreshCw size={16} className="animate-spin text-primary mt-0.5" /> : <MessageSquareText size={16} className="text-primary mt-0.5 shrink-0" />}
                                            <span className="min-w-0">
                                                <span className="block text-sm font-medium text-text-main">{p.title || p.name} <span className="text-[10px] font-normal text-text-muted">prompt</span></span>
                                                {p.description && <span className="block text-xs text-text-muted line-clamp-2">{p.description}</span>}
                                            </span>
                                        </button>
                                    ))}
                                    {resources.map(r => (
                                        <button key={`r-${r.uri}`} className={itemCls} disabled={!!busy} onClick={() => applyResource(server, r.uri)}>
                                            {busy === `r:${r.uri}` ? <RefreshCw size={16} className="animate-spin text-primary mt-0.5" /> : <FileText size={16} className="text-text-muted mt-0.5 shrink-0" />}
                                            <span className="min-w-0">
                                                <span className="block text-sm font-medium text-text-main truncate">{r.title || r.name}</span>
                                                <span className="block text-[11px] text-text-muted font-mono truncate">{r.uri}</span>
                                                {r.description && <span className="block text-xs text-text-muted line-clamp-2">{r.description}</span>}
                                            </span>
                                        </button>
                                    ))}
                                    {templates.map(t => (
                                        <button key={`t-${t.uriTemplate}`} className={itemCls} disabled={!!busy} onClick={() => pick({ kind: 'template', server, uriTemplate: t.uriTemplate, name: t.title || t.name })}>
                                            <FileText size={16} className="text-text-muted mt-0.5 shrink-0" />
                                            <span className="min-w-0">
                                                <span className="block text-sm font-medium text-text-main truncate">{t.title || t.name} <span className="text-[10px] font-normal text-text-muted">plantilla</span></span>
                                                <span className="block text-[11px] text-text-muted font-mono truncate">{t.uriTemplate}</span>
                                            </span>
                                        </button>
                                    ))}
                                </section>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
