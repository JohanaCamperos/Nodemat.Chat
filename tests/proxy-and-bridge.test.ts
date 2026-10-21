import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { handleMcpProxy, isHostAllowed, isPrivateAddress } from '../server/mcpProxy';
import { handleStdioBridge, parseEnv, splitArgs } from '../server/stdioBridge';

describe('proxy MCP', () => {
    it('reconoce direcciones privadas y de metadata', () => {
        for (const ip of ['10.0.0.1', '127.0.0.1', '169.254.169.254', '192.168.1.1', '172.20.0.1', '100.64.0.1', '::1', 'fd00::1', '::ffff:10.0.0.1']) {
            expect(isPrivateAddress(ip), ip).toBe(true);
        }
        for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700::1111']) expect(isPrivateAddress(ip), ip).toBe(false);
    });

    it('aplica la lista de hosts permitidos con comodines', () => {
        expect(isHostAllowed('x.app.n8n.cloud', '*.n8n.cloud')).toBe(true);
        expect(isHostAllowed('n8n.cloud', '*.n8n.cloud')).toBe(false);
        expect(isHostAllowed('evil.com', 'api.ejemplo.com')).toBe(false);
    });

    const req = (target: string, headers: Record<string, string> = {}) =>
        new Request('https://app.ejemplo/api/mcp', { method: 'POST', headers: { 'x-mcp-target': target, host: 'app.ejemplo', ...headers }, body: '{}' });

    it('rechaza http, credenciales en la URL, otros sitios y destinos internos', async () => {
        expect((await handleMcpProxy(req('http://x.com/mcp'), {})).status).toBe(400);
        expect((await handleMcpProxy(req('https://u:p@x.com/mcp'), {})).status).toBe(400);
        expect((await handleMcpProxy(req('https://x.com/mcp', { 'sec-fetch-site': 'cross-site' }), {})).status).toBe(403);
        expect((await handleMcpProxy(req('https://localhost/mcp'), {})).status).toBe(403);
        expect((await handleMcpProxy(req('https://127.0.0.1/mcp'), {})).status).toBe(403);
    });

    it('exige el token del proxy cuando está configurado', async () => {
        const res = await handleMcpProxy(req('https://x.com/mcp'), { NODEMAT_PROXY_TOKEN: 'secreto' });
        expect(res.status).toBe(401);
    });
});

describe('puente stdio', () => {
    it('separa argumentos con comillas y lee variables de entorno', () => {
        expect(splitArgs('-y "@scope/pkg" \'C:\\Mis Documentos\' --flag')).toEqual(['-y', '@scope/pkg', 'C:\\Mis Documentos', '--flag']);
        expect(parseEnv('A=1\n# comentario\n\nB = dos=tres')).toEqual({ A: '1', B: 'dos=tres' });
    });

    const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fake-mcp-server.mjs');
    const config = Buffer.from(JSON.stringify({ command: process.execPath, args: `"${fixture}"`, env: 'SALUDO=hola' })).toString('base64');
    const ctx = { fromLoopback: true, crossSite: false };
    const post = (body: any, session?: string) => new Request('http://localhost/api/mcp-stdio', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-mcp-stdio': config, ...(session ? { 'mcp-session-id': session } : {}) },
        body: JSON.stringify(body)
    });
    const messages = async (res: Response) => (await res.text()).split('\n').filter(l => l.startsWith('data: ')).map(l => JSON.parse(l.slice(6)));

    it('sólo atiende pedidos de la propia máquina', async () => {
        const res = await handleStdioBridge(post({ jsonrpc: '2.0', id: 1, method: 'initialize' }), {}, { fromLoopback: false, crossSite: false });
        expect(res.status).toBe(403);
    });

    it('lanza el proceso, mantiene la sesión y le pasa las variables de entorno', async () => {
        const init = await handleStdioBridge(post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }), {}, ctx);
        const session = init.headers.get('mcp-session-id')!;
        expect(session).toBeTruthy();
        expect((await messages(init)).at(-1).result.serverInfo.name).toBe('fake');

        const notif = await handleStdioBridge(post({ jsonrpc: '2.0', method: 'notifications/initialized' }, session), {}, ctx);
        expect(notif.status).toBe(202);

        const call = await handleStdioBridge(post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'env' } }, session), {}, ctx);
        const msgs = await messages(call);
        // El aviso de progreso llega antes que la respuesta, por el mismo stream
        expect(msgs[0].method).toBe('notifications/progress');
        expect(msgs.at(-1).result.content[0].text).toBe('hola');

        const del = await handleStdioBridge(new Request('http://localhost/api/mcp-stdio', { method: 'DELETE', headers: { 'mcp-session-id': session } }), {}, ctx);
        expect(del.status).toBe(204);
        const after = await handleStdioBridge(post({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, session), {}, ctx);
        expect(after.status).toBe(404);
    });

    it('explica cuando el comando no existe', async () => {
        const bad = Buffer.from(JSON.stringify({ command: 'comando-que-no-existe-nodemat', args: '' })).toString('base64');
        const res = await handleStdioBridge(new Request('http://localhost/api/mcp-stdio', {
            method: 'POST', headers: { 'content-type': 'application/json', 'x-mcp-stdio': bad },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' })
        }), {}, ctx);
        const msgs = await messages(res);
        expect(msgs.at(-1).error.message).toMatch(/Puente stdio/);
    });
});
