/**
 * ============================================================================
 * CONFIG BACKUP - Exportar / importar TODA la configuración a un archivo local
 * ============================================================================
 *
 * Nodemat guarda todo en el navegador (localStorage + IndexedDB); ningún
 * servidor guarda configuración. Este módulo permite llevarse esa configuración
 * a un archivo (.json) para respaldarla o pasarla a otra PC/navegador.
 *
 * Como el archivo contiene API keys y tokens, se puede cifrar con contraseña:
 *   - Clave: PBKDF2-SHA256 (310.000 iteraciones) a partir de la contraseña
 *   - Cifrado: AES-GCM 256 bits (Web Crypto, nativo del navegador)
 * Sin la contraseña el archivo no se puede leer, y nadie (ni Nodemat) puede recuperarla.
 */

import { AppSettings, ChatSession } from '../types';
import { downloadBlob, normalizeImportedSessions } from './fileService';

const FORMAT = 'nodemat-config';
const PBKDF2_ITERATIONS = 310_000;

interface BackupPayload {
    settings: Partial<AppSettings>;
    sessions?: ChatSession[];
}

interface BackupFile {
    format: typeof FORMAT;
    version: 1;
    createdAt: string;
    encrypted: boolean;
    data?: BackupPayload;
    crypto?: { salt: string; iv: string; iterations: number; ciphertext: string };
}

// ----------------------------------------------------------------------------
// Cifrado
// ----------------------------------------------------------------------------

const toB64 = (buf: ArrayBuffer | Uint8Array) => {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
};
const fromB64 = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

async function deriveKey(password: string, salt: Uint8Array, iterations: number) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
        base,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

async function encrypt(payload: BackupPayload, password: string) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(payload)));
    return { salt: toB64(salt), iv: toB64(iv), iterations: PBKDF2_ITERATIONS, ciphertext: toB64(ciphertext) };
}

async function decrypt(c: NonNullable<BackupFile['crypto']>, password: string): Promise<BackupPayload> {
    const key = await deriveKey(password, fromB64(c.salt), c.iterations);
    try {
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(c.iv) }, key, fromB64(c.ciphertext));
        return JSON.parse(new TextDecoder().decode(plain));
    } catch {
        throw new Error('Contraseña incorrecta o archivo dañado.');
    }
}

// ----------------------------------------------------------------------------
// Exportar
// ----------------------------------------------------------------------------

/** Limpia el estado "en vivo" que no tiene sentido guardar (conexiones, errores). */
function sanitizeSettings(settings: AppSettings): Partial<AppSettings> {
    return {
        ...settings,
        mcpServers: settings.mcpServers.map(s => ({ ...s, status: 'idle', errorMessage: '' }))
    };
}

export async function exportConfig(settings: AppSettings, options: { password?: string; sessions?: ChatSession[] }) {
    const payload: BackupPayload = { settings: sanitizeSettings(settings), ...(options.sessions ? { sessions: options.sessions } : {}) };
    const file: BackupFile = {
        format: FORMAT,
        version: 1,
        createdAt: new Date().toISOString(),
        encrypted: !!options.password,
        ...(options.password ? { crypto: await encrypt(payload, options.password) } : { data: payload })
    };
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }),
        `nodemat-config_${stamp}${options.password ? '_cifrado' : ''}.json`);
}

// ----------------------------------------------------------------------------
// Importar
// ----------------------------------------------------------------------------

export async function readConfigFile(file: File): Promise<BackupFile> {
    let parsed: any;
    try { parsed = JSON.parse(await file.text()); } catch { throw new Error('El archivo no es JSON válido.'); }
    if (parsed?.format !== FORMAT) throw new Error('No es un archivo de configuración de Nodemat (para chats usa "Importar Chats").');
    return parsed;
}

export async function openConfigFile(backup: BackupFile, password?: string): Promise<{ settings: Partial<AppSettings>; sessions: ChatSession[] }> {
    let payload: BackupPayload;
    if (backup.encrypted) {
        if (!password) throw new Error('Este archivo está cifrado: ingresa la contraseña.');
        payload = await decrypt(backup.crypto!, password);
    } else {
        payload = backup.data!;
    }
    const settings = { ...(payload.settings || {}) };
    if (Array.isArray(settings.mcpServers)) {
        settings.mcpServers = settings.mcpServers.map(s => ({ ...s, status: 'idle', errorMessage: '' }));
    }
    return { settings, sessions: payload.sessions ? normalizeImportedSessions(payload.sessions) : [] };
}
