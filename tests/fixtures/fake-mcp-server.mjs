// Servidor MCP mínimo por stdio para los tests del puente.
import readline from 'node:readline';

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
readline.createInterface({ input: process.stdin }).on('line', (line) => {
    const msg = JSON.parse(line);
    if (msg.id === undefined) return;   // notificaciones
    if (msg.method === 'initialize') {
        send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'fake', version: '1' } } });
    } else if (msg.method === 'tools/call') {
        send({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: msg.id, progress: 1, total: 2 } });
        send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: process.env.SALUDO || '' }] } });
    } else {
        send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Method not found' } });
    }
});
