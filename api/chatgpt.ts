// Función serverless de Vercel: puente para cuentas de ChatGPT (ver server/chatgpt.ts)
// Extensión .js obligatoria: package.json usa "type": "module" y Node no resuelve imports sin extensión.
import { handleChatGPT } from '../server/chatgpt.js';

export const POST = (request: Request) => handleChatGPT(request, process.env as any);
