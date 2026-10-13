/**
 * ============================================================================
 * FILE SERVICE - Adjuntar, descargar, compartir y exportar
 * ============================================================================
 *
 * - Lectura de archivos del usuario (imágenes, PDF y texto/código)
 * - Reducción automática de imágenes grandes (ahorra tokens y almacenamiento)
 * - Compartir con la Web Share API (móviles / Windows / macOS) con fallback
 *   a portapapeles o descarga
 * - Exportar / importar conversaciones (JSON y Markdown)
 */

import { Attachment, ChatSession, Message } from '../types';

// ============================================================================
// LÍMITES Y TIPOS PERMITIDOS
// ============================================================================

export const MAX_IMAGE_INPUT_BYTES = 20 * 1024 * 1024;  // se reduce luego
export const MAX_PDF_BYTES = 15 * 1024 * 1024;
export const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_SIDE = 2048;

const TEXT_EXTENSIONS = [
    'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'xml', 'yaml', 'yml', 'toml', 'ini', 'log',
    'html', 'htm', 'css', 'scss', 'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'py', 'ipynb', 'java', 'kt', 'c', 'h',
    'cpp', 'hpp', 'cs', 'go', 'rs', 'rb', 'php', 'swift', 'sql', 'sh', 'bash', 'ps1', 'bat', 'r', 'lua', 'dart', 'vue', 'svelte'
];

export const ACCEPT_ATTRIBUTE = ['image/*', 'application/pdf', ...TEXT_EXTENSIONS.map(e => `.${e}`)].join(',');

const extOf = (name: string) => name.toLowerCase().split('.').pop() || '';

export type FileKind = 'image' | 'pdf' | 'text' | 'unsupported';

export function classifyFile(file: File): FileKind {
    // SVG es texto (XML): los modelos de visión no lo aceptan como imagen
    if (file.type === 'image/svg+xml' || extOf(file.name) === 'svg') return 'text';
    if (file.type.startsWith('image/')) return 'image';
    if (file.type === 'application/pdf' || extOf(file.name) === 'pdf') return 'pdf';
    if (file.type.startsWith('text/') || file.type === 'application/json' || TEXT_EXTENSIONS.includes(extOf(file.name))) return 'text';
    return 'unsupported';
}

export const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// ============================================================================
// LECTURA
// ============================================================================

const readAs = (file: Blob, mode: 'dataURL' | 'text') => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error('Error leyendo el archivo'));
    mode === 'dataURL' ? reader.readAsDataURL(file) : reader.readAsText(file);
});

/**
 * Reduce una imagen si supera MAX_IMAGE_SIDE px o ~1.5 MB.
 * Los modelos de visión re-escalan internamente, así que enviar 4000px sólo
 * gasta ancho de banda, tokens y espacio en IndexedDB.
 */
async function downscaleImage(file: File): Promise<{ data: string; type: string }> {
    const original = await readAs(file, 'dataURL');
    if (file.type === 'image/gif' || file.type === 'image/svg+xml') return { data: original, type: file.type };

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Imagen inválida'));
        el.src = original;
    });

    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.width, img.height));
    if (scale === 1 && file.size <= 1.5 * 1024 * 1024) return { data: original, type: file.type };

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);

    const keepPng = file.type === 'image/png' && file.size <= 3 * 1024 * 1024;
    const type = keepPng ? 'image/png' : 'image/jpeg';
    return { data: canvas.toDataURL(type, 0.88), type };
}

/**
 * Convierte un File en Attachment. Lanza un Error con mensaje legible si no se puede.
 */
export async function fileToAttachment(file: File): Promise<Attachment> {
    const kind = classifyFile(file);

    if (kind === 'image') {
        if (file.size > MAX_IMAGE_INPUT_BYTES) throw new Error(`"${file.name}" supera ${formatBytes(MAX_IMAGE_INPUT_BYTES)}.`);
        const { data, type } = await downscaleImage(file);
        const name = file.name || `imagen-pegada-${Date.now()}.${type.split('/')[1]}`;
        return { name, type, data, size: Math.round(data.length * 0.75) };
    }
    if (kind === 'pdf') {
        if (file.size > MAX_PDF_BYTES) throw new Error(`"${file.name}" supera ${formatBytes(MAX_PDF_BYTES)}.`);
        return { name: file.name, type: 'application/pdf', data: await readAs(file, 'dataURL'), size: file.size };
    }
    if (kind === 'text') {
        if (file.size > MAX_TEXT_BYTES) throw new Error(`"${file.name}" supera ${formatBytes(MAX_TEXT_BYTES)}.`);
        return { name: file.name, type: file.type || 'text/plain', data: await readAs(file, 'text'), size: file.size };
    }
    throw new Error(`El tipo de "${file.name}" no está soportado. Se aceptan imágenes, PDF y archivos de texto/código.`);
}

// ============================================================================
// DESCARGA
// ============================================================================

export function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function urlToBlob(src: string): Promise<Blob> {
    const res = await fetch(src);   // funciona también con data: URLs
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.blob();
}

const extForMime = (mime: string) =>
    ({ 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'text/markdown': 'md', 'text/plain': 'txt', 'application/json': 'json', 'application/pdf': 'pdf' } as Record<string, string>)[mime]
    || mime.split('/')[1] || 'bin';

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

/** Descarga una imagen (data URL o remota) con la extensión correcta. */
export async function downloadImage(src: string, prefix = 'nodemat') {
    try {
        const blob = await urlToBlob(src);
        downloadBlob(blob, `${prefix}-${stamp()}.${extForMime(blob.type || 'image/png')}`);
    } catch {
        // CORS bloqueó la descarga: al menos abrirla en otra pestaña
        window.open(src, '_blank', 'noopener');
    }
}

export function downloadAttachment(att: Attachment) {
    const blob = att.data.startsWith('data:')
        ? dataUrlToBlobSync(att.data)
        : new Blob([att.data], { type: att.type || 'text/plain' });
    downloadBlob(blob, att.name || `adjunto.${extForMime(att.type)}`);
}

function dataUrlToBlobSync(dataUrl: string): Blob {
    const [head, b64] = dataUrl.split(',');
    const mime = head.match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
}

// ============================================================================
// COMPARTIR
// ============================================================================

export type ShareOutcome = 'shared' | 'copied' | 'downloaded' | 'cancelled' | 'failed';

/**
 * Comparte un archivo con la hoja nativa del sistema (WhatsApp, Mail, etc.).
 * Fallback: copiar al portapapeles (imágenes) o descargar.
 */
export async function shareFile(blob: Blob, filename: string, title = 'Nodemat Chat', text?: string): Promise<ShareOutcome> {
    const file = new File([blob], filename, { type: blob.type });
    try {
        if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title, text });
            return 'shared';
        }
    } catch (e: any) {
        if (e?.name === 'AbortError') return 'cancelled';
    }
    try {
        if (blob.type.startsWith('image/') && 'ClipboardItem' in window && navigator.clipboard?.write) {
            // El portapapeles sólo acepta PNG de forma universal
            const png = blob.type === 'image/png' ? blob : await convertToPng(blob);
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
            return 'copied';
        }
    } catch { /* seguimos al fallback */ }
    downloadBlob(blob, filename);
    return 'downloaded';
}

export async function shareImage(src: string, title = 'Imagen generada con Nodemat'): Promise<ShareOutcome> {
    try {
        const blob = await urlToBlob(src);
        return shareFile(blob, `nodemat-${stamp()}.${extForMime(blob.type || 'image/png')}`, title);
    } catch {
        return 'failed';
    }
}

export async function shareText(text: string, title = 'Nodemat Chat'): Promise<ShareOutcome> {
    try {
        if (navigator.share && text.length < 50_000) {
            await navigator.share({ title, text });
            return 'shared';
        }
    } catch (e: any) {
        if (e?.name === 'AbortError') return 'cancelled';
    }
    return (await copyText(text)) ? 'copied' : 'failed';
}

export async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

async function convertToPng(blob: Blob): Promise<Blob> {
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0);
    return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob falló')), 'image/png'));
}

export const shareOutcomeLabel: Record<ShareOutcome, string> = {
    shared: 'Compartido',
    copied: 'Copiado al portapapeles',
    downloaded: 'Descargado',
    cancelled: 'Cancelado',
    failed: 'No se pudo compartir'
};

// ============================================================================
// EXPORTAR / IMPORTAR CONVERSACIONES
// ============================================================================

const safeName = (s: string) => (s || 'chat').replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40);

/**
 * Convierte una conversación a Markdown legible.
 * @param embedImages si es true, las imágenes quedan embebidas como data URL
 *                    (archivo autocontenido pero pesado).
 */
export function sessionToMarkdown(session: ChatSession, embedImages = false): string {
    const lines: string[] = [`# ${session.title}`, '', `_Exportado desde Nodemat Chat — ${new Date().toLocaleString()}_`, ''];

    const imageRef = (att: Attachment) => embedImages ? `![${att.name}](${att.data})` : `_[imagen: ${att.name}]_`;
    const who = (m: Message) => m.role === 'user' ? '🧑 Usuario' : m.role === 'tool' ? `🔧 Herramienta \`${m.toolMeta?.originalName || m.name}\`` : m.role === 'system' ? '⚠️ Sistema' : '🤖 Nodemat AI';

    session.messages.forEach(m => {
        lines.push(`### ${who(m)} · ${new Date(m.timestamp).toLocaleString()}`, '');
        if (m.toolCalls?.length) {
            m.toolCalls.forEach(tc => lines.push(`> Llamada a \`${tc.function.name}\` con \`${tc.function.arguments}\``));
            lines.push('');
        }
        let content = m.content || '';
        if (!embedImages) content = content.replace(/!\[([^\]]*)\]\(data:[^)]+\)/g, '_[imagen: $1]_');
        if (m.role === 'tool') lines.push('```', content, '```');
        else if (content) lines.push(content);
        m.attachments?.forEach(att => {
            if (att.type.startsWith('image/')) lines.push('', imageRef(att));
            else lines.push('', `📎 _${att.name}_`);
        });
        lines.push('', '---', '');
    });
    return lines.join('\n');
}

export function exportSessionJSON(session: ChatSession) {
    const blob = new Blob([JSON.stringify({ format: 'nodemat-chat', version: 1, sessions: [session] }, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `nodemat_${safeName(session.title)}_${stamp()}.json`);
}

export function exportSessionMarkdown(session: ChatSession, embedImages = true) {
    const blob = new Blob([sessionToMarkdown(session, embedImages)], { type: 'text/markdown' });
    downloadBlob(blob, `nodemat_${safeName(session.title)}_${stamp()}.md`);
}

export async function shareSession(session: ChatSession): Promise<ShareOutcome> {
    const md = sessionToMarkdown(session, false);
    const blob = new Blob([md], { type: 'text/markdown' });
    const file = new File([blob], `nodemat_${safeName(session.title)}.md`, { type: 'text/markdown' });
    try {
        if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: session.title });
            return 'shared';
        }
    } catch (e: any) {
        if (e?.name === 'AbortError') return 'cancelled';
    }
    return shareText(md, session.title);
}

/**
 * Lee un backup (formato nuevo `{format, sessions}`, array de sesiones o una
 * sesión suelta) y devuelve sesiones con IDs nuevos para no pisar las existentes.
 */
export async function importSessionsFromFile(file: File): Promise<ChatSession[]> {
    const text = await readAs(file, 'text');
    let parsed: any;
    try { parsed = JSON.parse(text); } catch { throw new Error('El archivo no es JSON válido.'); }

    if (parsed?.format === 'nodemat-config') {
        throw new Error('Ese archivo es una configuración completa: impórtalo con "Importar configuración".');
    }
    const list: any[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.sessions) ? parsed.sessions : [parsed];
    const sessions = normalizeImportedSessions(list);
    if (sessions.length === 0) throw new Error('No se encontraron conversaciones en el archivo.');
    return sessions;
}

/** Valida sesiones importadas y les asigna IDs nuevos para no pisar las existentes. */
export function normalizeImportedSessions(list: any[]): ChatSession[] {
    const valid = list.filter(s => s && Array.isArray(s.messages));
    return valid.map((s, i) => ({
        id: `${Date.now()}-${i}`,
        title: typeof s.title === 'string' ? s.title : 'Chat importado',
        createdAt: typeof s.createdAt === 'number' ? s.createdAt : Date.now(),
        messages: s.messages
            .filter((m: any) => m && typeof m.role === 'string')
            .map((m: any, j: number) => ({ ...m, id: String(m.id ?? `${Date.now()}-${i}-${j}`), timestamp: m.timestamp || Date.now() }))
    }));
}
