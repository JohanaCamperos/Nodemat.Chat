/**
 * ============================================================================
 * ANTHROPIC (CLAUDE) - Messages API desde el navegador
 * ============================================================================
 *
 * EDUCATIVO: la Messages API de Claude se parece a la de OpenAI pero cambia
 * en detalles importantes:
 *   - `system` va aparte, no como un mensaje más.
 *   - El contenido es una lista de bloques: text, image, document (PDF),
 *     tool_use (el modelo pide una herramienta), tool_result (la respuesta),
 *     y thinking (el razonamiento, que hay que devolver TAL CUAL en los
 *     turnos siguientes).
 *   - Los resultados de herramientas van en un mensaje de rol `user`, todos juntos.
 *   - `max_tokens` es obligatorio.
 *   - El streaming manda eventos tipados (message_start, content_block_delta…).
 *
 * Igual que con los demás proveedores, Nodemat habla con la API con fetch,
 * sin SDK, para que se vea cada campo. Para que el navegador pueda llamar
 * directo (CORS) hace falta el header `anthropic-dangerous-direct-browser-access`:
 * la key queda en el navegador, así que es para uso personal.
 */

import { readSSE } from './mcpClient';
import { bridgeHeaders, MCP_PROXY_PATH } from './bridge';

const API = 'https://api.anthropic.com/v1';

/** Modelos vigentes (si la lista de la API no se puede leer) */
export const ANTHROPIC_FALLBACK_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'];
export const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-5-5';

/** Modelos con fallback del lado del servidor ante un rechazo de los clasificadores de seguridad */
const SERVER_FALLBACK_MODELS = ['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5'];

/** Modelos con pensamiento adaptativo (4.6 en adelante, la familia 5 y Haiku 5.5) */
const supportsAdaptiveThinking = (model: string) =>
    /claude-(opus|sonnet|fable|mythos|haiku)-(5|4-[678])/.test(model);

function headers(key: string, betas: string[] = []): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        ...(betas.length ? { 'anthropic-beta': betas.join(',') } : {})
    };
}

/**
 * fetch directo; si el navegador no puede (red, extensión o CORS bloqueados),
 * reintenta por el proxy same-origin de la app.
 */
async function anthropicFetch(url: string, init: RequestInit): Promise<Response> {
    try {
        return await fetch(url, init);
    } catch (e: any) {
        if (e?.name === 'AbortError') throw e;
        const h = new Headers(init.headers);
        h.set('x-mcp-target', url);
        Object.entries(bridgeHeaders()).forEach(([k, v]) => h.set(k, v));
        return fetch(MCP_PROXY_PATH, { ...init, headers: h });
    }
}

export async function fetchAnthropicModels(key: string): Promise<string[]> {
    try {
        const res = await anthropicFetch(`${API}/models?limit=100`, { headers: headers(key) });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.data || []).map((m: any) => m.id).filter(Boolean);
    } catch {
        return [];
    }
}

// ----------------------------------------------------------------------------
// Del historial (formato estilo OpenAI) a la Messages API
// ----------------------------------------------------------------------------

const dataUrlParts = (url: string) => {
    const m = (url || '').match(/^data:([^;]+);base64,(.+)$/);
    return m ? { mediaType: m[1], data: m[2] } : null;
};

function toBlocks(content: any): any[] {
    if (typeof content === 'string') return content ? [{ type: 'text', text: content }] : [];
    if (!Array.isArray(content)) return [];
    const media: any[] = [];
    const texts: any[] = [];
    content.forEach((c: any) => {
        if (c.type === 'text' && c.text) texts.push({ type: 'text', text: c.text });
        else if (c.type === 'image_url') {
            const url = c.image_url?.url || '';
            const d = dataUrlParts(url);
            media.push(d ? { type: 'image', source: { type: 'base64', media_type: d.mediaType, data: d.data } } : { type: 'image', source: { type: 'url', url } });
        } else if (c.type === 'file') {
            const d = dataUrlParts(c.file?.file_data);
            if (d) media.push({ type: 'document', source: { type: 'base64', media_type: d.mediaType, data: d.data }, title: c.file?.filename });
        }
    });
    // Imágenes y documentos antes del texto: es lo que mejor funciona
    return [...media, ...texts];
}

/**
 * Bloques de un turno de Claude para devolverlos en el siguiente pedido.
 * Si hubo un fallback a mitad de la respuesta, lo anterior al último bloque
 * `fallback` que no sea texto no se reenvía (regla de la API).
 */
function echoBlocks(raw: any[]): any[] {
    const lastFallback = raw.map(b => b.type).lastIndexOf('fallback');
    return raw.filter((b, i) => {
        if (b.type === 'fallback') return false;
        if (i < lastFallback && ['thinking', 'redacted_thinking', 'tool_use', 'server_tool_use'].includes(b.type)) return false;
        return true;
    });
}

export function buildAnthropicRequest(apiMessages: any[], tools: any[], model: string, stream: boolean) {
    const messages: { role: 'user' | 'assistant'; content: any[] }[] = [];
    const push = (role: 'user' | 'assistant', blocks: any[]) => {
        if (!blocks.length) return;
        const last = messages[messages.length - 1];
        // Mensajes seguidos del mismo rol se unen (los tool_result siempre primero)
        if (last && last.role === role) last.content.push(...blocks);
        else messages.push({ role, content: blocks });
    };

    apiMessages.forEach(m => {
        if (m.role === 'system') return;
        if (m.role === 'tool') {
            push('user', [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content || '(sin contenido)' }]);
        } else if (m.role === 'assistant') {
            if (Array.isArray(m.anthropic_content) && m.anthropic_content.length) {
                push('assistant', echoBlocks(m.anthropic_content));
            } else {
                const blocks: any[] = m.content ? [{ type: 'text', text: m.content }] : [];
                (m.tool_calls || []).forEach((tc: any) => {
                    let input = {};
                    try { input = JSON.parse(tc.function.arguments || '{}'); } catch { /* vacío */ }
                    blocks.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
                });
                push('assistant', blocks);
            }
        } else {
            push('user', toBlocks(m.content));
        }
    });

    const system = apiMessages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const betas: string[] = [];
    const body: any = {
        model,
        // Con streaming no hay riesgo de timeout HTTP: se da margen amplio
        max_tokens: stream ? 64000 : 16000,
        ...(system ? { system } : {}),
        messages,
        ...(stream ? { stream: true } : {})
    };
    if (supportsAdaptiveThinking(model)) body.thinking = { type: 'adaptive', display: 'summarized' };
    if (tools.length) {
        body.tools = tools.map(t => ({
            name: t.function.name,
            description: t.function.description || '',
            input_schema: t.function.parameters || { type: 'object', properties: {} },
            // Con streaming, los argumentos llegan a medida que se escriben
            ...(stream ? { eager_input_streaming: true } : {})
        }));
    }
    // Si un clasificador de seguridad rechaza el pedido, la API lo reintenta con otro modelo
    if (SERVER_FALLBACK_MODELS.includes(model)) {
        body.fallbacks = 'default';
        betas.push('server-side-fallback-2026-07-01');
    }
    return { body, betas };
}

// ----------------------------------------------------------------------------
// Respuesta -> formato que entiende el resto de Nodemat
// ----------------------------------------------------------------------------

/** Convierte los bloques de Claude al objeto estilo OpenAI que ya parsea llmService. */
function toOpenAIShape(blocks: any[], meta: { id?: string; model?: string; usage?: any; stop_reason?: string; stop_details?: any }) {
    const lastFallback = blocks.map(b => b.type).lastIndexOf('fallback');
    const current = blocks.slice(lastFallback + 1);
    let text = blocks.filter(b => b.type === 'text').map(b => b.text).join('');
    const toolCalls = current.filter(b => b.type === 'tool_use').map(b => ({
        id: b.id, type: 'function', function: { name: b.name, arguments: typeof b.input === 'string' ? b.input : JSON.stringify(b.input ?? {}) }
    }));
    const reasoning = blocks.filter(b => b.type === 'thinking' && b.thinking).map(b => b.thinking).join('\n\n');
    if (meta.stop_reason === 'refusal' && !text) {
        text = `⚠️ Claude rechazó la solicitud${meta.stop_details?.category ? ` (categoría: ${meta.stop_details.category})` : ''}.` +
            (meta.stop_details?.explanation ? ` ${meta.stop_details.explanation}` : '');
    }
    if (meta.stop_reason === 'max_tokens') text += '\n\n_[Respuesta cortada: se alcanzó el máximo de tokens]_';
    const u = meta.usage || {};
    const input = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    return {
        id: meta.id,
        model: meta.model,
        stop_reason: meta.stop_reason,
        usage: { prompt_tokens: input, completion_tokens: u.output_tokens || 0, total_tokens: input + (u.output_tokens || 0) },
        choices: [{ message: { role: 'assistant', content: text, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) } }],
        /** Bloques originales: se devuelven tal cual en el turno siguiente (thinking incluido) */
        anthropic_content: blocks,
        reasoning: reasoning || undefined
    };
}

/** Junta los eventos del stream en la lista de bloques final. */
export async function collectAnthropicStream(body: ReadableStream<Uint8Array>, onDelta: (text: string) => void) {
    const blocks: any[] = [];
    const partialJson: Record<number, string> = {};
    const meta: { id?: string; model?: string; usage?: any; stop_reason?: string; stop_details?: any } = {};
    let text = '';
    let streamError: string | undefined;

    await readSSE(body, (_event, data) => {
        let ev: any;
        try { ev = JSON.parse(data); } catch { return; }
        switch (ev.type) {
            case 'message_start':
                meta.id = ev.message?.id;
                meta.model = ev.message?.model;
                meta.usage = { ...(ev.message?.usage || {}) };
                break;
            case 'content_block_start':
                blocks[ev.index] = { ...ev.content_block };
                if (ev.content_block?.type === 'tool_use') partialJson[ev.index] = '';
                break;
            case 'content_block_delta': {
                const b = blocks[ev.index];
                const d = ev.delta || {};
                if (!b) break;
                if (d.type === 'text_delta') { b.text = (b.text || '') + d.text; text += d.text; onDelta(text); }
                else if (d.type === 'thinking_delta') b.thinking = (b.thinking || '') + d.thinking;
                else if (d.type === 'signature_delta') b.signature = d.signature;
                else if (d.type === 'input_json_delta') partialJson[ev.index] += d.partial_json;
                break;
            }
            case 'content_block_stop': {
                const b = blocks[ev.index];
                if (b?.type === 'tool_use') {
                    const raw = partialJson[ev.index] || '{}';
                    // Con eager_input_streaming la API no valida el JSON: si vino roto, se pasa el texto
                    // tal cual y Nodemat le devuelve al modelo el error de argumentos inválidos
                    try { b.input = JSON.parse(raw); } catch { b.input = raw; }
                }
                break;
            }
            case 'message_delta':
                meta.stop_reason = ev.delta?.stop_reason ?? meta.stop_reason;
                meta.stop_details = ev.delta?.stop_details ?? meta.stop_details;
                meta.usage = { ...meta.usage, ...(ev.usage || {}) };
                break;
            case 'error':
                streamError = ev.error?.message || 'Error en el stream de Claude';
                return true;
        }
    });

    if (streamError) throw new Error(streamError);
    return toOpenAIShape(blocks.filter(Boolean), meta);
}

/** Llamada completa: arma el pedido, lo envía y devuelve la respuesta en formato común. */
export async function callAnthropic(key: string, model: string, apiMessages: any[], tools: any[], signal?: AbortSignal, onDelta?: (text: string) => void) {
    const stream = !!onDelta;
    const { body, betas } = buildAnthropicRequest(apiMessages, tools, model, stream);
    const res = await anthropicFetch(`${API}/messages`, { method: 'POST', headers: headers(key, betas), body: JSON.stringify(body), signal });

    if (!res.ok) {
        const text = await res.text();
        let msg = `API Error ${res.status}`;
        try { msg = JSON.parse(text).error?.message || msg; } catch { if (text) msg += `: ${text.slice(0, 300)}`; }
        throw new Error(msg);
    }
    if (stream && (res.headers.get('content-type') || '').includes('text/event-stream') && res.body) {
        return { data: await collectAnthropicStream(res.body, onDelta!), requestPayload: body };
    }
    const json = await res.json();
    return { data: toOpenAIShape(json.content || [], json), requestPayload: body };
}
