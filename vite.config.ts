import { defineConfig, loadEnv, type Plugin, type Connect } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleMcpProxy, isCrossSite } from './server/mcpProxy';
import { handleChatGPT } from './server/chatgpt';
import { handleStdioBridge } from './server/stdioBridge';

type RouteHandler = (req: Request, node: IncomingMessage) => Promise<Response>;

const isLoopback = (addr?: string) => !!addr && /^(127\.|::1$|::ffff:127\.)/.test(addr);

/**
 * En producción, /api/mcp y /api/chatgpt son funciones serverless de Vercel (carpeta api/).
 * En local (`npm run dev` o `npm start`) este plugin monta los mismos handlers dentro de
 * Vite, así no hace falta `vercel dev`. Sólo en local existe además /api/mcp-stdio, el
 * puente que lanza servidores MCP de tipo comando (no puede existir en Vercel).
 */
function apiRoutes(env: Record<string, string>): Plugin {
    const routes: Record<string, RouteHandler> = {
        // En local se permiten servidores http:// y de tu red (ej. un n8n en localhost)
        '/api/mcp': (req) => handleMcpProxy(req, { MCP_PROXY_ALLOW_HTTP: '1', MCP_PROXY_ALLOW_PRIVATE: '1', ...env }),
        '/api/chatgpt': (req) => handleChatGPT(req, env),
        '/api/mcp-stdio': (req, node) => handleStdioBridge(req, env, {
            fromLoopback: isLoopback(node.socket.remoteAddress),
            crossSite: isCrossSite(req)
        })
    };

    const middleware: Connect.NextHandleFunction = async (req: IncomingMessage, res: ServerResponse, next) => {
        const path = (req.url || '').split('?')[0];
        const handler = routes[path];
        if (!handler) return next();

        try {
            const controller = new AbortController();
            res.on('close', () => { if (!res.writableEnded) controller.abort(); });

            const chunks: Buffer[] = [];
            if (req.method !== 'GET' && req.method !== 'HEAD') {
                for await (const chunk of req) chunks.push(chunk as Buffer);
            }
            const headers = new Headers();
            Object.entries(req.headers).forEach(([k, v]) => {
                if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
            });

            const request = new Request(`http://${req.headers.host}${req.url}`, {
                method: req.method,
                headers,
                body: chunks.length ? Buffer.concat(chunks) : undefined,
                signal: controller.signal
            });

            const response = await handler(request, req);
            res.statusCode = response.status;
            response.headers.forEach((v, k) => res.setHeader(k, v));
            if (!response.body) return res.end();

            const reader = response.body.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                res.write(value);
            }
            res.end();
        } catch (e: any) {
            if (!res.headersSent) {
                res.statusCode = 500;
                res.setHeader('content-type', 'application/json');
            }
            res.end(JSON.stringify({ error: e?.message || String(e) }));
        }
    };

    return {
        name: 'nodemat-api-routes',
        configureServer(server) { server.middlewares.use(middleware); },
        // `npm start` (vite preview) sirve el build con las mismas rutas: modo "self-hosted"
        configurePreviewServer(server) { server.middlewares.use(middleware); }
    };
}

export default defineConfig(({ mode }) => {
    // '' = cargar TODAS las variables de .env (las del servidor no llevan prefijo VITE_)
    const env = loadEnv(mode, process.cwd(), '');
    return {
        plugins: [react(), tailwindcss(), apiRoutes(env)],
        // Acepta VITE_ (lo que documenta el README) y REACT_APP_ (compatibilidad).
        // ⚠️ Todo lo que empiece con estos prefijos queda embebido en el bundle público.
        envPrefix: ['VITE_', 'REACT_APP_'],
        server: {
            port: 3000
        },
        preview: {
            port: 3000
        }
    };
});
