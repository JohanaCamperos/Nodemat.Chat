/**
 * ============================================================================
 * MCP CLIENT - Cliente del Model Context Protocol para el navegador
 * ============================================================================
 *
 * Implementa el lado "cliente" del protocolo MCP (https://modelcontextprotocol.io)
 * sin dependencias externas, para que se pueda leer y entender de punta a punta.
 *
 * DOS ERAS DEL PROTOCOLO (Nodemat habla las dos y detecta cuál usa cada servidor):
 *
 *   Moderna (2026-07-28, la vigente):
 *     1. server/discover            -> versiones, capacidades e identidad del servidor
 *     2. tools/list, resources/list, prompts/list (paginados)
 *     3. tools/call, resources/read, prompts/get
 *     Sin sesión: cada petición lleva en `_meta` versión, cliente y capacidades.
 *
 *   Clásica (2024-11-05 … 2025-11-25):
 *     1. initialize                 -> el cliente anuncia su versión y capacidades
 *     2. notifications/initialized  -> el cliente confirma que está listo
 *     3. y 4. igual que arriba, dentro de una sesión (Mcp-Session-Id)
 *
 * EL SERVIDOR TAMBIÉN PUEDE NECESITAR ALGO DE NOSOTROS:
 *   - sampling/createMessage  -> que NUESTRO modelo genere texto (con aprobación del usuario)
 *   - elicitation/create      -> datos del usuario (un formulario) o que abra una URL
 *   - roots/list              -> no exponemos carpetas: lista vacía
 *   En la era clásica llegan como pedidos del servidor; en la moderna, como una
 *   respuesta `input_required` y el cliente repite la petición con lo pedido (MRTR).
 * Y avisarnos: progreso de una herramienta, cambios en la lista de herramientas /
 * recursos / prompts (en la moderna, con subscriptions/listen).
 *
 * TRANSPORTES SOPORTADOS:
 *   - Streamable HTTP (spec 2025-03-26 y posteriores):
 *       Un único endpoint. Cada mensaje JSON-RPC es un POST. El servidor responde
 *       con `application/json` o con un stream `text/event-stream` (SSE) que
 *       contiene la respuesta. La sesión se identifica con el header
 *       `Mcp-Session-Id` que el servidor devuelve en `initialize`. Además el
 *       cliente puede abrir un GET (SSE) para recibir avisos espontáneos.
 *   - HTTP + SSE legacy (spec 2024-11-05):
 *       El cliente abre un GET de larga duración (SSE). El primer evento
 *       (`endpoint`) indica a qué URL hacer POST. Las respuestas llegan por el
 *       stream SSE, no por el POST.
 *   - stdio: el servidor es un comando local. El navegador no puede lanzar
 *       procesos, así que habla Streamable HTTP con el puente /api/mcp-stdio
 *       (server/stdioBridge.ts), que lanza el comando y traduce.
 *   - "legacy-post": compatibilidad con servidores caseros que aceptan
 *       JSON-RPC por POST pero no implementan `initialize`.
 *
 * NOTA SOBRE CORS: al correr en el navegador, el servidor MCP debe permitir el
 * origen de la app y los headers `Content-Type`, `Authorization`,
 * `Mcp-Session-Id` y `MCP-Protocol-Version`, y exponer `Mcp-Session-Id`
 * (Access-Control-Expose-Headers). Si no, usar "Conectar vía proxy".
 */

import { Attachment, MCPPrompt, MCPResource, MCPResourceTemplate, MCPServer, MCPTool } from '../types';
import { mcpFetch } from './mcpFetch';
import { MCPAuthRequiredError, oauthTokenExpired, parseWWWAuthenticate, refreshServerToken } from './mcpOAuth';

// ============================================================================
// CONSTANTES
// ============================================================================

/** Versión vigente de la spec (era moderna, sin handshake) */
export const MODERN_PROTOCOL_VERSION = '2026-07-28';
/** La última versión con handshake `initialize` */
export const LEGACY_PROTOCOL_VERSION = '2025-11-25';
/** Errores JSON-RPC que sólo usan servidores modernos (HeaderMismatch, capacidad faltante, versión no soportada) */
const MODERN_ERROR_CODES = [-32020, -32021, -32022];
const CLIENT_INFO = { name: 'nodemat-chat', title: 'Nodemat Chat', version: '1.2.0' };

/** Lo que Nodemat sabe hacer cuando el servidor le pregunta algo */
const CLIENT_CAPABILITIES = {
    roots: {},
    sampling: {},
    elicitation: { form: {}, url: {} }
};

export const STDIO_BRIDGE_PATH = '/api/mcp-stdio';

const INIT_TIMEOUT_MS = 20_000;
/** stdio: el primer mensaje incluye lanzar el proceso (y quizá que npx descargue el paquete) */
const STDIO_PROBE_TIMEOUT_MS = 60_000;
/** Sin noticias del servidor durante este tiempo => se corta. Cada aviso de progreso lo reinicia. */
const REQUEST_TIMEOUT_MS = 120_000;
const LISTEN_RETRIES = 5;

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
    /** Imágenes y archivos devueltos por la herramienta (se muestran en la UI) */
    attachments: Attachment[];
    isError: boolean;
    raw: any;
}

export interface MCPProgress {
    progress: number;
    total?: number;
    message?: string;
}

export interface MCPConnectResult {
    tools: MCPTool[];
    resources: MCPResource[];
    resourceTemplates: MCPResourceTemplate[];
    prompts: MCPPrompt[];
    serverInfo?: { name: string; title?: string; version?: string };
    protocolVersion?: string;
    resolvedTransport: 'http-stream' | 'sse' | 'legacy-post' | 'stdio';
    era: 'modern' | 'legacy';
    instructions?: string;
    capabilities?: Record<string, any>;
}

export class MCPError extends Error {
    constructor(message: string, public status?: number, public code?: number, public data?: any) {
        super(message);
        this.name = 'MCPError';
    }
}

/**
 * Ganchos que la app registra para lo que necesita interfaz o estado:
 * preguntarle al usuario, generar texto con el modelo, guardar tokens renovados…
 */
export interface MCPHooks {
    /** sampling/createMessage y elicitation/create. Debe devolver el `result` o lanzar. */
    onServerRequest?: (server: MCPServer, method: string, params: any) => Promise<any>;
    /** Avisos del servidor (list_changed, logging…) */
    onNotification?: (server: MCPServer, method: string, params: any) => void;
    /** Cambió algo del servidor que conviene guardar (p. ej. tokens OAuth renovados) */
    onServerUpdate?: (serverId: string, patch: Partial<MCPServer>) => void;
}

let hooks: MCPHooks = {};
export function setMCPHooks(h: MCPHooks) { hooks = h; }

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

function staticAuthHeaders(server: Pick<MCPServer, 'authType' | 'authToken' | 'authHeader'>): Record<string, string> {
    if (server.authType === 'none' || server.authType === 'oauth' || !server.authToken) return {};
    const headerName = server.authHeader?.trim();
    if (server.authType === 'api-key' && headerName && headerName.toLowerCase() !== 'authorization') {
        return { [headerName]: server.authToken };
    }
    const token = server.authToken.trim();
    return { Authorization: /^bearer\s/i.test(token) ? token : `Bearer ${token}` };
}

function customHeaders(server: MCPServer): Record<string, string> {
    const h: Record<string, string> = {};
    (server.headers || []).forEach(({ name, value }) => {
        const n = name.trim();
        if (n && /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(n)) h[n] = value;
    });
    return h;
}

/** Codifica la configuración stdio para el header del puente (base64 de UTF-8). */
function encodeStdioConfig(server: MCPServer): string {
    const json = JSON.stringify(server.stdio || {});
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin);
}

interface Deadline { signal: AbortSignal; cancel: () => void; touch: () => void; }

/** AbortSignal que vence a los `ms` sin actividad; `touch()` reinicia la cuenta. */
function withTimeout(signal: AbortSignal | undefined, ms: number): Deadline {
    const controller = new AbortController();
    const expire = () => controller.abort(new MCPError(`Tiempo de espera agotado (${Math.round(ms / 1000)}s sin respuesta)`));
    let timer = setTimeout(expire, ms);
    const onAbort = () => controller.abort(signal?.reason);
    if (signal) {
        if (signal.aborted) controller.abort(signal.reason);
        else signal.addEventListener('abort', onAbort, { once: true });
    }
    return {
        signal: controller.signal,
        cancel: () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); },
        touch: () => { clearTimeout(timer); timer = setTimeout(expire, ms); }
    };
}

const extOf = (mime: string) =>
    ({ 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'text/plain': 'txt', 'text/markdown': 'md', 'application/json': 'json' } as Record<string, string>)[mime]
    || mime.split('/')[1]?.split('+')[0] || 'bin';

/** Convierte el contenido de un recurso (resources/read o embebido) en un adjunto. */
export function resourceToAttachment(r: any, fallbackName: string): Attachment | null {
    const name = (r.uri ? decodeURIComponent(String(r.uri).split('/').pop() || '') : '') || fallbackName;
    const mime = r.mimeType || (typeof r.text === 'string' ? 'text/plain' : 'application/octet-stream');
    if (typeof r.text === 'string') {
        const type = mime.startsWith('text/') || mime === 'application/json' ? mime : 'text/plain';
        return { name: /\.\w+$/.test(name) ? name : `${name}.${extOf(type)}`, type, data: r.text, size: r.text.length };
    }
    if (typeof r.blob === 'string') return { name: /\.\w+$/.test(name) ? name : `${name}.${extOf(mime)}`, type: mime, data: `data:${mime};base64,${r.blob}`, size: Math.round(r.blob.length * 0.75) };
    return null;
}

/**
 * Convierte el `result` de tools/call (array de content blocks) en algo
 * que el LLM y la UI puedan consumir.
 */
export function parseToolResult(result: any): MCPToolResult {
    const texts: string[] = [];
    const attachments: Attachment[] = [];
    const content: any[] = Array.isArray(result?.content) ? result.content : [];

    content.forEach((block, i) => {
        switch (block?.type) {
            case 'text':
                texts.push(block.text ?? '');
                break;
            case 'image':
                if (block.data) {
                    const mime = block.mimeType || 'image/png';
                    attachments.push({ name: `tool-image-${i + 1}.${extOf(mime)}`, type: mime, data: `data:${mime};base64,${block.data}` });
                    texts.push(`[La herramienta devolvió una imagen (${mime})]`);
                }
                break;
            case 'audio':
                if (block.data) {
                    const mime = block.mimeType || 'audio/wav';
                    attachments.push({ name: `tool-audio-${i + 1}.${extOf(mime)}`, type: mime, data: `data:${mime};base64,${block.data}` });
                }
                texts.push(`[La herramienta devolvió audio (${block.mimeType || 'desconocido'}) que el usuario puede escuchar]`);
                break;
            case 'resource': {
                const r = block.resource || {};
                if (typeof r.text === 'string') {
                    texts.push(`--- Recurso ${r.uri || ''} ---\n${r.text}`);
                } else {
                    const att = resourceToAttachment(r, `resource-${i + 1}`);
                    if (att) attachments.push(att);
                    texts.push(`[Recurso ${r.uri || ''} (${r.mimeType || 'binario'}) adjuntado para el usuario]`);
                }
                break;
            }
            case 'resource_link':
                texts.push(`[Enlace a recurso: ${block.name || ''} ${block.uri || ''}${block.description ? ` — ${block.description}` : ''}]`.trim());
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

    return { text: texts.join('\n'), attachments, isError: result?.isError === true, raw: result };
}

// ============================================================================
// CONEXIÓN
// ============================================================================

type Pending = { resolve: (v: any) => void; reject: (e: any) => void };
type Transport = 'http-stream' | 'sse' | 'legacy-post';
type Era = 'modern' | 'legacy';

/** Métodos que en la era moderna pueden pedir más datos (MRTR) */
const MRTR_METHODS = ['tools/call', 'resources/read', 'prompts/get'];
const MAX_INPUT_ROUNDS = 8;

/** ¿Un error JSON-RPC que sólo emiten servidores modernos? */
const isModernError = (e: any) => e instanceof MCPError && e.code !== undefined && MODERN_ERROR_CODES.includes(e.code);

/** Valor de header seguro (spec 2026-07-28, "Value Encoding"): si no es ASCII plano, va en base64. */
export function headerValue(raw: string): string {
    const plain = /^[\x21-\x7E]([\x20-\x7E\t]*[\x21-\x7E])?$/.test(raw) && !/^=\?base64\?.*\?=$/.test(raw);
    if (plain) return raw;
    const bytes = new TextEncoder().encode(raw);
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return `=?base64?${btoa(bin)}?=`;
}

/**
 * `x-mcp-header` (spec 2026-07-28): el servidor puede pedir que ciertos
 * argumentos viajen también como header `Mcp-Param-{Nombre}`. Devuelve la
 * lista de (header, ruta) o null si la herramienta trae anotaciones inválidas.
 */
export function mcpParamHeaders(schema: any): { name: string; path: string[]; type: string }[] | null {
    const found: { name: string; path: string[]; type: string }[] = [];
    let invalid = false;
    const walk = (node: any, path: string[] | null) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(n => walk(n, null)); return; }
        if ('x-mcp-header' in node) {
            const name = node['x-mcp-header'];
            const types = Array.isArray(node.type) ? node.type : [node.type];
            if (!path || typeof name !== 'string' || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) ||
                !types.every((t: string) => ['string', 'integer', 'boolean'].includes(t)) ||
                found.some(f => f.name.toLowerCase() === name.toLowerCase())) invalid = true;
            else found.push({ name, path, type: types[0] });
        }
        Object.entries(node).forEach(([k, v]) => {
            if (k === 'properties' && v && typeof v === 'object' && path) {
                Object.entries(v as any).forEach(([prop, sub]) => walk(sub, [...path, prop]));
            } else if (k !== 'x-mcp-header') {
                walk(v, null);   // items, anyOf, $defs…: ya no es una ruta "estática"
            }
        });
    };
    walk(schema, []);
    return invalid ? null : found;
}

/**
 * Una conexión con un servidor MCP. Se guarda en memoria (no en localStorage)
 * y se re-crea automáticamente si la página se recarga.
 *
 * EDUCATIVO — DOS ERAS DEL PROTOCOLO:
 *   - Moderna (2026-07-28): no hay handshake ni sesión. Cada petición lleva en
 *     `_meta` la versión, quién es el cliente y qué sabe hacer. `server/discover`
 *     devuelve capacidades e identidad. Si el servidor necesita algo del usuario
 *     (sampling, elicitación) responde `resultType: "input_required"` y el cliente
 *     repite la petición con las respuestas (MRTR).
 *   - Clásica (hasta 2025-11-25): `initialize` abre una sesión (`Mcp-Session-Id`) y
 *     el servidor puede mandarnos pedidos por el mismo stream.
 * Nodemat prueba primero la moderna y, si el servidor no la entiende, vuelve a la clásica.
 */
export class MCPConnection {
    private nextId = 1;
    private sessionId?: string;
    private protocolVersion?: string;
    private transport: Transport = 'http-stream';
    private era: Era = 'legacy';

    // Solo para SSE legacy
    private sseAbort?: AbortController;
    private postEndpoint?: string;
    private pending = new Map<number | string, Pending>();

    // Stream de avisos (GET en la era clásica, subscriptions/listen en la moderna)
    private listenAbort?: AbortController;

    /** progressToken -> quién está esperando avisos de progreso */
    private progressListeners = new Map<string | number, (p: MCPProgress) => void>();
    /** Esquemas de las herramientas, para los headers Mcp-Param-* */
    private toolSchemas = new Map<string, any>();

    public serverInfo?: { name: string; title?: string; version?: string };
    public instructions?: string;
    public capabilities?: Record<string, any>;
    /** true si la conexión murió (p. ej. el stream SSE se cortó) y hay que re-crearla */
    public closed = false;

    constructor(private server: MCPServer, private log: (msg: string) => void = () => { }) { }

    get isStdio() { return this.server.transport === 'stdio'; }
    get resolvedTransport(): MCPConnectResult['resolvedTransport'] { return this.isStdio ? 'stdio' : this.transport; }
    get negotiatedVersion() { return this.protocolVersion; }
    get resolvedEra() { return this.era; }
    private get endpoint() { return this.isStdio ? STDIO_BRIDGE_PATH : this.server.url; }

    /** fetch directo, por el proxy /api/mcp, o al puente stdio. */
    private http(url: string, init: RequestInit): Promise<Response> {
        if (this.isStdio) {
            const headers = new Headers(init.headers);
            headers.set('x-mcp-stdio', encodeStdioConfig(this.server));
            return fetch(url, { ...init, headers });
        }
        return mcpFetch(this.server, url, init);
    }

    // ------------------------------------------------------------------
    // Autenticación
    // ------------------------------------------------------------------

    private async authHeaders(): Promise<Record<string, string>> {
        if (this.server.authType !== 'oauth') return staticAuthHeaders(this.server);
        if (oauthTokenExpired(this.server.oauth)) await this.refreshOAuth();
        const token = this.server.oauth?.accessToken;
        return token ? { Authorization: `Bearer ${token}` } : {};
    }

    private async refreshOAuth(): Promise<boolean> {
        const next = await refreshServerToken(this.server);
        if (!next) return false;
        this.server = { ...this.server, oauth: next };
        hooks.onServerUpdate?.(this.server.id, { oauth: next });
        this.log('Token OAuth renovado.');
        return true;
    }

    /** Headers de transporte. En la era moderna se repiten método, nombre y parámetros marcados. */
    private async headers(extra: Record<string, string> = {}, msg?: JsonRpcMessage): Promise<Record<string, string>> {
        const h: Record<string, string> = { 'Content-Type': 'application/json', ...customHeaders(this.server), ...(await this.authHeaders()), ...extra };
        // El puente stdio usa el id de sesión para saber a qué proceso hablar (en ambas eras)
        if (this.sessionId && (this.era === 'legacy' || this.isStdio)) h['Mcp-Session-Id'] = this.sessionId;
        if (this.protocolVersion && this.transport === 'http-stream') h['MCP-Protocol-Version'] = this.protocolVersion;
        if (this.era === 'modern' && msg?.method) {
            h['Mcp-Method'] = msg.method;
            const name = msg.params?.name ?? msg.params?.uri;
            if (typeof name === 'string' && MRTR_METHODS.includes(msg.method)) h['Mcp-Name'] = headerValue(name);
            if (msg.method === 'tools/call') {
                (mcpParamHeaders(this.toolSchemas.get(msg.params?.name)) || []).forEach(({ name: hn, path }) => {
                    const v = path.reduce((o: any, k) => (o == null ? undefined : o[k]), msg.params?.arguments);
                    if (v !== undefined && v !== null) h[`Mcp-Param-${hn}`] = headerValue(typeof v === 'boolean' ? String(v) : String(v));
                });
            }
        }
        return h;
    }

    /** 401: intenta renovar el token una vez; si no, avisa que hay que autorizar. */
    private async handleUnauthorized(res: Response, retried: boolean): Promise<boolean> {
        if (!retried && this.server.authType === 'oauth' && await this.refreshOAuth()) return true;
        const hint = parseWWWAuthenticate(res.headers.get('www-authenticate'));
        throw new MCPAuthRequiredError(
            this.server.authType === 'oauth'
                ? 'El servidor pide autorización OAuth (o el token venció). Pulsa "Autorizar".'
                : 'El servidor exige autenticación (401).',
            hint.resourceMetadata,
            hint.scope
        );
    }

    // ------------------------------------------------------------------
    // Conexión: era moderna primero, clásica si el servidor no la entiende
    // ------------------------------------------------------------------

    async connect(signal?: AbortSignal): Promise<void> {
        const tryModern = this.server.transport !== 'sse' && this.server.era !== 'legacy';
        if (tryModern && await this.discover(signal)) {
            this.log(`Conectado (era moderna, sin sesión): protocolo ${this.protocolVersion}, servidor ${this.serverInfo?.name || '¿?'}${this.serverInfo?.version ? ` v${this.serverInfo.version}` : ''}.`);
            if (!this.isStdio && !this.server.useProxy) this.subscribe();
            return;
        }
        await this.connectLegacy(signal);
    }

    /**
     * `server/discover`: si responde, el servidor es moderno. Cualquier otro error
     * (o silencio) indica un servidor clásico. Devuelve true si quedó en modo moderno.
     */
    private async discover(signal?: AbortSignal): Promise<boolean> {
        this.era = 'modern';
        this.transport = 'http-stream';
        this.protocolVersion = MODERN_PROTOCOL_VERSION;
        this.log(`Probando la era moderna (${MODERN_PROTOCOL_VERSION}) con server/discover${this.isStdio ? ' (vía puente local)' : ''}…`);
        try {
            const res = await this.request('server/discover', {}, { signal, timeoutMs: this.isStdio ? STDIO_PROBE_TIMEOUT_MS : INIT_TIMEOUT_MS });
            const versions: string[] = Array.isArray(res?.supportedVersions) ? res.supportedVersions : [];
            if (!versions.includes(MODERN_PROTOCOL_VERSION)) {
                this.log(`El servidor anuncia ${versions.join(', ') || 'ninguna versión'}: uso el handshake clásico.`);
                this.era = 'legacy';
                return false;
            }
            this.capabilities = res.capabilities || {};
            this.serverInfo = res._meta?.['io.modelcontextprotocol/serverInfo'];
            this.instructions = res.instructions;
            return true;
        } catch (e: any) {
            if (signal?.aborted || e instanceof MCPAuthRequiredError) throw e;
            if (e instanceof MCPError && e.code === -32022) {
                // Moderno, pero no habla nuestra versión: sólo nos sirve si ofrece una clásica
                const supported: string[] = e.data?.supported || [];
                this.log(`El servidor no soporta ${MODERN_PROTOCOL_VERSION} (ofrece ${supported.join(', ')}).`);
                if (!supported.some(v => v <= LEGACY_PROTOCOL_VERSION)) throw new MCPError(`Versión de protocolo incompatible: el servidor sólo acepta ${supported.join(', ')}.`);
            } else if (isModernError(e)) {
                throw e;
            } else {
                this.log('No respondió como servidor moderno: pruebo el handshake clásico (initialize).');
            }
            this.era = 'legacy';
            this.protocolVersion = undefined;
            return false;
        }
    }

    private async connectLegacy(signal?: AbortSignal): Promise<void> {
        this.era = 'legacy';
        const order: Transport[] = this.isStdio ? ['http-stream']
            : this.server.transport === 'sse' ? ['sse', 'http-stream'] : ['http-stream', 'sse'];

        let firstError: any;
        for (const t of order) {
            try {
                this.transport = t;
                this.protocolVersion = undefined;
                this.log(`Probando transporte ${this.isStdio ? 'stdio (vía puente local)' : t}…`);
                if (t === 'sse') await this.openSSE(signal);
                await this.initialize(signal);
                this.log(`Conectado (era clásica): protocolo ${this.protocolVersion}, servidor ${this.serverInfo?.name || '¿?'}${this.serverInfo?.version ? ` v${this.serverInfo.version}` : ''}.`);
                // Stream de avisos sólo en conexiones directas: por el proxy (Vercel corta a los 60 s)
                // o el puente stdio (mismo host que la app) ocuparía una de las 6 conexiones que el
                // navegador permite por servidor. En esos casos los avisos llegan con la próxima petición.
                if (t === 'http-stream' && !this.isStdio && !this.server.useProxy) this.listen();
                return;
            } catch (e: any) {
                this.log(`✗ ${e?.message || e}`);
                this.close();
                this.closed = false;
                if (signal?.aborted || e instanceof MCPAuthRequiredError) throw e;
                // Servidor "casero" que no implementa initialize pero sí tools/list por POST
                if (e instanceof MCPError && e.code === -32601 && t === 'http-stream') {
                    this.log('El servidor no implementa initialize: modo compatibilidad (sólo tools/list y tools/call).');
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
            protocolVersion: LEGACY_PROTOCOL_VERSION,
            capabilities: CLIENT_CAPABILITIES,
            clientInfo: CLIENT_INFO
        }, { signal, timeoutMs: this.isStdio ? STDIO_PROBE_TIMEOUT_MS : INIT_TIMEOUT_MS });

        this.protocolVersion = result?.protocolVersion || LEGACY_PROTOCOL_VERSION;
        this.serverInfo = result?.serverInfo;
        this.instructions = result?.instructions;
        this.capabilities = result?.capabilities || {};

        await this.notify('notifications/initialized');
    }

    // ------------------------------------------------------------------
    // API pública
    // ------------------------------------------------------------------

    private async listAll<T>(method: string, key: string, signal?: AbortSignal): Promise<T[]> {
        const items: T[] = [];
        let cursor: string | undefined;
        let pages = 0;
        do {
            const res = await this.request(method, cursor ? { cursor } : {}, { signal, timeoutMs: INIT_TIMEOUT_MS });
            if (Array.isArray(res)) return res; // servidores no estándar
            items.push(...(res?.[key] || []));
            cursor = res?.nextCursor;
        } while (cursor && ++pages < 50);
        return items;
    }

    async listTools(signal?: AbortSignal) {
        const tools = await this.listAll<MCPTool>('tools/list', 'tools', signal);
        // Spec 2026-07-28: una herramienta con `x-mcp-header` mal formado se descarta (sólo en HTTP)
        const valid = this.isStdio || this.era === 'legacy' ? tools : tools.filter(t => {
            if (mcpParamHeaders(t.inputSchema) !== null) return true;
            this.log(`⚠ Se descarta la herramienta "${t.name}": su x-mcp-header no es válido.`);
            return false;
        });
        this.toolSchemas = new Map(valid.map(t => [t.name, t.inputSchema]));
        return valid;
    }

    /** Recursos y prompts son opcionales: sólo si el servidor los anuncia. Los errores no cortan la conexión. */
    async listResources(signal?: AbortSignal) {
        if (!this.capabilities?.resources) return { resources: [] as MCPResource[], templates: [] as MCPResourceTemplate[] };
        const resources = await this.listAll<MCPResource>('resources/list', 'resources', signal).catch(() => []);
        const templates = await this.listAll<MCPResourceTemplate>('resources/templates/list', 'resourceTemplates', signal).catch(() => []);
        return { resources, templates };
    }

    async listPrompts(signal?: AbortSignal) {
        if (!this.capabilities?.prompts) return [] as MCPPrompt[];
        return this.listAll<MCPPrompt>('prompts/list', 'prompts', signal).catch(() => []);
    }

    async readResource(uri: string, signal?: AbortSignal): Promise<any[]> {
        const res = await this.request('resources/read', { uri }, { signal });
        return res?.contents || [];
    }

    async getPrompt(name: string, args: Record<string, string>, signal?: AbortSignal): Promise<{ description?: string; messages: any[] }> {
        return this.request('prompts/get', { name, arguments: args }, { signal });
    }

    async callTool(name: string, args: any, signal?: AbortSignal, onProgress?: (p: MCPProgress) => void): Promise<MCPToolResult> {
        const res = await this.request('tools/call', { name, arguments: args ?? {} }, { signal, onProgress });
        return parseToolResult(res);
    }

    close() {
        this.closed = true;
        this.sseAbort?.abort();
        this.sseAbort = undefined;
        this.listenAbort?.abort();
        this.listenAbort = undefined;
        this.pending.forEach(p => p.reject(new MCPError('Conexión cerrada')));
        this.pending.clear();
        if (this.sessionId && this.transport === 'http-stream') {
            // Best-effort: avisar al servidor que la sesión terminó (en stdio, mata el proceso)
            const sid = this.sessionId;
            this.headers().then(h => this.http(this.endpoint, { method: 'DELETE', headers: { ...h, 'Mcp-Session-Id': sid } })).catch(() => { });
        }
        this.sessionId = undefined;
    }

    // ------------------------------------------------------------------
    // JSON-RPC
    // ------------------------------------------------------------------

    /** `_meta` que la era moderna exige en CADA petición (no hay handshake que lo recuerde). */
    private modernMeta() {
        return {
            'io.modelcontextprotocol/protocolVersion': this.protocolVersion || MODERN_PROTOCOL_VERSION,
            'io.modelcontextprotocol/clientInfo': CLIENT_INFO,
            'io.modelcontextprotocol/clientCapabilities': CLIENT_CAPABILITIES
        };
    }

    private async send(msg: JsonRpcMessage) {
        if (this.transport === 'sse') return this.postToSSEEndpoint(msg);
        const res = await this.http(this.endpoint, {
            method: 'POST',
            headers: await this.headers({ Accept: 'application/json, text/event-stream' }),
            body: JSON.stringify(msg)
        });
        // 202 Accepted es la respuesta esperada; ignoramos el body
        res.body?.cancel().catch(() => { });
    }

    private async notify(method: string, params?: any) {
        await this.send({ jsonrpc: '2.0', method, ...(params ? { params } : {}) });
    }

    async request(
        method: string,
        params: any,
        opts: { signal?: AbortSignal; timeoutMs?: number; onProgress?: (p: MCPProgress) => void; round?: number } = {},
        isRetry = false
    ): Promise<any> {
        const id = this.nextId++;
        const t = withTimeout(opts.signal, opts.timeoutMs ?? REQUEST_TIMEOUT_MS);

        // Progreso: pedimos avisos y cada uno reinicia el tiempo de espera
        const meta: Record<string, any> = { ...(params?._meta || {}) };
        if (method !== 'initialize' && this.transport !== 'legacy-post') {
            meta.progressToken = id;
            this.progressListeners.set(id, (p) => { t.touch(); opts.onProgress?.(p); });
        }
        if (this.era === 'modern') Object.assign(meta, this.modernMeta());
        const sentParams = Object.keys(meta).length ? { ...params, _meta: meta } : params;
        const msg: JsonRpcMessage = { jsonrpc: '2.0', id, method, params: sentParams };

        let result: any;
        try {
            result = this.transport === 'sse' ? await this.requestViaSSE(msg, t.signal) : await this.requestViaHTTP(msg, t.signal);
        } catch (e: any) {
            if (!isRetry && e instanceof MCPError && e.status === 404 && this.sessionId && method !== 'initialize') {
                // Clásica: la sesión expiró (el servidor responde 404) -> re-inicializar una vez.
                // Moderna con stdio: el puente se reinició y perdió el proceso -> volver a descubrir.
                this.log('La sesión se perdió: reconectando…');
                this.sessionId = undefined;
                if (this.era === 'modern') await this.discover(opts.signal);
                else await this.initialize(opts.signal);
                return this.request(method, params, opts, true);
            }
            // 2025-11-25: "hace falta abrir una URL" llega como error -32042; se abre y se reintenta
            if (!isRetry && e instanceof MCPError && e.code === -32042 && Array.isArray(e.data?.elicitations) && hooks.onServerRequest) {
                for (const el of e.data.elicitations) await hooks.onServerRequest(this.server, 'elicitation/create', { mode: 'url', ...el });
                return this.request(method, params, opts, true);
            }
            if (t.signal.aborted && method !== 'initialize' && (this.era === 'legacy' || this.isStdio)) {
                // Avisar al servidor que ya no esperamos esta respuesta. En HTTP moderno basta
                // con cerrar el stream (lo hace el abort); en stdio lo reenvía el puente.
                if (this.era === 'legacy') this.notify('notifications/cancelled', {
                    requestId: id,
                    reason: t.signal.reason instanceof MCPError ? 'timeout' : 'El usuario canceló'
                }).catch(() => { });
            }
            if (t.signal.aborted && t.signal.reason instanceof MCPError) throw t.signal.reason;
            throw e;
        } finally {
            t.cancel();
            this.progressListeners.delete(id);
        }

        // MRTR (era moderna): el servidor necesita algo de nosotros antes de terminar
        if (result?.resultType === 'input_required' && MRTR_METHODS.includes(method)) {
            const round = (opts.round || 0) + 1;
            if (round > MAX_INPUT_ROUNDS) throw new MCPError('El servidor pidió datos demasiadas veces seguidas.');
            const inputResponses = await this.fulfillInputRequests(result.inputRequests || {});
            const { inputResponses: _a, requestState: _b, ...base } = params || {};
            return this.request(method, {
                ...base,
                ...(Object.keys(inputResponses).length ? { inputResponses } : {}),
                ...(result.requestState !== undefined ? { requestState: result.requestState } : {})
            }, { ...opts, round });
        }
        return result;
    }

    /** Resuelve los `inputRequests` de un InputRequiredResult (uno por uno, con el usuario). */
    private async fulfillInputRequests(requests: Record<string, { method: string; params: any }>) {
        const responses: Record<string, any> = {};
        for (const [key, req] of Object.entries(requests)) {
            this.log(`El servidor pide ${req.method}`);
            if (req.method === 'roots/list') responses[key] = { roots: [] };
            else if (hooks.onServerRequest) responses[key] = await hooks.onServerRequest(this.server, req.method, req.params);
            else throw new MCPError(`Nodemat no puede atender '${req.method}'`);
        }
        return responses;
    }

    /** Procesa un mensaje que NO es la respuesta que estamos esperando. */
    private handleIncoming(m: JsonRpcMessage) {
        if (m.method && m.id !== undefined) {
            this.answerServerRequest(m);
        } else if (m.method) {
            this.handleNotification(m.method, m.params);
        } else if (m.id !== undefined && this.pending.has(m.id) && (m.result !== undefined || m.error)) {
            const p = this.pending.get(m.id)!;
            this.pending.delete(m.id);
            m.error ? p.reject(new MCPError(m.error.message, undefined, m.error.code, m.error.data)) : p.resolve(m.result);
        }
    }

    private handleNotification(method: string, params: any) {
        if (method === 'notifications/progress') {
            this.progressListeners.get(params?.progressToken)?.({ progress: params.progress, total: params.total, message: params.message });
            return;
        }
        if (method === 'notifications/subscriptions/acknowledged') return;
        hooks.onNotification?.(this.server, method, params);
    }

    /** Era clásica: el servidor nos hace una pregunta y respondemos (algunas requieren al usuario). */
    private async answerServerRequest(m: JsonRpcMessage) {
        let reply: JsonRpcMessage;
        try {
            let result: any;
            if (m.method === 'ping') result = {};
            else if (m.method === 'roots/list') result = { roots: [] };
            else if ((m.method === 'sampling/createMessage' || m.method === 'elicitation/create') && hooks.onServerRequest) {
                this.log(`El servidor pide ${m.method}`);
                result = await hooks.onServerRequest(this.server, m.method, m.params);
            } else {
                throw Object.assign(new Error(`Nodemat no soporta '${m.method}'`), { code: -32601 });
            }
            reply = { jsonrpc: '2.0', id: m.id, result };
        } catch (e: any) {
            reply = { jsonrpc: '2.0', id: m.id, error: { code: e?.code ?? -1, message: e?.message || String(e) } };
        }
        this.send(reply).catch(() => { });
    }

    private unwrap(m: JsonRpcMessage) {
        if (m.error) throw new MCPError(m.error.message || 'Error JSON-RPC', undefined, m.error.code, m.error.data);
        return m.result;
    }

    // --- Streamable HTTP ---------------------------------------------------

    private async requestViaHTTP(msg: JsonRpcMessage, signal: AbortSignal, retriedAuth = false): Promise<any> {
        const response = await this.http(this.endpoint, {
            method: 'POST',
            headers: await this.headers({ Accept: 'application/json, text/event-stream' }, msg),
            body: JSON.stringify(msg),
            signal
        });

        const sid = response.headers.get('mcp-session-id');
        if (sid && (this.era === 'legacy' || this.isStdio)) this.sessionId = sid;

        if (response.status === 401) {
            response.body?.cancel().catch(() => { });
            if (await this.handleUnauthorized(response, retriedAuth)) return this.requestViaHTTP(msg, signal, true);
        }
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            // Los servidores modernos explican los 400/404 con un error JSON-RPC: lo conservamos
            try {
                const body = JSON.parse(text);
                if (body?.error?.code !== undefined) throw new MCPError(body.error.message || `Error ${response.status}`, response.status, body.error.code, body.error.data);
            } catch (e) { if (e instanceof MCPError) throw e; }
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
                    if (m.id === msg.id && !m.method && (m.result !== undefined || m.error)) { answer = m; return true; }
                    this.handleIncoming(m);
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
            parsed.filter((m: any) => m.id !== msg.id).forEach((m: any) => this.handleIncoming(m));
            parsed = parsed.find((m: any) => m.id === msg.id) || parsed[0];
        }
        if (parsed?.jsonrpc) return this.unwrap(parsed);
        return parsed; // servidor no estándar que devuelve el resultado directo
    }

    /** Lee un stream de avisos de larga duración y lo reabre si se corta. */
    private async keepListening(open: (signal: AbortSignal) => Promise<Response>, attempt = 0) {
        if (this.closed || attempt >= LISTEN_RETRIES) return;
        const abort = new AbortController();
        this.listenAbort = abort;
        let graceful = false;
        try {
            const res = await open(abort.signal);
            if (!res.ok || !res.body || !(res.headers.get('content-type') || '').includes('text/event-stream')) {
                res.body?.cancel().catch(() => { });
                return;   // el servidor no ofrece stream de avisos
            }
            await readSSE(res.body, (_e, data) => {
                try {
                    const parsed = JSON.parse(data);
                    (Array.isArray(parsed) ? parsed : [parsed]).forEach((m: JsonRpcMessage) => {
                        if (!m.method && m.id !== undefined) graceful = true;   // cierre ordenado de subscriptions/listen
                        else this.handleIncoming(m);
                    });
                } catch { /* evento no JSON */ }
            });
        } catch {
            if (abort.signal.aborted) return;
        }
        if (!graceful && !this.closed && this.listenAbort === abort) {
            setTimeout(() => this.keepListening(open, attempt + 1), 2000 * (attempt + 1));
        }
    }

    /** Era clásica: GET opcional con avisos espontáneos del servidor (405 = no lo ofrece). */
    private listen() {
        this.keepListening(async (signal) => this.http(this.endpoint, {
            method: 'GET',
            headers: await this.headers({ Accept: 'text/event-stream' }),
            signal
        }));
    }

    /** Era moderna: `subscriptions/listen` con los avisos que nos interesan. */
    private subscribe() {
        const caps = this.capabilities || {};
        const notifications = {
            ...(caps.tools?.listChanged ? { toolsListChanged: true } : {}),
            ...(caps.prompts?.listChanged ? { promptsListChanged: true } : {}),
            ...(caps.resources?.listChanged ? { resourcesListChanged: true } : {})
        };
        if (!Object.keys(notifications).length) return;
        this.keepListening(async (signal) => {
            const msg: JsonRpcMessage = { jsonrpc: '2.0', id: this.nextId++, method: 'subscriptions/listen', params: { notifications, _meta: this.modernMeta() } };
            return this.http(this.endpoint, {
                method: 'POST',
                headers: await this.headers({ Accept: 'application/json, text/event-stream' }, msg),
                body: JSON.stringify(msg),
                signal
            });
        });
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

            this.headers({ Accept: 'text/event-stream' }).then(h => {
                delete h['Content-Type'];
                return this.http(this.server.url, { method: 'GET', headers: h, signal: abort.signal });
            }).then(async (res) => {
                if (res.status === 401) {
                    try { await this.handleUnauthorized(res, true); } catch (e) { fail(e); return; }
                }
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
                    (Array.isArray(parsed) ? parsed : [parsed]).forEach((m: JsonRpcMessage) => this.handleIncoming(m));
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
            headers: { 'Content-Type': 'application/json', ...customHeaders(this.server), ...(await this.authHeaders()) },
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

/** Conecta (o reconecta) un servidor, descubre lo que ofrece y deja la conexión viva. */
export async function connectServer(server: MCPServer, signal?: AbortSignal, log?: (msg: string) => void): Promise<MCPConnectResult> {
    disconnectServer(server.id);
    // Al conectar a mano se vuelve a averiguar la era (el servidor pudo actualizarse)
    const conn = new MCPConnection({ ...server, era: undefined }, log);
    await conn.connect(signal);
    log?.('Pidiendo la lista de herramientas…');
    const tools = await conn.listTools(signal);
    const { resources, templates } = await conn.listResources(signal);
    const prompts = await conn.listPrompts(signal);
    log?.(`${tools.length} herramientas, ${resources.length + templates.length} recursos, ${prompts.length} prompts.`);
    connections.set(server.id, conn);
    return {
        tools,
        resources,
        resourceTemplates: templates,
        prompts,
        serverInfo: conn.serverInfo,
        protocolVersion: conn.negotiatedVersion,
        resolvedTransport: conn.resolvedTransport,
        era: conn.resolvedEra,
        instructions: conn.instructions,
        capabilities: conn.capabilities
    };
}

export function disconnectServer(serverId: string) {
    connections.get(serverId)?.close();
    connections.delete(serverId);
}

/** Devuelve la conexión viva o la re-establece (p. ej. tras recargar la página). */
async function liveConnection(server: MCPServer, signal?: AbortSignal): Promise<MCPConnection> {
    let conn = connections.get(server.id);
    if (!conn || conn.closed) {
        conn = new MCPConnection(server);
        await conn.connect(signal);
        // Los headers Mcp-Param-* necesitan los esquemas: se recargan sin bloquear si faltan
        if (server.tools?.length) await conn.listTools(signal).catch(() => { });
        connections.set(server.id, conn);
    }
    return conn;
}

/** Ejecuta una herramienta. */
export async function callServerTool(server: MCPServer, toolName: string, args: any, signal?: AbortSignal, onProgress?: (p: MCPProgress) => void): Promise<MCPToolResult> {
    return (await liveConnection(server, signal)).callTool(toolName, args, signal, onProgress);
}

/** Lee un recurso y lo devuelve como adjuntos listos para el chat. */
export async function readServerResource(server: MCPServer, uri: string, signal?: AbortSignal): Promise<Attachment[]> {
    const contents = await (await liveConnection(server, signal)).readResource(uri, signal);
    return contents.map((c, i) => resourceToAttachment(c, `recurso-${i + 1}`)).filter(Boolean) as Attachment[];
}

/** Obtiene un prompt con sus argumentos ya completados. */
export async function getServerPrompt(server: MCPServer, name: string, args: Record<string, string>, signal?: AbortSignal) {
    return (await liveConnection(server, signal)).getPrompt(name, args, signal);
}

/**
 * Vuelve a pedir las listas (tras un aviso list_changed). Sólo sobre una
 * conexión ya establecida: los avisos llegan también DURANTE el handshake, y
 * abrir otra conexión por cada uno lanzaría un proceso nuevo por aviso.
 */
export async function refreshServerLists(server: MCPServer) {
    const conn = connections.get(server.id);
    if (!conn || conn.closed) return null;
    const tools = await conn.listTools();
    const { resources, templates } = await conn.listResources();
    const prompts = await conn.listPrompts();
    return { tools, resources, resourceTemplates: templates, prompts };
}

// ============================================================================
// ERRORES AMIGABLES
// ============================================================================

export const getFriendlyMCPError = (error: any): string => {
    const msg: string = error?.message || String(error);

    if (error instanceof MCPAuthRequiredError) {
        return `🔐 ${msg}\n\nSi el servidor usa OAuth (GitHub, Notion, Linear, Atlassian…), elige Autenticación → "OAuth" y pulsa "Autorizar".`;
    }

    // Errores del propio proxy /api/mcp o del puente stdio: ya vienen explicados
    const jsonStart = msg.indexOf('{"error"');
    if (jsonStart >= 0) {
        try {
            const proxyError = JSON.parse(msg.slice(jsonStart)).error;
            if (typeof proxyError === 'string' && /^(Proxy MCP|Puente stdio)/.test(proxyError)) return `🛡️ ${proxyError}`;
        } catch { /* mensaje truncado: seguir con las reglas genéricas */ }
    }
    if (/MCP Server Error \(404\)/.test(msg) && /<html|NOT_FOUND|The page could not be found|Cannot (GET|POST)/i.test(msg)) {
        return "🔌 No se encontró el proxy /api/mcp o el puente stdio. El proxy existe en Vercel y en local; el puente stdio sólo cuando Nodemat corre en tu máquina (npm run dev / npm start).";
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
