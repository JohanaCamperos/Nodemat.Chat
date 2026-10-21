import { describe, expect, it } from 'vitest';
import { headerValue, mcpParamHeaders, parseToolResult, readSSE, resourceToAttachment } from '../services/mcpClient';
import { canonicalResource, parseWWWAuthenticate } from '../services/mcpOAuth';
import { validateArgs } from '../services/jsonSchema';

const sse = (text: string) => new Blob([text]).stream();

describe('readSSE', () => {
    it('separa eventos, junta líneas data y respeta los comentarios', async () => {
        const events: [string, string][] = [];
        await readSSE(sse(': ping\n\nevent: endpoint\ndata: /messages?x=1\n\ndata: {"a":\ndata: 1}\n\n'), (e, d) => { events.push([e, d]); });
        expect(events).toEqual([['endpoint', '/messages?x=1'], ['message', '{"a":\n1}']]);
    });

    it('acepta saltos de línea CRLF y corta cuando el callback devuelve true', async () => {
        const seen: string[] = [];
        await readSSE(sse('data: uno\r\n\r\ndata: dos\r\n\r\ndata: tres\r\n\r\n'), (_e, d) => { seen.push(d); return d === 'dos'; });
        expect(seen).toEqual(['uno', 'dos']);
    });
});

describe('parseToolResult', () => {
    it('convierte texto, imágenes, recursos y audio', () => {
        const r = parseToolResult({
            content: [
                { type: 'text', text: 'hola' },
                { type: 'image', data: 'AAAA', mimeType: 'image/png' },
                { type: 'resource', resource: { uri: 'file:///a.txt', text: 'contenido' } },
                { type: 'resource', resource: { uri: 'file:///b.pdf', blob: 'BBBB', mimeType: 'application/pdf' } },
                { type: 'audio', data: 'CCCC', mimeType: 'audio/wav' },
                { type: 'resource_link', name: 'doc', uri: 'file:///c' }
            ]
        });
        expect(r.text).toContain('hola');
        expect(r.text).toContain('--- Recurso file:///a.txt ---\ncontenido');
        expect(r.text).toContain('[Enlace a recurso: doc file:///c]');
        expect(r.attachments.map(a => a.type)).toEqual(['image/png', 'application/pdf', 'audio/wav']);
        expect(r.attachments[1].name).toBe('b.pdf');
        expect(r.isError).toBe(false);
    });

    it('usa structuredContent si no hay texto y marca errores', () => {
        const r = parseToolResult({ content: [], structuredContent: { total: 3 }, isError: true });
        expect(JSON.parse(r.text)).toEqual({ total: 3 });
        expect(r.isError).toBe(true);
    });
});

describe('resourceToAttachment', () => {
    it('agrega extensión a los recursos de texto sin nombre de archivo', () => {
        expect(resourceToAttachment({ uri: 'demo://resource/7', text: 'x' }, 'r')!.name).toBe('7.txt');
        expect(resourceToAttachment({ uri: 'file:///x/informe.md', text: 'x', mimeType: 'text/markdown' }, 'r')!.name).toBe('informe.md');
    });
});

describe('headers de la era moderna (2026-07-28)', () => {
    it('codifica en base64 los valores que no son ASCII plano', () => {
        expect(headerValue('us-west1')).toBe('us-west1');
        expect(headerValue('Hello, 世界')).toBe('=?base64?SGVsbG8sIOS4lueVjA==?=');
        expect(headerValue(' padded ')).toBe('=?base64?IHBhZGRlZCA=?=');
        expect(headerValue('=?base64?literal?=')).toBe('=?base64?PT9iYXNlNjQ/bGl0ZXJhbD89?=');
    });

    it('encuentra x-mcp-header sólo en rutas de properties', () => {
        const ok = mcpParamHeaders({
            type: 'object',
            properties: {
                region: { type: 'string', 'x-mcp-header': 'Region' },
                opts: { type: 'object', properties: { dry: { type: 'boolean', 'x-mcp-header': 'Dry' } } }
            }
        });
        expect(ok).toEqual([{ name: 'Region', path: ['region'], type: 'string' }, { name: 'Dry', path: ['opts', 'dry'], type: 'boolean' }]);
        // Dentro de items no es una ruta estática: la herramienta es inválida
        expect(mcpParamHeaders({ type: 'object', properties: { l: { type: 'array', items: { type: 'string', 'x-mcp-header': 'X' } } } })).toBeNull();
        // number no está permitido
        expect(mcpParamHeaders({ type: 'object', properties: { n: { type: 'number', 'x-mcp-header': 'N' } } })).toBeNull();
    });
});

describe('OAuth', () => {
    it('lee resource_metadata y scope del WWW-Authenticate', () => {
        expect(parseWWWAuthenticate('Bearer resource_metadata="https://x/.well-known/oauth-protected-resource/mcp", scope="read write"'))
            .toEqual({ resourceMetadata: 'https://x/.well-known/oauth-protected-resource/mcp', scope: 'read write' });
        expect(parseWWWAuthenticate('Basic realm="x"')).toEqual({});
    });

    it('arma la URL canónica del recurso', () => {
        expect(canonicalResource('https://mcp.ejemplo.com/mcp/#frag')).toBe('https://mcp.ejemplo.com/mcp');
        expect(canonicalResource('https://mcp.ejemplo.com/')).toBe('https://mcp.ejemplo.com/');
    });
});

describe('validateArgs', () => {
    const schema = {
        type: 'object',
        required: ['ciudad'],
        properties: {
            ciudad: { type: 'string', minLength: 2 },
            dias: { type: 'integer', minimum: 1, maximum: 10 },
            unidad: { type: 'string', enum: ['c', 'f'] },
            detalle: { type: 'boolean' }
        }
    };

    it('corrige tipos típicos y deja pasar lo válido', () => {
        const r = validateArgs(schema, { ciudad: 'Bariloche', dias: '3', detalle: 'true' });
        expect(r.errors).toEqual([]);
        expect(r.value).toEqual({ ciudad: 'Bariloche', dias: 3, detalle: true });
    });

    it('explica lo que falta o está fuera de rango', () => {
        const r = validateArgs(schema, { dias: 20, unidad: 'k' });
        expect(r.errors.join(' | ')).toMatch(/obligatorio "ciudad"/);
        expect(r.errors.join(' | ')).toMatch(/máximo 10/);
        expect(r.errors.join(' | ')).toMatch(/uno de "c", "f"/);
    });
});
