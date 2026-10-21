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
 * CERO CONFIGURACIÓN EN EL SERVIDOR: toda la configuración (qué servidores MCP,
 * credenciales, etc.) vive en el navegador del usuario. El proxy no guarda nada.
 *
 * SEGURIDAD — reglas fijas, no configurables desde el cliente:
 *   - Solo destinos HTTPS públicos: se rechazan IPs privadas, localhost, link-local
 *     (metadata de nubes) y nombres que RESUELVEN a esas IPs (anti-SSRF)
 *   - Rechaza peticiones que vengan de OTRO sitio web (Origin / Sec-Fetch-Site)
 *   - No sigue redirecciones
 *   - No reenvía cookies ni headers internos de la plataforma
 *
 * Refuerzos OPCIONALES por variable de entorno (no hacen falta):
 *   - MCP_PROXY_ALLOWED_HOSTS: restringe a una lista de hosts (ej. *.n8n.cloud)
 *   - NODEMAT_PROXY_TOKEN: exige el header x-nodemat-proxy-token
 *   - MCP_PROXY_ALLOW_HTTP / MCP_PROXY_ALLOW_PRIVATE: sólo para desarrollo local
 *
 * USO desde el cliente:
 *   fetch('/api/mcp', { method, headers: { 'x-mcp-target': 'https://...', ...}, body })
 */

import { lookup } from 'node:dns/promises';

export interface ProxyEnv {
    MCP_PROXY_ALLOWED_HOSTS?: string;
    MCP_PROXY_ALLOW_HTTP?: string;
    MCP_PROXY_ALLOW_PRIVATE?: string;
    NODEMAT_PROXY_TOKEN?: string;
}

const isTrue = (v?: string) => v === '1' || v === 'true';

/** ¿La IP pertenece a una red privada, loopback, link-local o reservada? */
export function isPrivateAddress(ip: string): boolean {
    const addr = ip.toLowerCase().replace(/^\[|\]$/g, '');
    const v4 = addr.startsWith('::ffff:') ? addr.slice(7) : addr;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) {
        const [a, b] = v4.split('.').map(Number);
        return a === 0 || a === 10 || a === 127 || a >= 224 ||
            (a === 100 && b >= 64 && b <= 127) ||   // CGNAT
            (a === 169 && b === 254) ||             // link-local / metadata de nubes
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168) ||
            (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
    }
    return addr === '::' || addr === '::1' || addr.startsWith('fc') || addr.startsWith('fd') ||
        addr.startsWith('fe8') || addr.startsWith('fe9') || addr.startsWith('fea') || addr.startsWith('feb');
}

/** Resuelve el host y verifica que TODAS sus IPs sean públicas. */
async function resolvesToPublic(hostname: string): Promise<{ ok: boolean; reason?: string }> {
    const host = hostname.replace(/^\[|\]$/g, '');
    if (/^localhost$|\.localhost$|\.local$|\.internal$/i.test(host)) return { ok: false, reason: 'es un nombre de red local' };
    try {
        const addrs = await lookup(host, { all: true });
        const bad = addrs.find(a => isPrivateAddress(a.address));
        if (bad) return { ok: false, reason: `resuelve a una IP privada (${bad.address})` };
        return { ok: true };
    } catch {
        return { ok: false, reason: 'no se pudo resolver el nombre (DNS)' };
    }
}

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
export function isCrossSite(request: Request): boolean {
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

    if (target.protocol !== 'https:' && !(isTrue(env.MCP_PROXY_ALLOW_HTTP) && target.protocol === 'http:')) {
        return json(400, { error: 'Proxy MCP: sólo se permiten destinos https://' });
    }
    if (target.username || target.password) return json(400, { error: 'Proxy MCP: URL con credenciales embebidas no permitida' });

    // Refuerzo opcional: lista de hosts definida en el servidor
    if (env.MCP_PROXY_ALLOWED_HOSTS && !isHostAllowed(target.hostname, env.MCP_PROXY_ALLOWED_HOSTS)) {
        return json(403, { error: `Proxy MCP: el host "${target.hostname}" no está en MCP_PROXY_ALLOWED_HOSTS de este despliegue.` });
    }

    // Regla fija: sólo servidores públicos (anti-SSRF). En desarrollo local se puede relajar.
    if (!isTrue(env.MCP_PROXY_ALLOW_PRIVATE)) {
        const check = await resolvesToPublic(target.hostname);
        if (!check.ok) {
            return json(403, {
                error: `Proxy MCP: "${target.hostname}" ${check.reason}. El proxy sólo conecta con servidores públicos; ` +
                    `para servidores en tu red, conéctate sin proxy o corre Nodemat en local (npm run dev).`
            });
        }
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
