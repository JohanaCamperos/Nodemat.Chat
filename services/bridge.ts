/**
 * Configuración compartida para hablar con las funciones /api de la propia app
 * (proxy MCP y puente de ChatGPT). Al ser el mismo dominio, no hay CORS.
 */

let proxyToken = '';

/** App.tsx la llama cada vez que cambian los ajustes. */
export function setBridgeToken(token: string) {
    proxyToken = token || '';
}

export function bridgeHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return proxyToken ? { ...extra, 'x-nodemat-proxy-token': proxyToken } : extra;
}

export const MCP_PROXY_PATH = '/api/mcp';
export const CHATGPT_BRIDGE_PATH = '/api/chatgpt';

/** POST JSON a /api/chatgpt?action=... y devuelve el JSON (lanza Error legible si falla). */
export async function chatgptBridge<T = any>(action: string, body: any, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`${CHATGPT_BRIDGE_PATH}?action=${action}`, {
        method: 'POST',
        headers: bridgeHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
        signal
    });
    if (res.status === 404) {
        throw new Error('No se encontró /api/chatgpt. ¿La app está desplegada en Vercel (o corriendo con npm run dev)?');
    }
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 300) }; }
    if (!res.ok) {
        const err: any = new Error(data.error || `Error ${res.status}`);
        err.status = res.status;
        throw err;
    }
    return data;
}
