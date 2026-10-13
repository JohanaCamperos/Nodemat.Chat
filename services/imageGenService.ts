/**
 * ============================================================================
 * IMAGE GENERATION SERVICE
 * ============================================================================
 *
 * Cada proveedor expone la generación de imágenes de forma distinta:
 *
 * | Proveedor  | Endpoint                                  | Formato de salida              |
 * |------------|-------------------------------------------|--------------------------------|
 * | OpenAI     | /v1/images/generations  (y /edits)        | data[].b64_json                |
 * | OpenRouter | /api/v1/chat/completions + modalities     | choices[0].message.images[]    |
 * | Gemini     | :generateContent (modelos *-image)        | candidates[0].content.parts[].inlineData |
 * | Imagen     | :predict (modelos imagen-*)               | predictions[].bytesBase64Encoded |
 * | xAI        | /v1/images/generations                    | data[].b64_json                |
 *
 * Siempre pedimos/convertimos a base64 (data URL): las URLs temporales que
 * devuelven algunos proveedores expiran y rompen el historial del chat.
 */

import { Provider } from "../types";

export type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

export interface GeneratedImage {
    url: string;          // data URL (o URL remota si no se pudo convertir)
    mimeType: string;
}

export interface ImageGenRequest {
    prompt: string;
    model: string;
    apiKey: string;
    provider: Provider;
    aspectRatio?: AspectRatio;
    n?: number;
    quality?: 'auto' | 'low' | 'medium' | 'high';
    /** Imágenes de referencia (data URLs) para edición / variaciones */
    referenceImages?: string[];
    customUrl?: string;
    signal?: AbortSignal;
}

export interface ImageGenResponse {
    images: GeneratedImage[];
    /** Primera imagen (compatibilidad con la API anterior) */
    url?: string;
    text?: string;
    revised_prompt?: string;
    error?: string;
    logs: any;
}

// ============================================================================
// HELPERS
// ============================================================================

const OPENAI_SIZES: Record<string, Record<AspectRatio, string>> = {
    'gpt-image': { '1:1': '1024x1024', '16:9': '1536x1024', '4:3': '1536x1024', '9:16': '1024x1536', '3:4': '1024x1536' },
    'dall-e-3': { '1:1': '1024x1024', '16:9': '1792x1024', '4:3': '1792x1024', '9:16': '1024x1792', '3:4': '1024x1792' },
    'dall-e-2': { '1:1': '1024x1024', '16:9': '1024x1024', '4:3': '1024x1024', '9:16': '1024x1024', '3:4': '1024x1024' }
};

const openAIFamily = (model: string) =>
    model.includes('dall-e-2') ? 'dall-e-2' : model.includes('dall-e-3') ? 'dall-e-3' : 'gpt-image';

/** Reemplaza strings enormes (base64) para que los logs sean legibles. */
function redactLarge(value: any): any {
    if (typeof value === 'string') {
        if (value.length > 300 && (value.startsWith('data:') || /^[A-Za-z0-9+/=\s]+$/.test(value.slice(0, 300)))) {
            return `[BASE64 ${Math.round(value.length / 1024)} KB OMITIDO]`;
        }
        return value;
    }
    if (Array.isArray(value)) return value.map(redactLarge);
    if (value && typeof value === 'object') {
        const out: any = {};
        for (const k of Object.keys(value)) out[k] = redactLarge(value[k]);
        return out;
    }
    return value;
}

function dataUrlToBlob(dataUrl: string): Blob {
    const [head, b64] = dataUrl.split(',');
    const mime = head.match(/data:([^;]+)/)?.[1] || 'image/png';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
}

/** Intenta convertir una URL remota a data URL (si CORS lo permite). */
async function toDataUrl(url: string): Promise<GeneratedImage> {
    if (url.startsWith('data:')) return { url, mimeType: url.match(/^data:([^;]+)/)?.[1] || 'image/png' };
    try {
        const res = await fetch(url);
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result as string);
            r.onerror = reject;
            r.readAsDataURL(blob);
        });
        return { url: dataUrl, mimeType: blob.type || 'image/png' };
    } catch {
        return { url, mimeType: 'image/png' };
    }
}

function mapProviderError(provider: string, status: number, msg: string): string {
    if (status === 401 || status === 403 || /401|invalid api key/i.test(msg)) return "Error de autenticación: verifica tu API Key (y que tu cuenta tenga acceso a este modelo).";
    if (status === 404 && provider === 'gemini') return "Modelo de imagen no encontrado o no habilitado para tu API key de Google.";
    if (status === 429) return "Límite de uso alcanzado (429). Espera un momento o revisa tu cuota/saldo.";
    if (/safety|content_policy|moderation/i.test(msg)) return `El proveedor rechazó el prompt por políticas de contenido: ${msg}`;
    return msg;
}

// ============================================================================
// LISTADO DE MODELOS DE IMAGEN
// ============================================================================

const IMAGE_FALLBACKS: Partial<Record<Provider, string[]>> = {
    openai: ['gpt-image-1', 'gpt-image-1-mini', 'dall-e-3', 'dall-e-2'],
    openrouter: ['google/gemini-2.5-flash-image'],
    gemini: ['gemini-2.5-flash-image', 'imagen-4.0-generate-001', 'imagen-4.0-fast-generate-001'],
    xai: ['grok-2-image-1212']
};

export const IMAGE_PROVIDERS: Provider[] = ['openrouter', 'openai', 'gemini', 'xai', 'custom1', 'custom2'];

/**
 * Obtiene sólo los modelos capaces de generar imágenes.
 * OpenRouter publica `architecture.output_modalities`, lo que permite un filtro exacto.
 */
export async function fetchImageModels(provider: Provider, apiKey: string, customUrl?: string): Promise<string[]> {
    const fallback = IMAGE_FALLBACKS[provider] || [];
    try {
        if (provider === 'openrouter') {
            const res = await fetch('https://openrouter.ai/api/v1/models');
            const data = await res.json();
            const list = (data.data || [])
                .filter((m: any) => m.architecture?.output_modalities?.includes('image'))
                .map((m: any) => m.id);
            return list.length ? list : fallback;
        }
        if (provider === 'gemini') {
            const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { headers: { 'x-goog-api-key': apiKey } });
            const data = await res.json();
            const list = (data.models || [])
                .map((m: any) => ({ id: m.name.replace('models/', ''), methods: m.supportedGenerationMethods || [] }))
                .filter((m: any) => m.id.startsWith('imagen') || (m.id.includes('image') && m.methods.includes('generateContent')))
                .map((m: any) => m.id);
            return list.length ? list : fallback;
        }
        const base = provider === 'openai' ? 'https://api.openai.com/v1'
            : provider === 'xai' ? 'https://api.x.ai/v1'
                : (customUrl || '').replace(/\/+$/, '');
        if (!base) return fallback;
        const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
        if (!res.ok) return fallback;
        const data = await res.json();
        const ids: string[] = (data.data || []).map((m: any) => m.id);
        const filtered = ids.filter(id => /gpt-image|dall-e|image|flux|sdxl|stable-diffusion/i.test(id));
        return filtered.length ? filtered : (provider.startsWith('custom') ? ids : fallback);
    } catch {
        return fallback;
    }
}

// ============================================================================
// GENERACIÓN
// ============================================================================

export const imageGenService = {
    async generateImage(req: ImageGenRequest): Promise<ImageGenResponse> {
        const { prompt, model, apiKey, provider, aspectRatio = '1:1', n = 1, quality = 'auto', customUrl, signal } = req;
        // Sólo data URLs: una URL remota no se puede convertir a Blob sin CORS
        const referenceImages = (req.referenceImages || []).filter(r => r.startsWith('data:'));

        let endpoint = '';
        let init: RequestInit;
        let loggedBody: any;
        const headers: Record<string, string> = {};

        // --- Provider Routing ---------------------------------------------------

        if (provider === 'openai' || provider === 'xai' || provider === 'custom1' || provider === 'custom2') {
            const base = provider === 'openai' ? 'https://api.openai.com/v1'
                : provider === 'xai' ? 'https://api.x.ai/v1'
                    : (customUrl || '').replace(/\/+$/, '');
            headers['Authorization'] = `Bearer ${apiKey}`;
            const family = openAIFamily(model);

            if (provider === 'openai' && referenceImages.length > 0) {
                // Edición: /images/edits usa multipart/form-data
                if (family === 'dall-e-3') {
                    return { images: [], error: 'DALL·E 3 no admite imágenes de referencia. Usa gpt-image-1.', logs: { provider, model } };
                }
                endpoint = `${base}/images/edits`;
                const form = new FormData();
                form.append('model', model);
                form.append('prompt', prompt);
                form.append('n', String(n));
                form.append('size', OPENAI_SIZES[family][aspectRatio]);
                referenceImages.forEach((img, i) => form.append(family === 'dall-e-2' ? 'image' : 'image[]', dataUrlToBlob(img), `ref-${i}.png`));
                if (family === 'dall-e-2') form.append('response_format', 'b64_json');
                init = { method: 'POST', headers, body: form, signal };
                loggedBody = { model, prompt, n, size: OPENAI_SIZES[family][aspectRatio], image: `[${referenceImages.length} imagen(es) de referencia]` };
            } else {
                endpoint = `${base}/images/generations`;
                const body: any = { model, prompt, n };
                if (provider === 'openai') {
                    body.size = OPENAI_SIZES[family][aspectRatio];
                    if (family === 'gpt-image') {
                        if (quality !== 'auto') body.quality = quality;   // gpt-image siempre devuelve b64_json
                    } else {
                        body.response_format = 'b64_json';
                        if (family === 'dall-e-3') body.n = 1;           // DALL·E 3 solo admite n=1
                    }
                } else {
                    body.response_format = 'b64_json';
                }
                headers['Content-Type'] = 'application/json';
                init = { method: 'POST', headers, body: JSON.stringify(body), signal };
                loggedBody = body;
            }
        } else if (provider === 'openrouter') {
            // OpenRouter: chat completions con `modalities` que incluye "image"
            endpoint = "https://openrouter.ai/api/v1/chat/completions";
            headers['Authorization'] = `Bearer ${apiKey}`;
            headers['Content-Type'] = 'application/json';
            headers['HTTP-Referer'] = window.location.origin;
            headers['X-Title'] = 'Nodemat Chat';
            const content = referenceImages.length
                ? [{ type: 'text', text: prompt }, ...referenceImages.map(url => ({ type: 'image_url', image_url: { url } }))]
                : prompt;
            const body = {
                model,
                messages: [{ role: 'user', content }],
                modalities: ['image', 'text'],
                image_config: { aspect_ratio: aspectRatio }
            };
            init = { method: 'POST', headers, body: JSON.stringify(body), signal };
            loggedBody = body;
        } else if (provider === 'gemini') {
            headers['x-goog-api-key'] = apiKey;
            headers['Content-Type'] = 'application/json';
            let body: any;
            if (model.startsWith('imagen')) {
                // Imagen: endpoint :predict
                endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict`;
                body = { instances: [{ prompt }], parameters: { sampleCount: Math.min(n, 4), aspectRatio } };
                if (referenceImages.length) {
                    return { images: [], error: 'Los modelos Imagen no admiten imágenes de referencia. Usa gemini-2.5-flash-image.', logs: { provider, model } };
                }
            } else {
                // Gemini con salida de imagen ("Nano Banana"): generateContent
                endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
                const parts: any[] = [{ text: prompt }];
                referenceImages.forEach(url => {
                    const m = url.match(/^data:([^;]+);base64,(.+)$/);
                    if (m) parts.push({ inlineData: { mimeType: m[1], data: m[2] } });
                });
                body = {
                    contents: [{ role: 'user', parts }],
                    generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio } }
                };
            }
            init = { method: 'POST', headers, body: JSON.stringify(body), signal };
            loggedBody = body;
        } else {
            return {
                images: [],
                error: `La generación de imágenes con ${provider} no está soportada.`,
                logs: { provider }
            };
        }

        const logs: any = {
            timestamp: new Date().toISOString(),
            provider,
            endpoint,
            request: {
                headers: Object.fromEntries(Object.keys(headers).map(k =>
                    [k, /authorization|api-key/i.test(k) ? '[REDACTED]' : headers[k]])),
                body: redactLarge(loggedBody)
            },
            response: null
        };

        try {
            const started = performance.now();
            const response = await fetch(endpoint, init);
            const text = await response.text();
            let data: any;
            try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 1000) }; }

            logs.response = { status: response.status, durationMs: Math.round(performance.now() - started), data: redactLarge(data) };

            if (!response.ok) {
                const errorMsg = data.error?.message || (data.error && JSON.stringify(data.error)) || data.raw || `Error ${response.status}`;
                return { images: [], error: mapProviderError(provider, response.status, errorMsg), logs };
            }

            // --- Response Parsing ---------------------------------------------
            let images: GeneratedImage[] = [];
            let responseText: string | undefined;
            let revised: string | undefined;

            if (Array.isArray(data.data)) {
                // OpenAI / xAI / custom
                images = await Promise.all(data.data.map((d: any) =>
                    d.b64_json
                        ? Promise.resolve({ url: `data:image/${data.output_format || 'png'};base64,${d.b64_json}`, mimeType: `image/${data.output_format || 'png'}` })
                        : toDataUrl(d.url)
                ));
                revised = data.data[0]?.revised_prompt;
            } else if (Array.isArray(data.predictions)) {
                // Imagen
                images = data.predictions
                    .filter((p: any) => p.bytesBase64Encoded)
                    .map((p: any) => ({ url: `data:${p.mimeType || 'image/png'};base64,${p.bytesBase64Encoded}`, mimeType: p.mimeType || 'image/png' }));
            } else if (data.candidates) {
                // Gemini generateContent
                const parts: any[] = data.candidates?.[0]?.content?.parts || [];
                images = parts.filter(p => p.inlineData?.data).map(p => ({
                    url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`,
                    mimeType: p.inlineData.mimeType
                }));
                responseText = parts.filter(p => p.text && !p.thought).map(p => p.text).join('\n') || undefined;
            } else if (data.choices) {
                // OpenRouter: las imágenes vienen en choices[0].message.images
                const message = data.choices?.[0]?.message || {};
                const raw: any[] = message.images || data.choices?.[0]?.images || [];
                const urls: string[] = raw.map(i => i?.image_url?.url || i?.url).filter(Boolean);

                // Fallback: algunos modelos devuelven la URL en markdown
                if (urls.length === 0 && typeof message.content === 'string') {
                    const md = message.content.match(/!\[.*?\]\(((?:https?:|data:)[^\s)]+)\)/);
                    if (md) urls.push(md[1]);
                }
                images = await Promise.all(urls.map(toDataUrl));
                responseText = typeof message.content === 'string' && message.content.trim() ? message.content : undefined;
            }

            if (images.length === 0) {
                return {
                    images: [],
                    text: responseText,
                    error: responseText
                        ? `El modelo respondió con texto pero sin imagen: "${responseText.slice(0, 200)}"`
                        : "El modelo no devolvió ninguna imagen. ¿Es un modelo de generación de imágenes?",
                    logs
                };
            }

            return { images, url: images[0].url, text: responseText, revised_prompt: revised, logs };

        } catch (error: any) {
            if (error?.name === 'AbortError') {
                logs.response = { error: 'Cancelado' };
                return { images: [], error: 'Generación cancelada.', logs };
            }
            logs.response = { error: error.message };
            const msg = /Failed to fetch|NetworkError/i.test(error.message)
                ? 'No se pudo conectar con el proveedor (red o CORS).'
                : error.message;
            return { images: [], error: msg, logs };
        }
    }
};
