/**
 * ============================================================================
 * TRANSCRIPTION SERVICE - Audio a texto
 * ============================================================================
 *
 * Se usa para los audios adjuntos y para el dictado por micrófono. Prueba,
 * en este orden, con la primera API key que tengas cargada:
 *   1. Groq   -> whisper-large-v3-turbo (rápido y barato)
 *   2. OpenAI -> gpt-4o-mini-transcribe
 *   3. Gemini -> un modelo multimodal al que se le pide la transcripción
 *
 * EDUCATIVO: Groq y OpenAI exponen el mismo endpoint `/audio/transcriptions`
 * (multipart/form-data con el archivo). Gemini no tiene endpoint de
 * transcripción: se le manda el audio como `inlineData` y se le pide el texto.
 */

import { AppSettings } from '../types';

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;   // límite de Groq y OpenAI

export function transcriptionProvider(settings: AppSettings): string | null {
    if (settings.groqKey) return 'Groq (Whisper)';
    if (settings.openaiKey) return 'OpenAI';
    if (settings.geminiKey) return 'Gemini';
    return null;
}

const blobToBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
});

async function whisperLike(url: string, key: string, model: string, blob: Blob, filename: string, signal?: AbortSignal) {
    const form = new FormData();
    form.append('file', blob, filename);
    form.append('model', model);
    form.append('response_format', 'json');
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error?.message || `Error ${res.status} al transcribir`);
    return String(data.text || '').trim();
}

export async function transcribeAudio(blob: Blob, filename: string, settings: AppSettings, signal?: AbortSignal): Promise<string> {
    if (blob.size > MAX_AUDIO_BYTES) throw new Error('El audio supera 25 MB: el límite de los servicios de transcripción.');

    if (settings.groqKey) {
        return whisperLike('https://api.groq.com/openai/v1/audio/transcriptions', settings.groqKey, 'whisper-large-v3-turbo', blob, filename, signal);
    }
    if (settings.openaiKey) {
        return whisperLike('https://api.openai.com/v1/audio/transcriptions', settings.openaiKey, 'gpt-4o-mini-transcribe', blob, filename, signal);
    }
    if (settings.geminiKey) {
        const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.geminiKey },
            body: JSON.stringify({
                contents: [{
                    role: 'user',
                    parts: [
                        { inlineData: { mimeType: blob.type || 'audio/webm', data: await blobToBase64(blob) } },
                        { text: 'Transcribe este audio palabra por palabra, en su idioma original. Devuelve sólo la transcripción.' }
                    ]
                }]
            }),
            signal
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error?.message || `Error ${res.status} al transcribir`);
        return (data.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('').trim();
    }
    throw new Error('Para transcribir audio hace falta una API key de Groq, OpenAI o Gemini (Ajustes).');
}
