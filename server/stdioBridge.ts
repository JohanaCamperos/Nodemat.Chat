/**
 * ============================================================================
 * PUENTE STDIO - Servidores MCP locales (comandos) desde el navegador
 * ============================================================================
 *
 * La mayoría de los servidores MCP del ecosistema se distribuyen como un
 * comando (`npx -y @modelcontextprotocol/server-filesystem C:\docs`) que habla
 * JSON-RPC por stdin/stdout. Un navegador no puede lanzar procesos, así que
 * este puente lo hace y traduce a Streamable HTTP, el mismo transporte que
 * el cliente ya usa para servidores remotos:
 *
 *   POST  initialize        -> lanza el proceso y devuelve Mcp-Session-Id
 *   POST  request           -> lo escribe en stdin y devuelve (como SSE) todo lo
 *                              que el proceso emita hasta la respuesta
 *   POST  notificación/resp -> lo escribe en stdin, 202 Accepted
 *   GET                     -> stream SSE con los avisos espontáneos del proceso
 *   DELETE                  -> termina el proceso
 *
 * SEGURIDAD: ejecutar comandos es ejecutar código en la máquina. Por eso el
 * puente sólo existe dentro del servidor local de Vite (npm run dev / npm start,
 * nunca en Vercel), sólo acepta peticiones desde la propia máquina (loopback)
 * y desde la propia app, y se puede apagar con MCP_STDIO_DISABLED=1.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';

export interface StdioEnv {
    MCP_STDIO_DISABLED?: string;
}

interface StdioConfig {
    command: string;
    args?: string;
    env?: string;
    cwd?: string;
}

type Listener = ((msg: any) => void) & { kind?: 'post' | 'get' };

interface Session {
    proc: ChildProcessWithoutNullStreams;
    /** Quien está esperando mensajes: los POST en curso y/o el GET de avisos */
    listeners: Set<Listener>;
    /** Mensajes que llegaron sin nadie escuchando: se entregan en la próxima petición */
    backlog: any[];
    stderr: string;
    exited: string | null;
    lastUsed: number;
}

const sessions = new Map<string, Session>();
const IDLE_MS = 30 * 60_000;
const REQUEST_TIMEOUT_MS = 10 * 60_000;

// Matar procesos olvidados (pestaña cerrada sin DELETE)
setInterval(() => {
    const now = Date.now();
    sessions.forEach((s, id) => {
        if (now - s.lastUsed > IDLE_MS) { s.proc.kill(); sessions.delete(id); }
    });
}, 60_000).unref?.();

const json = (status: number, body: any) => new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
});

/** Separa argumentos respetando comillas simples y dobles. */
export function splitArgs(input: string): string[] {
    const out: string[] = [];
    const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(input || ''))) out.push(m[1] ?? m[2] ?? m[3]);
    return out;
}

/** "CLAVE=valor" por línea. Las líneas vacías y las que empiezan con # se ignoran. */
export function parseEnv(input: string): Record<string, string> {
    const env: Record<string, string> = {};
    (input || '').split(/\r?\n/).forEach(line => {
        const l = line.trim();
        if (!l || l.startsWith('#')) return;
        const i = l.indexOf('=');
        if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
    });
    return env;
}

function decodeConfig(header: string | null): StdioConfig | null {
    if (!header) return null;
    try {
        const cfg = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
        return typeof cfg?.command === 'string' && cfg.command.trim() ? cfg : null;
    } catch {
        return null;
    }
}

function startProcess(cfg: StdioConfig): Session {
    const isWin = process.platform === 'win32';
    const args = splitArgs(cfg.args || '');
    // En Windows, npx/uvx son .cmd y necesitan la shell; citamos lo que tenga espacios
    const options = {
        env: { ...process.env, ...parseEnv(cfg.env || '') },
        cwd: cfg.cwd?.trim() || undefined,
        stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'],
        windowsHide: true
    };
    // En Windows, npx/uvx son .cmd y necesitan la shell: se arma UNA línea con todo citado
    const quote = (a: string) => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
    const proc = isWin
        ? spawn([cfg.command.trim(), ...args].map(quote).join(' '), { ...options, shell: true })
        : spawn(cfg.command.trim(), args, options);

    const session: Session = { proc, listeners: new Set(), backlog: [], stderr: '', exited: null, lastUsed: Date.now() };

    let buffer = '';
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk: string) => {
        buffer += chunk;
        let nl: number;
        while ((nl = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            let msg: any;
            try { msg = JSON.parse(line); } catch { continue; }   // logs que no son JSON-RPC
            dispatch(session, msg);
        }
    });
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (chunk: string) => { session.stderr = (session.stderr + chunk).slice(-4000); });
    const onExit = (reason: string) => {
        if (session.exited) return;
        session.exited = reason;
        session.listeners.forEach(l => l({ __exit: reason }));
    };
    proc.on('error', (e) => onExit(`no se pudo ejecutar "${cfg.command}": ${e.message}`));
    proc.on('exit', (code, signal) => onExit(`el proceso terminó (${signal || `código ${code}`})`));
    return session;
}

/**
 * Respuestas: a los POST (cada uno ignora las que no son suyas). Pedidos y
 * avisos del servidor: a UN solo destinatario (el POST en curso o, si no hay,
 * el GET), para que el cliente no los conteste dos veces.
 */
function dispatch(session: Session, msg: any) {
    const all = [...session.listeners];
    const posts = all.filter(l => l.kind === 'post');
    if (!msg.method) {
        if (posts.length) posts.forEach(l => l(msg));
        else session.backlog.push(msg);
        return;
    }
    const target = posts[0] || all.find(l => l.kind === 'get');
    if (target) target(msg);
    else session.backlog.push(msg);
}

function exitMessage(s: Session) {
    return `Puente stdio: ${s.exited}.${s.stderr.trim() ? `\n\nSalida de error del comando:\n${s.stderr.trim().slice(-1500)}` : ''}`;
}

/** Escribe en stdin y devuelve como SSE todo lo que salga hasta la respuesta a `waitId`. */
function streamUntilResponse(session: Session, messages: any[], waitId: string | number | undefined, sessionId: string, signal: AbortSignal): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            let closed = false;
            const send = (msg: any) => controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(msg)}\n\n`));
            let answered = false;
            const finish = () => {
                if (closed) return;
                closed = true;
                // Si el navegador cerró el stream antes de la respuesta, el proceso debe enterarse
                if (waitId !== undefined && !answered && !session.exited) {
                    session.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: waitId, reason: 'El cliente canceló' } }) + '\n');
                }
                session.listeners.delete(listener);
                clearTimeout(timer);
                controller.close();
            };
            const listener: Listener = (msg) => {
                if (closed) return;
                if (msg?.__exit) {
                    if (waitId !== undefined) send({ jsonrpc: '2.0', id: waitId, error: { code: -32000, message: exitMessage(session) } });
                    answered = true;
                    finish();
                    return;
                }
                send(msg);
                if (waitId !== undefined && msg.id === waitId && !msg.method) { answered = true; finish(); }
            };
            listener.kind = waitId === undefined ? 'get' : 'post';
            const timer = setTimeout(finish, REQUEST_TIMEOUT_MS);
            signal.addEventListener('abort', finish, { once: true });

            session.listeners.add(listener);
            session.backlog.splice(0).forEach(listener);
            if (session.exited) { listener({ __exit: session.exited }); return; }
            messages.forEach(m => session.proc.stdin.write(JSON.stringify(m) + '\n'));
        }
    });
    return new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', 'mcp-session-id': sessionId, 'x-accel-buffering': 'no' }
    });
}

export async function handleStdioBridge(request: Request, env: StdioEnv, ctx: { fromLoopback: boolean; crossSite: boolean }): Promise<Response> {
    if (env.MCP_STDIO_DISABLED === '1' || env.MCP_STDIO_DISABLED === 'true') {
        return json(403, { error: 'Puente stdio: desactivado en este servidor (MCP_STDIO_DISABLED).' });
    }
    if (!ctx.fromLoopback) return json(403, { error: 'Puente stdio: sólo se acepta desde la misma máquina.' });
    if (ctx.crossSite) return json(403, { error: 'Puente stdio: sólo se acepta desde la propia app.' });

    const sessionId = request.headers.get('mcp-session-id') || '';
    let session = sessionId ? sessions.get(sessionId) : undefined;
    if (session) session.lastUsed = Date.now();

    if (request.method === 'DELETE') {
        if (session) { session.proc.kill(); sessions.delete(sessionId); }
        return new Response(null, { status: 204 });
    }

    if (request.method === 'GET') {
        if (!session) return json(404, { error: 'Sesión inexistente' });
        return streamUntilResponse(session, [], undefined, sessionId, request.signal);
    }

    if (request.method !== 'POST') return json(405, { error: 'Método no permitido' });

    let body: any;
    try { body = await request.json(); } catch { return json(400, { error: 'Cuerpo JSON inválido' }); }
    const messages: any[] = Array.isArray(body) ? body : [body];
    // El proceso se lanza con el primer mensaje: `initialize` (era clásica) o
    // `server/discover` (era moderna, la primera petición que manda Nodemat)
    const init = messages.find(m => m?.method === 'initialize' || (m?.method === 'server/discover' && !session));

    if (init) {
        const cfg = decodeConfig(request.headers.get('x-mcp-stdio'));
        if (!cfg) return json(400, { error: 'Puente stdio: falta el comando a ejecutar.' });
        if (session) { session.proc.kill(); sessions.delete(sessionId); }
        session = startProcess(cfg);
        const newId = randomUUID();
        sessions.set(newId, session);
        return streamUntilResponse(session, messages, init.id, newId, request.signal);
    }

    // La spec indica 404 para sesiones desconocidas: el cliente re-inicializa solo
    if (!session) return json(404, { error: 'Sesión stdio inexistente o vencida' });
    if (session.exited) return json(502, { error: exitMessage(session) });

    const waitFor = messages.find(m => m?.method && m.id !== undefined);
    if (!waitFor) {
        messages.forEach(m => session!.proc.stdin.write(JSON.stringify(m) + '\n'));
        return new Response(null, { status: 202 });
    }
    return streamUntilResponse(session, messages, waitFor.id, sessionId, request.signal);
}
