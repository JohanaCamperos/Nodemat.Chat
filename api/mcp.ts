// Función serverless de Vercel: proxy MCP same-origin (ver server/mcpProxy.ts)
// Extensión .js obligatoria: package.json usa "type": "module" y Node no resuelve imports sin extensión.
import { handleMcpProxy } from '../server/mcpProxy.js';

const handler = (request: Request) => handleMcpProxy(request, process.env as any);

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
export const OPTIONS = handler;
