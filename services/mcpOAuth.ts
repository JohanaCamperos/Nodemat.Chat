/**
 * ============================================================================
 * MCP OAUTH - Autorización OAuth 2.1 para servidores MCP remotos
 * ============================================================================
 *
 * Los servidores MCP "de verdad" (GitHub, Notion, Linear, Atlassian, Sentry…)
 * no aceptan un token pegado a mano: piden que la app se autorice con OAuth.
 * La spec MCP (2025-06-18 y posteriores) fija el camino:
 *
 *   1. Descubrimiento del recurso: el servidor MCP responde 401 con
 *      `WWW-Authenticate: Bearer resource_metadata="…"`, o publica
 *      /.well-known/oauth-protected-resource. Ahí dice cuál es su servidor
 *      de autorización (RFC 9728).
 *   2. Metadatos del servidor de autorización (RFC 8414 / OpenID Connect):
 *      endpoints de autorización, token y registro.
 *   3. Registro dinámico del cliente (RFC 7591): Nodemat se da de alta solo
 *      y obtiene un client_id. Si el servidor no lo permite, el usuario puede
 *      cargar un client_id propio.
 *   4. Autorización con PKCE (S256) en una ventana emergente; el parámetro
 *      `resource` (RFC 8707) ata el token a ESTE servidor MCP.
 *   5. Canje del código por tokens, y renovación con el refresh_token.
 *
 * Todo corre en el navegador. Si el servidor de autorización no permite CORS,
 * las peticiones pasan por el proxy /api/mcp (opción "Conectar vía proxy").
 */

import { MCPOAuthState, MCPServer } from '../types';
import { mcpFetch } from './mcpFetch';

export const OAUTH_CALLBACK_PATH = '/oauth/callback';
export const OAUTH_MESSAGE_TYPE = 'nodemat-oauth-callback';
const POPUP_TIMEOUT_MS = 5 * 60_000;

export class MCPAuthRequiredError extends Error {
    constructor(message: string, public resourceMetadataUrl?: string, public scope?: string) {
        super(message);
        this.name = 'MCPAuthRequiredError';
    }
}

// ----------------------------------------------------------------------------
// Utilidades
// ----------------------------------------------------------------------------

const b64url = (bytes: Uint8Array) =>
    btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const randomString = (len = 32) => b64url(crypto.getRandomValues(new Uint8Array(len)));

async function pkcePair() {
    const verifier = randomString(48);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return { verifier, challenge: b64url(new Uint8Array(digest)) };
}

/** URL canónica del recurso (RFC 8707): sin fragmento ni barra final. */
export function canonicalResource(url: string): string {
    const u = new URL(url);
    u.hash = '';
    let s = u.toString();
    if (s.endsWith('/') && u.pathname !== '/') s = s.slice(0, -1);
    return s;
}

export function redirectUri(): string {
    return `${window.location.origin}${OAUTH_CALLBACK_PATH}`;
}

/** Extrae resource_metadata y scope de un header WWW-Authenticate. */
export function parseWWWAuthenticate(header: string | null): { resourceMetadata?: string; scope?: string } {
    if (!header || !/^\s*bearer/i.test(header)) return {};
    const get = (k: string) => header.match(new RegExp(`${k}="([^"]*)"`, 'i'))?.[1];
    return { resourceMetadata: get('resource_metadata'), scope: get('scope') };
}

async function getJson(server: MCPServer, url: string): Promise<any | null> {
    try {
        const res = await mcpFetch(server, url, { headers: { Accept: 'application/json', 'MCP-Protocol-Version': '2025-11-25' } });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

// ----------------------------------------------------------------------------
// Descubrimiento
// ----------------------------------------------------------------------------

interface AuthServerMetadata {
    issuer?: string;
    authorization_endpoint: string;
    token_endpoint: string;
    registration_endpoint?: string;
    scopes_supported?: string[];
    code_challenge_methods_supported?: string[];
}

/** Paso 1: ¿cuál es el servidor de autorización de este servidor MCP? */
async function discoverProtectedResource(server: MCPServer, hint?: string): Promise<{ authServer: string; scopes?: string[] }> {
    const mcpUrl = new URL(server.url);
    const candidates = [
        hint,
        mcpUrl.pathname !== '/' ? `${mcpUrl.origin}/.well-known/oauth-protected-resource${mcpUrl.pathname.replace(/\/$/, '')}` : undefined,
        `${mcpUrl.origin}/.well-known/oauth-protected-resource`
    ].filter(Boolean) as string[];

    for (const url of candidates) {
        const meta = await getJson(server, url);
        if (meta?.authorization_servers?.length) {
            return { authServer: meta.authorization_servers[0], scopes: meta.scopes_supported };
        }
    }
    // Servidores de la spec 2025-03-26: el servidor de autorización es el mismo origen
    return { authServer: mcpUrl.origin };
}

/** Paso 2: endpoints del servidor de autorización. */
async function discoverAuthServer(server: MCPServer, issuer: string): Promise<AuthServerMetadata> {
    const u = new URL(issuer);
    const path = u.pathname.replace(/\/$/, '');
    const candidates = path
        ? [
            `${u.origin}/.well-known/oauth-authorization-server${path}`,
            `${u.origin}/.well-known/openid-configuration${path}`,
            `${u.origin}${path}/.well-known/openid-configuration`
        ]
        : [`${u.origin}/.well-known/oauth-authorization-server`, `${u.origin}/.well-known/openid-configuration`];

    for (const url of candidates) {
        const meta = await getJson(server, url);
        if (meta?.authorization_endpoint && meta?.token_endpoint) return meta;
    }
    // Último recurso (spec 2025-03-26): rutas por defecto
    return {
        issuer: u.origin,
        authorization_endpoint: `${u.origin}/authorize`,
        token_endpoint: `${u.origin}/token`,
        registration_endpoint: `${u.origin}/register`
    };
}

/** Paso 3: registro dinámico del cliente. */
async function registerClient(server: MCPServer, endpoint: string, scope?: string) {
    const res = await mcpFetch(server, endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
            client_name: 'Nodemat Chat',
            client_uri: 'https://github.com/diegoparras/Nodemat-Chat',
            redirect_uris: [redirectUri()],
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: 'none',
            ...(scope ? { scope } : {})
        })
    });
    const text = await res.text();
    if (!res.ok) {
        throw new Error(`El servidor de autorización rechazó el registro automático (${res.status}). ` +
            `Crea una aplicación OAuth en el proveedor con la URL de retorno ${redirectUri()} y carga su Client ID. Detalle: ${text.slice(0, 200)}`);
    }
    const data = JSON.parse(text);
    return { clientId: data.client_id as string, clientSecret: data.client_secret as string | undefined };
}

// ----------------------------------------------------------------------------
// Ventana emergente
// ----------------------------------------------------------------------------

/**
 * Abre la ventana ANTES de cualquier `await`: si se abre después, el navegador
 * la bloquea por no venir directamente de un clic.
 */
export function openAuthPopup(): Window | null {
    return window.open('about:blank', 'nodemat-oauth', 'width=520,height=720');
}

/**
 * Espera el código. No se usa `popup.closed` para detectar que el usuario cerró
 * la ventana: con proveedores que envían Cross-Origin-Opener-Policy (GitHub,
 * Google…) `closed` da true aunque la ventana siga abierta. Para cancelar
 * está el AbortSignal (botón "Cancelar" de la UI).
 */
function waitForCallback(state: string, signal?: AbortSignal): Promise<URLSearchParams> {
    return new Promise((resolve, reject) => {
        let done = false;
        const finish = (fn: () => void) => {
            if (done) return;
            done = true;
            window.removeEventListener('message', onMessage);
            window.removeEventListener('storage', onStorage);
            signal?.removeEventListener('abort', onAbort);
            clearTimeout(timeout);
            fn();
        };
        const handle = (search: string) => {
            const params = new URLSearchParams(search);
            if (params.get('state') !== state) return;
            finish(() => resolve(params));
        };
        const onMessage = (e: MessageEvent) => {
            if (e.origin === window.location.origin && e.data?.type === OAUTH_MESSAGE_TYPE) handle(e.data.search);
        };
        // Si el proveedor cortó el vínculo con la ventana (COOP), el callback avisa por localStorage
        const onStorage = (e: StorageEvent) => {
            if (e.key === OAUTH_MESSAGE_TYPE && e.newValue) handle(JSON.parse(e.newValue).search);
        };
        window.addEventListener('message', onMessage);
        window.addEventListener('storage', onStorage);
        const onAbort = () => finish(() => reject(new Error('Autorización cancelada.')));
        if (signal?.aborted) onAbort();
        signal?.addEventListener('abort', onAbort, { once: true });
        const timeout = setTimeout(() => finish(() => reject(new Error('La autorización tardó demasiado.'))), POPUP_TIMEOUT_MS);
    });
}

/** Lo ejecuta la página /oauth/callback (ver index.tsx). */
export function handleOAuthCallbackPage() {
    const payload = { type: OAUTH_MESSAGE_TYPE, search: window.location.search };
    try { window.opener?.postMessage(payload, window.location.origin); } catch { /* sin opener */ }
    try { localStorage.setItem(OAUTH_MESSAGE_TYPE, JSON.stringify({ ...payload, at: Date.now() })); } catch { /* modo privado */ }
    setTimeout(() => window.close(), 300);
}

// ----------------------------------------------------------------------------
// Tokens
// ----------------------------------------------------------------------------

async function tokenRequest(server: MCPServer, endpoint: string, params: Record<string, string>) {
    const res = await mcpFetch(server, endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams(params).toString()
    });
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = Object.fromEntries(new URLSearchParams(text)); }
    if (!res.ok || !data.access_token) {
        throw new Error(`No se pudo obtener el token (${res.status}): ${data.error_description || data.error || text.slice(0, 200)}`);
    }
    return {
        accessToken: data.access_token as string,
        refreshToken: data.refresh_token as string | undefined,
        expiresAt: data.expires_in ? Date.now() + Number(data.expires_in) * 1000 : undefined
    };
}

function clientCredentials(o: MCPOAuthState) {
    const clientId = o.clientId || o.registeredClientId || '';
    const secret = o.clientId ? o.clientSecret : o.registeredClientSecret;
    return { client_id: clientId, ...(secret ? { client_secret: secret } : {}) };
}

/**
 * Flujo completo. Devuelve el estado OAuth actualizado (tokens incluidos)
 * para guardarlo en los ajustes del servidor.
 */
export async function authorizeServer(
    server: MCPServer,
    popup: Window | null,
    hint: { resourceMetadata?: string; scope?: string } = {},
    log: (msg: string) => void = () => { },
    signal?: AbortSignal
): Promise<MCPOAuthState> {
    if (!popup) throw new Error('El navegador bloqueó la ventana de autorización. Permite ventanas emergentes para este sitio.');
    try {
        const current = server.oauth || {};
        log('Buscando el servidor de autorización…');
        const pr = await discoverProtectedResource(server, hint.resourceMetadata);
        log(`Servidor de autorización: ${pr.authServer}`);
        const meta = await discoverAuthServer(server, pr.authServer);
        const scope = current.scope || hint.scope || pr.scopes?.join(' ') || undefined;

        let state: MCPOAuthState = {
            ...current,
            issuer: meta.issuer || pr.authServer,
            authorizationEndpoint: meta.authorization_endpoint,
            tokenEndpoint: meta.token_endpoint,
            registrationEndpoint: meta.registration_endpoint,
            redirectUri: redirectUri()
        };

        // Re-registrar si cambió la URL de retorno (otro dominio / puerto)
        const needsRegistration = !current.clientId && (!current.registeredClientId || current.redirectUri !== redirectUri());
        if (needsRegistration) {
            if (!meta.registration_endpoint) {
                throw new Error(`Este servidor no permite el registro automático. Crea una aplicación OAuth con la URL de retorno ${redirectUri()} y carga su Client ID en "Opciones de OAuth".`);
            }
            log('Registrando Nodemat como cliente…');
            const reg = await registerClient(server, meta.registration_endpoint, scope);
            state = { ...state, registeredClientId: reg.clientId, registeredClientSecret: reg.clientSecret };
        }

        const { verifier, challenge } = await pkcePair();
        const nonce = randomString(16);
        const authUrl = new URL(meta.authorization_endpoint);
        const params: Record<string, string> = {
            response_type: 'code',
            client_id: clientCredentials(state).client_id,
            redirect_uri: redirectUri(),
            code_challenge: challenge,
            code_challenge_method: 'S256',
            state: nonce,
            resource: canonicalResource(server.url),
            ...(scope ? { scope } : {})
        };
        Object.entries(params).forEach(([k, v]) => authUrl.searchParams.set(k, v));

        log('Esperando que autorices en la ventana emergente…');
        popup.location.href = authUrl.toString();
        const result = await waitForCallback(nonce, signal);
        if (result.get('error')) throw new Error(`Autorización rechazada: ${result.get('error_description') || result.get('error')}`);
        const code = result.get('code');
        if (!code) throw new Error('El servidor de autorización no devolvió un código.');

        log('Canjeando el código por un token…');
        const tokens = await tokenRequest(server, meta.token_endpoint, {
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri(),
            code_verifier: verifier,
            resource: canonicalResource(server.url),
            ...clientCredentials(state)
        });
        log('Autorizado.');
        return { ...state, ...tokens };
    } finally {
        try { popup.close(); } catch { /* ya cerrada */ }
    }
}

/** Renueva el access token con el refresh token. Devuelve null si no se puede. */
export async function refreshServerToken(server: MCPServer): Promise<MCPOAuthState | null> {
    const o = server.oauth;
    if (!o?.refreshToken || !o.tokenEndpoint) return null;
    try {
        const tokens = await tokenRequest(server, o.tokenEndpoint, {
            grant_type: 'refresh_token',
            refresh_token: o.refreshToken,
            resource: canonicalResource(server.url),
            ...clientCredentials(o)
        });
        return { ...o, ...tokens, refreshToken: tokens.refreshToken || o.refreshToken };
    } catch {
        return null;
    }
}

export const oauthTokenExpired = (o?: MCPOAuthState) => !!o?.expiresAt && o.expiresAt - 60_000 < Date.now();
