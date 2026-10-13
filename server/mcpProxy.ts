/**
 * ============================================================================
 * MCP PROXY - Evita el bloqueo CORS al hablar con servidores MCP remotos
 * ============================================================================
 *
 * El navegador bloquea las respuestas de servidores que no envían headers CORS
 * (por ejemplo el nodo "MCP Server Trigger" de n8n Cloud). Este proxy corre en
 * el MISMO dominio que la app (función serverless de Vercel o middleware de Vite
 * en desarrollo), así que para el navegador la petición es "same-origin" y no
 * hay CORS que resolver. El proxy reenvía la petición al servidor MCP real y
 * devuelve la respuesta en streaming (soporta SSE).
 *
 * SEGURIDAD — un proxy abierto es peligroso (SSRF, relay anónimo). Por eso:
 *   - Solo reenvía a hosts de la lista MCP_PROXY_ALLOWED_HOSTS (default: *.n8n.cloud)
 *   - Solo HTTPS (salvo MCP_PROXY_ALLOW_HTTP=1, pensado para desarrollo local)
 *   - Rechaza peticiones que vengan de OTRO sitio web (Origin / Sec-Fetch-Site)
 *   - Si se define NODEMAT_PROXY_TOKEN, exige el header x-nodemat-proxy-token
 *   - No sigue redirecciones (evita saltarse la lista de hosts)
 *   - No reenvía cookies ni headers internos de la plataforma
 *
 * USO desde el cliente:
 *   fetch('/api/mcp', { method, headers: { 'x-mcp-target': 'https://...', ...}, body })
 */

export interface ProxyEnv {
    MCP_PROXY_ALLOWED_HOSTS?: string;
    MCP_PROXY_ALLOW_HTTP?: string;
    NODEMAT_PROXY_TOKEN?: string;
}

const DEFAULT_ALLOWED_HOSTS = '*.n8n.cloud';

/** Headers del cliente que NO se reenvían al servidor MCP */
const BLOCKED_REQUEST_HEADERS = new Set([
    'host', 'origin', 'referer', 'cookie', 'connection', 'content-length', 'keep-alive',
    'transfer-encoding', 'upgrade', 'te', 'trailer', 'proxy-authorization', 'forwarded',
    'x-real-ip', 'x-mcp-target', 'x-nodemat-proxy-token', 'accept-encoding'
]);
const BLOCKED_REQUEST_PREFIXES = ['x-forwarded-', 'x-vercel-', 'sec-', 'cf-'];

/** Headers de la respuesta que SÍ devolvemos al navegador */
const PASSTHROUGH_RESPONSE_HEADERS = ['content-type', 'mcp-session-id', 'cache-control', 'www-authenticate'];

const json = (status: number, body: any) => new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
});

export function isHostAllowed(hostname: string, allowList: string): boolean {
    const host = hostname.toLowerCase();
    return allowList.split(',').map(s => s.trim().toLowerCase()).filter(Boolean).some(rule => {
        if (rule === '*') return true;
        if (rule.startsWith('*.')) return host.endsWith(rule.slice(1)) && host.length > rule.length - 1;
        return host === rule;
    });
}

/** Rechaza peticiones originadas en otro sitio (otra web usando tu proxy desde el navegador de alguien). */
function isCrossSite(request: Request): boolean {
    const site = request.headers.get('sec-fetch-site');
    if (site && site !== 'same-origin' && site !== 'none') return true;
    const origin = request.headers.get('origin');
    if (origin) {
        const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || new URL(request.url).host;
        try { if (new URL(origin).host !== host) return true; } catch { return true; }
    }
    return false;
}

export async function handleMcpProxy(request: Request, env: ProxyEnv): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
    if (!['GET', 'POST', 'DELETE'].includes(request.method)) return json(405, { error: 'Método no permitido' });

    if (isCrossSite(request)) return json(403, { error: 'Proxy MCP: sólo se acepta desde la propia app.' });

    if (env.NODEMAT_PROXY_TOKEN && request.headers.get('x-nodemat-proxy-token') !== env.NODEMAT_PROXY_TOKEN) {
        return json(401, { error: 'Proxy MCP: token del proxy inválido o ausente. Configúralo en Ajustes → MCP.' });
    }

    const targetRaw = request.headers.get('x-mcp-target');
    if (!targetRaw) return json(400, { error: 'Falta el header x-mcp-target' });

    let target: URL;
    try { target = new URL(targetRaw); } catch { return json(400, { error: 'x-mcp-target no es una URL válida' }); }

    const allowHttp = env.MCP_PROXY_ALLOW_HTTP === '1' || env.MCP_PROXY_ALLOW_HTTP === 'true';
    if (target.protocol !== 'https:' && !(allowHttp && target.protocol === 'http:')) {
        return json(400, { error: 'Proxy MCP: sólo se permiten destinos https://' });
    }
    if (target.username || target.password) return json(400, { error: 'URL con credenciales embebidas no permitida' });

    const allowList = env.MCP_PROXY_ALLOWED_HOSTS || DEFAULT_ALLOWED_HOSTS;
    // IPs y localhost sólo si están listados explícitamente (un comodín no alcanza): evita SSRF a la red interna
    const isLiteralHost = /^[\d.]+$|^\[|^localhost$/i.test(target.hostname);
    const explicitlyListed = allowList.split(',').map(s => s.trim().toLowerCase()).includes(target.hostname.toLowerCase());
    if (isLiteralHost && !explicitlyListed) {
        return json(403, { error: `Proxy MCP: las direcciones IP y localhost deben figurar explícitamente en MCP_PROXY_ALLOWED_HOSTS.` });
    }
    if (!isHostAllowed(target.hostname, allowList)) {
        return json(403, {
            error: `Proxy MCP: el host "${target.hostname}" no está permitido. ` +
                `Agrégalo a la variable de entorno MCP_PROXY_ALLOWED_HOSTS (actual: ${allowList}).`
        });
    }

    const headers = new Headers();
    request.headers.forEach((value, key) => {
        const k = key.toLowerCase();
        if (BLOCKED_REQUEST_HEADERS.has(k) || BLOCKED_REQUEST_PREFIXES.some(p => k.startsWith(p))) return;
        headers.set(key, value);
    });

    let upstream: Response;
    try {
        upstream = await fetch(target, {
            method: request.method,
            headers,
            body: request.method === 'POST' ? await request.arrayBuffer() : undefined,
            redirect: 'manual',
            signal: request.signal
        });
    } catch (e: any) {
        if (e?.name === 'AbortError') return new Response(null, { status: 499 });
        return json(502, { error: `Proxy MCP: no se pudo contactar ${target.host}: ${e?.message || e}` });
    }

    if (upstream.status >= 300 && upstream.status < 400) {
        return json(502, { error: `Proxy MCP: el servidor respondió con una redirección (${upstream.status}) que no se sigue por seguridad.` });
    }

    const outHeaders = new Headers({ 'x-accel-buffering': 'no', 'cache-control': 'no-store' });
    PASSTHROUGH_RESPONSE_HEADERS.forEach(h => {
        const v = upstream.headers.get(h);
        if (v) outHeaders.set(h, v);
    });

    return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
}
