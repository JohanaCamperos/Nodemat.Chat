/**
 * fetch hacia un servidor MCP (o su servidor de autorización), directo o a
 * través del proxy same-origin /api/mcp si el servidor no permite CORS.
 * El proxy recibe la URL real en el header x-mcp-target.
 */

import { MCPServer } from '../types';
import { bridgeHeaders, MCP_PROXY_PATH } from './bridge';

export function mcpFetch(server: Pick<MCPServer, 'useProxy'>, url: string, init: RequestInit = {}): Promise<Response> {
    if (!server.useProxy) return fetch(url, init);
    const headers = new Headers(init.headers);
    headers.set('x-mcp-target', url);
    Object.entries(bridgeHeaders()).forEach(([k, v]) => headers.set(k, v));
    return fetch(MCP_PROXY_PATH, { ...init, headers });
}
