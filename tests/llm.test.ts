import { describe, expect, it } from 'vitest';
import { buildFileRefs, collectGeminiStream, collectOpenAIStream, resolveFileRefs } from '../services/llmService';
import { buildAnthropicRequest, collectAnthropicStream } from '../services/anthropicProvider';
import { Message } from '../types';

const sse = (events: any[], named = false) => new Blob(events.map(e =>
    (named ? `event: ${e.type}\n` : '') + `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`)).stream();

describe('streaming OpenAI-compatible', () => {
    it('junta el texto, los argumentos fragmentados y el uso de tokens', async () => {
        const deltas: string[] = [];
        const data = await collectOpenAIStream(sse([
            { id: 'a', choices: [{ delta: { content: 'Ho' } }] },
            { choices: [{ delta: { content: 'la' } }] },
            { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'eco', arguments: '{"m"' } }] } }] },
            { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ':1}' } }] } }] },
            { choices: [], usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 } },
            '[DONE]'
        ]), t => deltas.push(t));
        expect(deltas).toEqual(['Ho', 'Hola']);
        expect(data.choices[0].message.content).toBe('Hola');
        expect(data.choices[0].message.tool_calls).toEqual([{ id: 'c1', type: 'function', function: { name: 'eco', arguments: '{"m":1}' } }]);
        expect(data.usage.total_tokens).toBe(7);
    });

    it('propaga los errores que llegan dentro del stream', async () => {
        await expect(collectOpenAIStream(sse([{ error: { message: 'cuota agotada' } }]), () => { })).rejects.toThrow('cuota agotada');
    });
});

describe('streaming Gemini', () => {
    it('une los trozos de texto y conserva la firma de la llamada', async () => {
        const data = await collectGeminiStream(sse([
            { candidates: [{ content: { parts: [{ text: 'Hola ' }] } }] },
            { candidates: [{ content: { parts: [{ text: 'mundo' }] } }] },
            { candidates: [{ content: { parts: [{ functionCall: { name: 'eco', args: {} }, thoughtSignature: 'sig' }] } }], usageMetadata: { totalTokenCount: 9 } }
        ]), () => { });
        expect((data as any).candidates[0].content.parts).toEqual([{ text: 'Hola mundo' }, { functionCall: { name: 'eco', args: {} }, thoughtSignature: 'sig' }]);
        expect(data.usageMetadata.totalTokenCount).toBe(9);
    });
});

describe('Anthropic', () => {
    it('arma el pedido: system aparte, bloques, resultados juntos y bloques originales', () => {
        const { body, betas } = buildAnthropicRequest([
            { role: 'system', content: 'Sistema' },
            { role: 'user', content: [{ type: 'text', text: 'mirá' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] },
            { role: 'assistant', content: '', tool_calls: [{ id: 't1', function: { name: 'a', arguments: '{}' } }, { id: 't2', function: { name: 'b', arguments: '{}' } }] },
            { role: 'tool', tool_call_id: 't1', content: 'uno' },
            { role: 'tool', tool_call_id: 't2', content: 'dos' },
            { role: 'assistant', content: 'listo', anthropic_content: [{ type: 'thinking', thinking: 'x', signature: 's' }, { type: 'text', text: 'listo' }] }
        ], [{ function: { name: 'a', description: 'd', parameters: { type: 'object' } } }], 'claude-opus-5-5', true);
        expect(body.system).toBe('Sistema');
        expect(body.messages.map((m: any) => `${m.role}:${m.content.map((b: any) => b.type).join('+')}`))
            .toEqual(['user:image+text', 'assistant:tool_use+tool_use', 'user:tool_result+tool_result', 'assistant:thinking+text']);
        expect(body.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
        expect(body.tools[0]).toMatchObject({ name: 'a', input_schema: { type: 'object' }, eager_input_streaming: true });
        expect(body.fallbacks).toBe('default');
        expect(betas).toEqual(['server-side-fallback-2026-07-01']);
    });

    it('no reenvía lo previo a un fallback que no sea texto', () => {
        const { body } = buildAnthropicRequest([
            { role: 'user', content: 'hola' },
            { role: 'assistant', content: 'x', anthropic_content: [{ type: 'thinking', thinking: 'a', signature: 's' }, { type: 'text', text: 'parcial' }, { type: 'fallback' }, { type: 'text', text: 'final' }] }
        ], [], 'claude-haiku-5-5', false);
        expect(body.messages[1].content).toEqual([{ type: 'text', text: 'parcial' }, { type: 'text', text: 'final' }]);
        expect(body.fallbacks).toBeUndefined();
        expect(body.max_tokens).toBe(16000);
    });

    it('lee el stream: texto, razonamiento firmado y herramienta por partes', async () => {
        const data = await collectAnthropicStream(sse([
            { type: 'message_start', message: { id: 'm', model: 'claude-opus-5-5', usage: { input_tokens: 10 } } },
            { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
            { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'pienso' } },
            { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'SIG' } },
            { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tu', name: 'eco', input: {} } },
            { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"a":' } },
            { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '2}' } },
            { type: 'content_block_stop', index: 1 },
            { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 5 } }
        ], true), () => { });
        expect(data.reasoning).toBe('pienso');
        expect(data.anthropic_content[0]).toEqual({ type: 'thinking', thinking: 'pienso', signature: 'SIG' });
        expect(data.choices[0].message.tool_calls![0].function.arguments).toBe('{"a":2}');
        expect(data.usage).toEqual({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });
    });

    it('explica los rechazos', async () => {
        const data = await collectAnthropicStream(sse([
            { type: 'message_start', message: { usage: {} } },
            { type: 'message_delta', delta: { stop_reason: 'refusal', stop_details: { category: 'cyber' } }, usage: { output_tokens: 0 } }
        ], true), () => { });
        expect(data.choices[0].message.content).toMatch(/rechazó.*cyber/);
    });
});

describe('archivos para herramientas MCP', () => {
    const history: Message[] = [
        { id: '1', role: 'user', content: 'x', timestamp: 1, attachments: [
            { name: 'informe.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data: 'data:application/x;base64,QUJD', extractedText: 'texto' },
            { name: 'notas.txt', type: 'text/plain', data: 'hola ñ' }
        ] },
        { id: '2', role: 'user', content: 'y', timestamp: 2, attachments: [{ name: 'notas.txt', type: 'text/plain', data: 'otra' }] }
    ];

    it('da una referencia única a cada adjunto', () => {
        expect([...buildFileRefs(history).keys()]).toEqual([
            'nodemat://adjunto/informe.docx', 'nodemat://adjunto/notas.txt', 'nodemat://adjunto/notas.txt-2'
        ]);
    });

    it('reemplaza las referencias por el contenido en el formato pedido', () => {
        const refs = buildFileRefs(history);
        expect(resolveFileRefs({
            a: 'nodemat://adjunto/informe.docx',
            b: ['nodemat://adjunto/informe.docx?formato=texto', 'nodemat://adjunto/notas.txt'],
            c: { d: 'nodemat://adjunto/notas.txt?formato=dataurl' },
            e: 'nodemat://adjunto/no-existe'
        }, refs)).toEqual({
            a: 'QUJD',
            b: ['texto', 'hola ñ'],
            c: { d: `data:text/plain;base64,${Buffer.from('hola ñ').toString('base64')}` },
            e: 'nodemat://adjunto/no-existe'
        });
    });
});
