export type Provider = 'groq' | 'openrouter' | 'openai' | 'cerebras' | 'gemini' | 'xai' | 'custom1' | 'custom2' | 'chatgpt';

export interface Message {
  id: string;
  role: 'user' | 'model' | 'system' | 'tool' | 'assistant';
  content: string | null;
  timestamp: number;
  attachments?: Attachment[];
  toolCalls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
  // Solo para role 'tool': metadatos para la UI
  toolMeta?: {
    serverName: string;
    originalName: string;
    args: any;
    isError: boolean;
    denied?: boolean;
    durationMs?: number;
  };
  usage?: {
    input: number;
    output: number;
    total: number;
  };
  rawDebug?: {
    requestId: string;
    provider: string;
    model: string;
    requestPayload: any;
    responsePayload: any;
  };
}

export interface Attachment {
  name: string;
  type: string;
  data: string; // Data URL (imágenes, PDF) o texto plano
  extractedText?: string;
  size?: number;
}

/**
 * Tool call en formato normalizado (estilo OpenAI).
 * `thought_signature` solo lo usa Gemini 3: hay que devolverlo tal cual en el
 * siguiente turno o la API rechaza la conversación. Se elimina antes de enviar
 * el historial a proveedores OpenAI-compatibles.
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
  thought_signature?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

/**
 * - 'auto': prueba Streamable HTTP (spec 2025-03-26+) y si falla cae a SSE legacy.
 * - 'http-stream': Streamable HTTP (un solo endpoint, POST + respuestas JSON o SSE).
 * - 'sse': transporte HTTP+SSE legacy (spec 2024-11-05: GET /sse + POST al endpoint anunciado).
 */
export type MCPTransport = 'auto' | 'sse' | 'http-stream';
export type MCPAuthType = 'none' | 'api-key' | 'oauth';

export interface MCPTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: any;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

export interface MCPServer {
  id: string;
  name?: string;              // Alias opcional elegido por el usuario
  url: string;
  transport: MCPTransport;
  authType: MCPAuthType;
  authToken: string;
  authHeader?: string;        // Header para api-key (default: Authorization: Bearer)
  status: 'idle' | 'loading' | 'connected' | 'error';
  errorMessage: string;
  tools: MCPTool[];
  enabledTools: string[];
  autoApprove?: boolean;      // Ejecutar herramientas sin pedir confirmación
  useProxy?: boolean;         // Conectar a través de /api/mcp (evita CORS, ej. n8n Cloud)
  // Información obtenida en el handshake `initialize`
  serverInfo?: { name: string; version?: string };
  protocolVersion?: string;
  resolvedTransport?: 'http-stream' | 'sse' | 'legacy-post';
  instructions?: string;
}

export type ThemeOption = 'ocean' | 'mint' | 'lavender' | 'coral' | 'amber' | 'rose' | 'teal' | 'slate';

// Provider configuration interface for cleaner state management
export interface ProviderConfig {
  key: string;
  model: string;
  connected: boolean;
  modelsList: string[];
}

export interface AppSettings {
  // Appearance
  theme: ThemeOption;
  darkMode: boolean;

  // Provider Configurations
  groqKey: string;
  groqModel: string;
  groqConnected: boolean;
  groqModelsList: string[];

  openRouterKey: string;
  openRouterModel: string;
  openRouterConnected: boolean;
  openRouterModelsList: string[];

  openaiKey: string;
  openaiModel: string;
  openaiConnected: boolean;
  openaiModelsList: string[];



  cerebrasKey: string;
  cerebrasModel: string;
  cerebrasConnected: boolean;
  cerebrasModelsList: string[];

  geminiKey: string;
  geminiModel: string;
  geminiConnected: boolean;
  geminiModelsList: string[];

  xaiKey: string;
  xaiModel: string;
  xaiConnected: boolean;
  xaiModelsList: string[];

  // Custom Providers
  custom1Name: string;
  custom1Key: string;
  custom1Url: string;
  custom1Model: string;
  custom1Connected: boolean;
  custom1ModelsList: string[];

  custom2Name: string;
  custom2Key: string;
  custom2Url: string;
  custom2Model: string;
  custom2Connected: boolean;
  custom2ModelsList: string[];

  // Cuenta de ChatGPT (experimental, vía /api/chatgpt). chatgptKey = access token.
  chatgptKey: string;
  chatgptRefreshToken: string;
  chatgptAccountId: string;
  chatgptExpiresAt: number;
  chatgptEmail: string;
  chatgptPlan: string;
  chatgptModel: string;
  chatgptConnected: boolean;
  chatgptModelsList: string[];

  // Token compartido con las funciones /api (NODEMAT_PROXY_TOKEN en Vercel)
  proxyToken: string;

  // System Prompt
  systemPrompt: string;



  // Active Selection
  activeProvider: Provider;

  // MCP Configuration
  mcpRegistryUrl: string;
  mcpServers: MCPServer[];

  // General
  incognitoMode: boolean;
}

// Helper to get provider display name
export const PROVIDER_NAMES: Record<Provider, string> = {
  groq: 'Groq',
  openrouter: 'OpenRouter',
  openai: 'OpenAI',

  cerebras: 'Cerebras',
  gemini: 'Gemini (AI Studio)',
  xai: 'xAI (Grok)',
  custom1: 'Personalizado 1',
  custom2: 'Personalizado 2',
  chatgpt: 'ChatGPT (cuenta)'

};