/**
 * ============================================================================
 * MCP CLIENT - Cliente del Model Context Protocol para el navegador
 * ============================================================================
 *
 * Implementa el lado "cliente" del protocolo MCP (https://modelcontextprotocol.io)
 * sin dependencias externas, para que se pueda leer y entender de punta a punta.
 *
 * CICLO DE VIDA DE UNA CONEXIÓN MCP:
 *   1. initialize                 -> el cliente anuncia su versión y capacidades
 *   2. notifications/initialized  -> el cliente confirma que está listo
 *   3. tools/list (paginado)      -> descubrimos las herramientas
 *   4. tools/call                 -> ejecutamos herramientas cuando el LLM lo pide
 *
 * TRANSPORTES SOPORTADOS:
 *   - Streamable HTTP (spec 2025-03-26 y posteriores):
 *       Un único endpoint. Cada mensaje JSON-RPC es un POST. El servidor responde
 *       con `application/json` o con un stream `text/event-stream` (SSE) que
 *       contiene la respuesta. La sesión se identifica con el header
 *       `Mcp-Session-Id` que el servidor devuelve en `initialize`.
 *   - HTTP + SSE legacy (spec 2024-11-05):
 *       El cliente abre un GET de larga duración (SSE). El primer evento
 *       (`endpoint`) indica a qué URL hacer POST. Las respuestas llegan por el
 *       stream SSE, no por el POST.
 *   - "legacy-post": compatibilidad con servidores caseros que aceptan
 *       JSON-RPC por POST pero no implementan `initialize`.
 *
 * NOTA SOBRE CORS: al correr en el navegador, el servidor MCP debe permitir el
 * origen de la app y los headers `Content-Type`, `Authorization`,
 * `Mcp-Session-Id` y `MCP-Protocol-Version`, y exponer `Mcp-Session-Id`
 * (Access-Control-Expose-Headers) para que podamos leerlo.
 */

import { Attachment, MCPServer, MCPTool } from '../types';
import { bridgeHeaders, MCP_PROXY_PATH } from './bridge';

// ============================================================================
// CONSTANTES
// ============================================================================

const LATEST_PROTOCOL_VERSION = '2025-06-18';
const CLIENT_INFO = { name: 'nodemat-chat', title: 'Nodemat Chat', version: '1.1.0' };

const INIT_TIMEOUT_MS = 15_000;
const REQUEST_TIMEOUT_MS = 120_000;

// ============================================================================
// TIPOS
// ============================================================================

interface JsonRpcMessage {
    jsonrpc: '2.0';
    id?: number | string;
    method?: string;
    params?: any;
    result?: any;
    error?: { code: number; message: string; data?: any };
}

export interface MCPToolResult {
    /** Texto que se envía de vuelta al LLM */
    text: string;
    /** Imágenes devueltas por la herramienta (se muestran en la UI) */
    images: Attachment[];
    isError: boolean;
    raw: any;
}

export interface MCPConnectResult {
    tools: MCPTool[];
    serverInfo?: { name: string; version?: string };
    protocolVersion?: string;
    resolvedTransport: 'http-stream' | 'sse' | 'legacy-post';
    instructions?: string;
}

export class MCPError extends Error {
    constructor(message: string, public status?: number, public code?: number) {
        super(message);
        this.name = 'MCPError';
    }
}

// ============================================================================
// PARSER SSE (Server-Sent Events)
// ============================================================================

/**
 * Lee un ReadableStream con formato SSE y llama a `onEvent` por cada evento.
 * No usamos `EventSource` porque no permite enviar headers (Authorization).
 *
 * Formato SSE:
 *   event: message
 *   data: {"jsonrpc":"2.0",...}
 *   <línea vacía>  <- fin del evento
 */
export async function readSSE(
    body: ReadableStream<Uint8Array>,
    onEvent: (event: string, data: string) => boolean | void
): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventName = 'message';
    let dataLines: string[] = [];

    const dispatch = (): boolean => {
        if (dataLines.length === 0) { eventName = 'message'; return false; }
        const stop = onEvent(eventName, dataLines.join('\n'));
        eventName = 'message';
        dataLines = [];
        return stop === true;
    };

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let nl: number;
            while ((nl = buffer.search(/\r?\n/)) >= 0) {
                const line = buffer.slice(0, nl);
                buffer = buffer.slice(buffer[nl] === '\r' ? nl + 2 : nl + 1);

                if (line === '') {
                    if (dispatch()) { await reader.cancel().catch(() => { }); return; }
                } else if (line.startsWith(':')) {
                    // Comentario / keep-alive
                } else {
                    const idx = line.indexOf(':');
                    const field = idx >= 0 ? line.slice(0, idx) : line;
                    let val = idx >= 0 ? line.slice(idx + 1) : '';
                    if (val.startsWith(' ')) val = val.slice(1);
                    if (field === 'event') eventName = val;
                    else if (field === 'data') dataLines.push(val);
                }
            }
        }
        dispatch();
    } finally {
        reader.releaseLock?.();
    }
}

// ============================================================================
// UTILIDADES
// ============================================================================

function buildAuthHeaders(server: Pick<MCPServer, 'authType' | 'authToken' | 'authHeader'>): Record<string, string> {
    if (server.authType === 'none' || !server.authToken) return {};
    const headerName = server.authHeader?.trim();
    if (server.authType === 'api-key' && headerName && headerName.toLowerCase() !== 'authorization') {
        return { [headerName]: server.authToken };
    }
    const token = server.authToken.trim();
    return { Authorization: /^bearer\s/i.test(token) ? token : `Bearer ${token}` };
}

function withTimeout(signal: AbortSignal | undefined, ms: number): { signal: AbortSignal; cancel: () => void } {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new MCPError(`Tiempo de espera agotado (${Math.round(ms / 1000)}s)`)), ms);
    const onAbort = () => controller.abort(signal?.reason);
    if (signal) {
        if (signal.aborted) controller.abort(signal.reason);
        else signal.addEventListener('abort', onAbort, { once: true });
    }
    return {
        signal: controller.signal,
        cancel: () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
    };
}

/**
 * Convierte el `result` de tools/call (array de content blocks) en algo
 * que el LLM y la UI puedan consumir.
 */
export function parseToolResult(result: any): MCPToolResult {
    const texts: string[] = [];
    const images: Attachment[] = [];
    const content: any[] = Array.isArray(result?.content) ? result.content : [];

    content.forEach((block, i) => {
        switch (block?.type) {
            case 'text':
                texts.push(block.text ?? '');
                break;
            case 'image':
                if (block.data) {
                    const mime = block.mimeType || 'image/png';
                    images.push({ name: `tool-image-${i + 1}.${mime.split('/')[1] || 'png'}`, type: mime, data: `data:${mime};base64,${block.data}` });
                    texts.push(`[La herramienta devolvió una imagen (${mime}) que se muestra al usuario]`);
                }
                break;
            case 'audio':
                texts.push(`[La herramienta devolvió audio (${block.mimeType || 'desconocido'})]`);
                break;
            case 'resource': {
                const r = block.resource || {};
                if (typeof r.text === 'string') {
                    texts.push(`--- Recurso ${r.uri || ''} ---\n${r.text}`);
                } else if (r.blob && typeof r.mimeType === 'string' && r.mimeType.startsWith('image/')) {
                    images.push({ name: r.uri || `resource-${i + 1}`, type: r.mimeType, data: `data:${r.mimeType};base64,${r.blob}` });
                    texts.push(`[Recurso de imagen ${r.uri || ''}]`);
                } else {
                    texts.push(`[Recurso binario ${r.uri || ''} (${r.mimeType || 'desconocido'})]`);
                }
                break;
            }
            case 'resource_link':
                texts.push(`[Enlace a recurso: ${block.name || ''} ${block.uri || ''}]`.trim());
                break;
            default:
                if (block) texts.push(JSON.stringify(block));
        }
    });

    // structuredContent (spec 2025-06-18): útil cuando no vino texto
    if (texts.length === 0 && result?.structuredContent !== undefined) {
        texts.push(JSON.stringify(result.structuredContent, null, 2));
    }
    if (texts.length === 0 && content.length === 0 && result !== undefined) {
        texts.push(typeof result === 'string' ? result : JSON.stringify(result));
    }

    return { text: texts.join('\n'), images, isError: result?.isError === true, raw: result };
}

// ============================================================================
// CONEXIÓN
// ============================================================================

type Pending = { resolve: (v: any) => void; reject: (e: any) => void };

/**
 * Una conexión viva con un servidor MCP. Se guarda en memoria (no en
 * localStorage) y se re-crea automáticamente si la página se recarga.
 */
export class MCPConnection {
    private nextId = 1;
    private sessionId?: string;
    private protocolVersion?: string;
    private transport: 'http-stream' | 'sse' | 'legacy-post' = 'http-stream';

    // Solo para SSE legacy
    private sseAbort?: AbortController;
    private postEndpoint?: string;
    private pending = new Map<number | string, Pending>();

    public serverInfo?: { name: string; version?: string };
    public instructions?: string;
    /** true si la conexión murió (p. ej. el stream SSE se cortó) y hay que re-crearla */
    public closed = false;

    constructor(private server: MCPServer) { }

    get resolvedTransport() { return this.transport; }
    get negotiatedVersion() { return this.protocolVersion; }

    /**
     * fetch directo, o a través del proxy same-origin /api/mcp si el servidor
     * no permite CORS (caso típico: MCP Server Trigger de n8n Cloud).
     * El proxy recibe la URL real en el header x-mcp-target.
     */
    private http(url: string, init: RequestInit): Promise<Response> {
        if (!this.server.useProxy) return fetch(url, init);
        const headers = new Headers(init.headers);
        headers.set('x-mcp-target', url);
        Object.entries(bridgeHeaders()).forEach(([k, v]) => headers.set(k, v));
        return fetch(MCP_PROXY_PATH, { ...init, headers });
    }

    private baseHeaders(): Record<string, string> {
        const h: Record<string, string> = { 'Content-Type': 'application/json', ...buildAuthHeaders(this.server) };
        if (this.sessionId) h['Mcp-Session-Id'] = this.sessionId;
        if (this.protocolVersion && this.transport === 'http-stream') h['MCP-Protocol-Version'] = this.protocolVersion;
        return h;
    }

    // ------------------------------------------------------------------
    // Handshake
    // ------------------------------------------------------------------

    async connect(signal?: AbortSignal): Promise<void> {
        const order: Array<'http-stream' | 'sse'> =
            this.server.transport === 'sse' ? ['sse', 'http-stream'] : ['http-stream', 'sse'];

        let firstError: any;
        for (const t of order) {
            try {
                this.transport = t;
                if (t === 'sse') await this.openSSE(signal);
                await this.initialize(signal);
                return;
            } catch (e: any) {
                this.close();
                this.closed = false;
                if (signal?.aborted) throw e;   // cancelado por el usuario: no probar otro transporte
                // Servidor "casero" que no implementa initialize pero sí tools/list por POST
                if (e instanceof MCPError && e.code === -32601 && t === 'http-stream') {
                    this.transport = 'legacy-post';
                    this.protocolVersion = undefined;
                    return;
                }
                firstError = firstError || e;
                // Solo tiene sentido probar otro transporte si el error sugiere
                // "este endpoint no habla este transporte" (404/405/400/406/415, respuesta inválida)
                const retryable = e instanceof MCPError
                    ? (e.status === undefined || [400, 404, 405, 406, 415].includes(e.status))
                    : true;
                if (!retryable) throw e;
            }
        }
        throw firstError;
    }

    private async initialize(signal?: AbortSignal) {
        const result = await this.request('initialize', {
            protocolVersion: LATEST_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: CLIENT_INFO
        }, signal, INIT_TIMEOUT_MS);

        this.protocolVersion = result?.protocolVersion || LATEST_PROTOCOL_VERSION;
        this.serverInfo = result?.serverInfo;
        this.instructions = result?.instructions;

        await this.notify('notifications/initialized');
    }

    // ------------------------------------------------------------------
    // API pública
    // ------------------------------------------------------------------

    async listTools(signal?: AbortSignal): Promise<MCPTool[]> {
        const tools: MCPTool[] = [];
        let cursor: string | undefined;
        let pages = 0;
        do {
            const res = await this.request('tools/list', cursor ? { cursor } : {}, signal, INIT_TIMEOUT_MS);
            if (Array.isArray(res)) return res; // servidores no estándar
            tools.push(...(res?.tools || []));
            cursor = res?.nextCursor;
        } while (cursor && ++pages < 50);
        return tools;
    }

    async callTool(name: string, args: any, signal?: AbortSignal): Promise<MCPToolResult> {
        const res = await this.request('tools/call', { name, arguments: args ?? {} }, signal, REQUEST_TIMEOUT_MS);
        return parseToolResult(res);
    }

    close() {
        this.closed = true;
        this.sseAbort?.abort();
        this.sseAbort = undefined;
        this.pending.forEach(p => p.reject(new MCPError('Conexión cerrada')));
        this.pending.clear();
        if (this.sessionId && this.transport === 'http-stream') {
            // Best-effort: avisar al servidor que la sesión terminó
            this.http(this.server.url, { method: 'DELETE', headers: this.baseHeaders() }).catch(() => { });
        }
        this.sessionId = undefined;
    }

    // ------------------------------------------------------------------
    // JSON-RPC
    // ------------------------------------------------------------------

    private async notify(method: string, params?: any) {
        const msg: JsonRpcMessage = { jsonrpc: '2.0', method, ...(params ? { params } : {}) };
        if (this.transport === 'sse') {
            await this.postToSSEEndpoint(msg);
            return;
        }
        const res = await this.http(this.server.url, {
            method: 'POST',
            headers: { ...this.baseHeaders(), Accept: 'application/json, text/event-stream' },
            body: JSON.stringify(msg)
        });
        // 202 Accepted es la respuesta esperada; ignoramos el body
        res.body?.cancel().catch(() => { });
    }

    async request(method: string, params: any, signal?: AbortSignal, timeoutMs = REQUEST_TIMEOUT_MS, isRetry = false): Promise<any> {
        const id = this.nextId++;
        const msg: JsonRpcMessage = { jsonrpc: '2.0', id, method, params };
        const t = withTimeout(signal, timeoutMs);

        try {
            if (this.transport === 'sse') return await this.requestViaSSE(msg, t.signal);
            return await this.requestViaHTTP(msg, t.signal);
        } catch (e: any) {
            // Sesión expirada (spec: el servidor responde 404) -> re-inicializar una vez
            if (!isRetry && e instanceof MCPError && e.status === 404 && this.sessionId && method !== 'initialize') {
                this.sessionId = undefined;
                await this.initialize(signal);
                return this.request(method, params, signal, timeoutMs, true);
            }
            if (t.signal.aborted && t.signal.reason instanceof MCPError) throw t.signal.reason;
            throw e;
        } finally {
            t.cancel();
        }
    }

    // --- Streamable HTTP ---------------------------------------------------

    private async requestViaHTTP(msg: JsonRpcMessage, signal: AbortSignal): Promise<any> {
        const response = await this.http(this.server.url, {
            method: 'POST',
            headers: { ...this.baseHeaders(), Accept: 'application/json, text/event-stream' },
            body: JSON.stringify(msg),
            signal
        });

        const sid = response.headers.get('mcp-session-id');
        if (sid) this.sessionId = sid;

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new MCPError(`MCP Server Error (${response.status}): ${text.slice(0, 500)}`, response.status);
        }

        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('text/event-stream') && response.body) {
            let answer: JsonRpcMessage | undefined;
            await readSSE(response.body, (_event, data) => {
                let parsed: any;
                try { parsed = JSON.parse(data); } catch { return; }
                const list: JsonRpcMessage[] = Array.isArray(parsed) ? parsed : [parsed];
                for (const m of list) {
                    if (m.id === msg.id && (m.result !== undefined || m.error)) { answer = m; return true; }
                    if (m.method && m.id !== undefined) this.answerServerRequest(m);
                }
            });
            if (!answer) throw new MCPError('El servidor cerró el stream sin responder.');
            return this.unwrap(answer);
        }

        const text = await response.text();
        if (!text) throw new MCPError('Respuesta vacía del servidor MCP (Invalid response).');
        let parsed: any;
        try { parsed = JSON.parse(text); } catch { throw new MCPError('El servidor devolvió JSON inválido (Invalid response).'); }
        if (Array.isArray(parsed) && parsed.length && parsed[0]?.jsonrpc) {
            parsed = parsed.find((m: any) => m.id === msg.id) || parsed[0];
        }
        if (parsed?.jsonrpc) return this.unwrap(parsed);
        return parsed; // servidor no estándar que devuelve el resultado directo
    }

    /** El servidor puede hacernos preguntas (ej. `ping`). Respondemos lo mínimo. */
    private answerServerRequest(m: JsonRpcMessage) {
        const reply: JsonRpcMessage = m.method === 'ping'
            ? { jsonrpc: '2.0', id: m.id, result: {} }
            : { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: `Nodemat no soporta '${m.method}'` } };
        if (this.transport === 'sse') this.postToSSEEndpoint(reply).catch(() => { });
        else this.http(this.server.url, { method: 'POST', headers: { ...this.baseHeaders(), Accept: 'application/json, text/event-stream' }, body: JSON.stringify(reply) }).catch(() => { });
    }

    private unwrap(m: JsonRpcMessage) {
        if (m.error) throw new MCPError(m.error.message || 'Error JSON-RPC', undefined, m.error.code);
        return m.result;
    }

    // --- SSE legacy --------------------------------------------------------

    private openSSE(signal?: AbortSignal): Promise<void> {
        this.sseAbort = new AbortController();
        this.postEndpoint = undefined;
        const abort = this.sseAbort;
        const t = withTimeout(signal, INIT_TIMEOUT_MS);
        // Propagar el motivo (MCPError de timeout) para que el mensaje sea claro
        t.signal.addEventListener('abort', () => { if (!this.postEndpoint) abort.abort(t.signal.reason); }, { once: true });

        return new Promise<void>((resolve, reject) => {
            let settled = false;
            const fail = (e: any) => { if (!settled) { settled = true; t.cancel(); reject(e); } };

            this.http(this.server.url, {
                method: 'GET',
                headers: { Accept: 'text/event-stream', ...buildAuthHeaders(this.server) },
                signal: abort.signal
            }).then(async (res) => {
                if (!res.ok || !res.body) {
                    fail(new MCPError(`SSE: el servidor respondió ${res.status}`, res.status));
                    return;
                }
                if (!(res.headers.get('content-type') || '').includes('text/event-stream')) {
                    fail(new MCPError('SSE: la URL no devuelve text/event-stream', 406));
                    return;
                }
                await readSSE(res.body, (event, data) => {
                    if (event === 'endpoint') {
                        this.postEndpoint = new URL(data.trim(), this.server.url).toString();
                        if (!settled) { settled = true; t.cancel(); resolve(); }
                        return;
                    }
                    let parsed: any;
                    try { parsed = JSON.parse(data); } catch { return; }
                    (Array.isArray(parsed) ? parsed : [parsed]).forEach((m: JsonRpcMessage) => {
                        if (m.id !== undefined && this.pending.has(m.id) && (m.result !== undefined || m.error)) {
                            const p = this.pending.get(m.id)!;
                            this.pending.delete(m.id);
                            m.error ? p.reject(new MCPError(m.error.message, undefined, m.error.code)) : p.resolve(m.result);
                        } else if (m.method && m.id !== undefined) {
                            this.answerServerRequest(m);
                        }
                    });
                });
                // Stream cerrado
                fail(new MCPError('SSE: el servidor cerró la conexión antes de anunciar el endpoint.'));
                this.pending.forEach(p => p.reject(new MCPError('Conexión SSE cerrada por el servidor')));
                this.pending.clear();
                // Sólo si este stream sigue siendo el vigente (no uno ya cerrado a propósito)
                if (this.sseAbort === abort) {
                    this.postEndpoint = undefined;
                    this.closed = true;   // callServerTool la re-creará en la próxima llamada
                }
            }).catch((e) => {
                if (settled && this.sseAbort === abort) this.closed = true;
                fail(abort.signal.reason instanceof MCPError ? abort.signal.reason : e);
            });
        });
    }

    private async postToSSEEndpoint(msg: JsonRpcMessage, signal?: AbortSignal) {
        if (!this.postEndpoint) throw new MCPError('SSE: sin endpoint de mensajes');
        const res = await this.http(this.postEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...buildAuthHeaders(this.server) },
            body: JSON.stringify(msg),
            signal
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new MCPError(`MCP Server Error (${res.status}): ${text.slice(0, 500)}`, res.status);
        }
        res.body?.cancel().catch(() => { });
    }

    private requestViaSSE(msg: JsonRpcMessage, signal: AbortSignal): Promise<any> {
        return new Promise((resolve, reject) => {
            const id = msg.id!;
            const onAbort = () => { this.pending.delete(id); reject(signal.reason || new DOMException('Aborted', 'AbortError')); };
            signal.addEventListener('abort', onAbort, { once: true });
            this.pending.set(id, {
                resolve: (v) => { signal.removeEventListener('abort', onAbort); resolve(v); },
                reject: (e) => { signal.removeEventListener('abort', onAbort); reject(e); }
            });
            this.postToSSEEndpoint(msg, signal).catch((e) => { this.pending.delete(id); reject(e); });
        });
    }
}

// ============================================================================
// REGISTRO DE CONEXIONES (en memoria)
// ============================================================================

const connections = new Map<string, MCPConnection>();

/** Conecta (o reconecta) un servidor, descubre sus herramientas y deja la conexión viva. */
export async function connectServer(server: MCPServer, signal?: AbortSignal): Promise<MCPConnectResult> {
    disconnectServer(server.id);
    const conn = new MCPConnection(server);
    await conn.connect(signal);
    const tools = await conn.listTools(signal);
    connections.set(server.id, conn);
    return {
        tools,
        serverInfo: conn.serverInfo,
        protocolVersion: conn.negotiatedVersion,
        resolvedTransport: conn.resolvedTransport,
        instructions: conn.instructions
    };
}

export function disconnectServer(serverId: string) {
    connections.get(serverId)?.close();
    connections.delete(serverId);
}

/**
 * Ejecuta una herramienta. Si la conexión no existe (p. ej. se recargó la
 * página) la re-establece de forma transparente.
 */
export async function callServerTool(server: MCPServer, toolName: string, args: any, signal?: AbortSignal): Promise<MCPToolResult> {
    let conn = connections.get(server.id);
    if (!conn || conn.closed) {
        conn = new MCPConnection(server);
        await conn.connect(signal);
        connections.set(server.id, conn);
    }
    return conn.callTool(toolName, args, signal);
}

// ============================================================================
// ERRORES AMIGABLES
// ============================================================================

export const getFriendlyMCPError = (error: any): string => {
    const msg: string = error?.message || String(error);

    // Errores del propio proxy /api/mcp: ya vienen explicados
    const jsonStart = msg.indexOf('{"error"');
    if (jsonStart >= 0) {
        try {
            const proxyError = JSON.parse(msg.slice(jsonStart)).error;
            if (typeof proxyError === 'string' && proxyError.startsWith('Proxy MCP')) return `🛡️ ${proxyError}`;
        } catch { /* mensaje truncado: seguir con las reglas genéricas */ }
    }
    if (/MCP Server Error \(404\)/.test(msg) && /<html|NOT_FOUND|The page could not be found/i.test(msg)) {
        return "🔌 No se encontró el proxy /api/mcp. Sólo existe cuando la app corre en Vercel o con `npm run dev`.";
    }

    if (/Failed to fetch|NetworkError|ECONNREFUSED|Load failed/i.test(msg)) {
        return "⚠️ No pudimos comunicarnos con tu servidor.\n\n" +
            "Lo más probable es CORS: el servidor no permite conexiones desde el navegador.\n" +
            "👉 Activa \"Conectar vía proxy\" en este servidor (necesario para n8n Cloud).\n\n" +
            "Otras causas:\n" +
            "1. ¿El servidor está corriendo y la URL es correcta? (Streamable HTTP suele terminar en /mcp; SSE legacy en /sse)\n" +
            "2. Si la app está en HTTPS, el navegador bloquea servidores http:// que no sean localhost.";
    }
    if (/Tiempo de espera/i.test(msg)) return `⏱️ ${msg}. El servidor no respondió a tiempo.`;
    if (/\b401\b|\b403\b/.test(msg)) return "🔒 Acceso denegado. Revisa el token / API key y el tipo de autenticación.";
    if (/\b404\b/.test(msg)) return "🔍 Endpoint no encontrado. Prueba con la URL terminada en /mcp (Streamable HTTP) o /sse (SSE legacy).";
    if (/\b405\b|\b406\b/.test(msg)) return "↔️ El servidor no acepta este transporte. Cambia a 'Auto' o prueba con la otra URL (/mcp o /sse).";
    if (/\b5\d\d\b/.test(msg)) return "💥 El servidor tuvo un problema interno.\n\nDetalle: " + msg;
    if (/JSON|Invalid response/i.test(msg)) return "🤔 El servidor devolvió una respuesta que no es JSON-RPC válido.";

    return `Ocurrió un error inesperado: "${msg}".`;
};
