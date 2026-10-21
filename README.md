# 🤖 Nodemat Chat

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-18-61DAFB.svg)
![Vite](https://img.shields.io/badge/Vite-6-646CFF.svg)

**Nodemat Chat** es una plataforma de código abierto diseñada para **aprender cómo funcionan los Modelos de Lenguaje (LLMs) a través de sus APIs**. Todo se desarrolla y ejecuta en local, sin necesidad de un servidor backend, lo que la convierte en una herramienta ideal para experimentación y educación.

---

## 🎯 ¿Para Quién es Nodemat?

- **Desarrolladores** que quieren entender la estructura de las APIs de LLM (OpenAI, Google AI, etc.)
- **Estudiantes** de IA que buscan una herramienta práctica para experimentar con diferentes modelos
- **Profesionales** que valoran la privacidad y quieren una alternativa a interfaces centralizadas

---

## 🚀 Puntos Fuertes de la Plataforma

### 1. 🔒 Privacidad Total (Zero-Knowledge)
Toda la aplicación corre **100% en tu navegador**. No hay ningún servidor backend que almacene tus conversaciones o claves API. Tus datos son tuyos.

### 2. 📚 Código Altamente Comentado (Educativo)
El código fuente está documentado con **JSDoc extenso**, explicando:
- Cómo se construyen los payloads de request
- Cómo funcionan los diferentes formatos de respuesta (OpenAI vs Gemini)
- Cómo implementar "Tool Calling" (el modelo ejecutando funciones)

### 3. 🔌 Multi-Proveedor
Conecta con múltiples proveedores de IA desde la misma interfaz:
- **Groq** - Inferencia ultrarrápida
- **OpenRouter** - Acceso a cientos de modelos
- **OpenAI** - GPT-4o, o1, etc.
- **Google Gemini** - Los modelos de Google AI
- **xAI (Grok)** - El modelo de xAI
- **Custom** - Cualquier API compatible con OpenAI

Las respuestas llegan **en streaming** (palabra por palabra) con todos los proveedores, incluidas las llamadas a herramientas, y se pueden detener en cualquier momento.

### 4. 🛠️ Cliente MCP (Model Context Protocol)
Nodemat se conecta a **cualquier tipo de servidor MCP** y muestra en el chat cada llamada y su resultado, para estudiar el ciclo agéntico.

**Versiones del protocolo.** Habla las dos eras y detecta sola cuál usa cada servidor:
- **Moderna (2026-07-28, la vigente):** sin handshake ni sesión; `server/discover`, metadatos por petición (`_meta`), headers `Mcp-Method` / `Mcp-Name` / `Mcp-Param-*`, pedidos de varios pasos (`input_required`) y `subscriptions/listen`.
- **Clásica (2024-11-05 a 2025-11-25):** `initialize`, sesión `Mcp-Session-Id`, pedidos del servidor por el stream y GET de avisos.

**Transportes.**
- **Streamable HTTP** (`/mcp`) y **SSE antiguo** (`/sse`), con detección automática.
- **Comando local (stdio):** servidores que se lanzan con `npx …`, `uvx …` o `node …`. El navegador no puede ejecutar procesos, así que lo hace el puente `/api/mcp-stdio`, que sólo existe cuando Nodemat corre en tu máquina (`npm run dev` o `npm start`), sólo acepta peticiones desde la misma máquina y se apaga con `MCP_STDIO_DISABLED=1`.

**Autenticación.**
- **OAuth 2.1 completo** para servidores como GitHub, Notion, Linear, Atlassian o Sentry: descubrimiento (RFC 9728 / 8414), registro dinámico del cliente (RFC 7591), PKCE, `resource` (RFC 8707) y renovación automática del token. Si el proveedor no permite el registro automático, se carga un Client ID propio (la URL de retorno es `https://tu-dominio/oauth/callback`).
- Token Bearer, API key en cualquier header y **headers adicionales** propios.

**Funciones.**
- **Herramientas** con aprobación, "permitir siempre", auto-aprobación por servidor, avisos para herramientas destructivas, validación de argumentos contra el `inputSchema` antes de llamar, **progreso en vivo** y cancelación.
- Las **imágenes** que devuelve una herramienta llegan al modelo (proveedores con visión) además de mostrarse.
- **Recursos y prompts:** el botón 📖 del chat los lista para adjuntar un recurso (o una plantilla de URI) o usar un prompt con sus argumentos.
- **Sampling** (el servidor pide una respuesta de tu modelo) y **elicitación** (formularios o abrir una URL), siempre con tu aprobación.
- Si la lista de herramientas cambia, se actualiza sola.
- "Detalle de la conexión" muestra cada paso del intento de conexión.

#### Usar un MCP de n8n (o cualquier servidor sin CORS)
La app incluye un **proxy same-origin** (`/api/mcp`, función serverless de Vercel; en local lo monta Vite). Como el navegador le habla al mismo dominio de la app, no hay CORS.
1. En n8n, agrega un nodo **MCP Server Trigger**, activa el workflow y copia la *Production URL*.
2. En Nodemat → Ajustes → Servidores MCP: pega la URL, deja **"Conectar vía proxy"** activado y conecta.
3. Si n8n pide autenticación (Bearer o header), cárgala en "Autenticación"; el proxy la reenvía.

**No hace falta configurar nada en Vercel.** El proxy no guarda nada y aplica reglas fijas: sólo servidores `https` públicos (bloquea IPs privadas, `localhost` y nombres que resuelven a la red interna). Opcionalmente, quien despliega puede endurecerlo con `MCP_PROXY_ALLOWED_HOSTS` y `NODEMAT_PROXY_TOKEN` (ver `.env.example`). En local el proxy también acepta servidores de tu red.

#### 🔒 Todo queda en tu navegador
API keys, sesión de ChatGPT, servidores MCP (y sus tokens OAuth), ajustes y conversaciones se guardan sólo en el navegador (localStorage + IndexedDB). En **Gestión de Datos → Configuración** puedes exportar todo a un archivo `.json` (cifrado con contraseña, AES-GCM) e importarlo en otra PC.

> Límites: cada llamada pasa por una función de Vercel con `maxDuration` de 60 s (configurable en `vercel.json` según tu plan). Con proxy, prefiere **Streamable HTTP**: el transporte SSE antiguo mantiene un stream abierto que Vercel corta a los 60 s (Nodemat reconecta, pero una herramienta en curso puede fallar).
>
> Seguridad: el proxy bloquea a *otros sitios web* desde el navegador, pero sin `NODEMAT_PROXY_TOKEN` cualquiera que conozca tu URL de Vercel podría usar `/api/mcp` (hacia servidores https públicos) y `/api/chatgpt` con sus propias credenciales, consumiendo tu cuota de Vercel. Si defines `NODEMAT_PROXY_TOKEN`, carga el mismo valor en Ajustes → Servidores MCP → "Token del proxy".

> Sin proxy, los servidores MCP remotos deben permitir CORS (origen, headers `Mcp-Session-Id`, `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`, y exponer `Mcp-Session-Id`).

### 🧪 Cuenta de ChatGPT (experimental)
Permite usar tu suscripción de ChatGPT en lugar de una API key, con el mismo login OAuth que Codex CLI / OpenClaw (`/api/chatgpt` hace de puente porque `auth.openai.com` y `chatgpt.com` no permiten CORS). Los tokens se guardan sólo en tu navegador y se renuevan solos.
- **No es una API pública documentada**: consume los límites de tu plan y OpenAI puede cambiarla o restringirla.
- El acceso con cuentas **Free** no está garantizado (OpenAI lo ofreció "por tiempo limitado"); con Plus/Pro funciona.
- Login: Ajustes → ChatGPT → "Iniciar sesión", y pegar la URL `localhost:1455/...` a la que redirige OpenAI (la página no carga: es normal). También se puede importar `~/.codex/auth.json`.

### 5. 🎨 Generación de Imágenes
- OpenAI (`gpt-image-1`, DALL·E), OpenRouter (modelos con salida de imagen), Gemini (`*-image` e Imagen) y xAI. Formatos, varias imágenes, imágenes de referencia, insertar en el chat, compartir y descargar.
- **Desde el chat:** en el generador marca "Usar este modelo cuando le pidas una imagen al chat" y cualquier modelo de conversación podrá generar imágenes solo (con tu aprobación), y editarlas en los turnos siguientes.
- **Editar:** el botón ✨ de cualquier imagen del chat o de la galería la abre como referencia. Puedes **pintar la zona a cambiar**: OpenAI recibe una máscara real; Gemini y OpenRouter, la imagen con la zona marcada y la instrucción de tocar sólo eso.
- **Galería** con todas las imágenes de todas las conversaciones (subidas, generadas y devueltas por herramientas), con filtros, edición, adjuntar y descargar.
- Las imágenes se guardan en base64 para que no expiren; los adjuntos grandes se guardan aparte como Blob (una sola copia aunque aparezcan en varios mensajes), así las conversaciones quedan livianas.

### 6. 📎 Archivos y Compartir
- **Imágenes** (se reducen automáticamente), **PDF** (nativo en OpenAI, OpenRouter y Gemini; en el resto se envía su texto, extraído con pdf.js) y **texto o código**.
- **Word, Excel, PowerPoint y OpenDocument** (`.docx`, `.xlsx`, `.xls`, `.pptx`, `.odt`, `.ods`, `.odp`): se guarda el original y el modelo recibe el texto (cada hoja de cálculo como CSV, cada diapositiva con sus notas).
- **Audio** (`.mp3`, `.wav`, `.m4a`, `.ogg`…): se transcribe con Groq (Whisper), OpenAI o Gemini, según la clave que tengas, y se puede escuchar en el chat. El botón 🎤 **dicta** el mensaje.
- **Archivos para las herramientas MCP:** cada adjunto tiene una referencia `nodemat://adjunto/<nombre>`; cuando el modelo la usa como argumento, Nodemat la reemplaza por el contenido (base64, texto o data URL), así una herramienta puede, por ejemplo, subir el archivo a tu Drive.
- Arrastrar y soltar, pegar desde el portapapeles, exportar conversaciones a Markdown/JSON, importar backups y compartir con la hoja nativa del sistema.

---

## ⚙️ Instalación Rápida

```bash
# 1. Clonar el repositorio
git clone https://github.com/diegoparras/Nodemat-Chat.git
cd Nodemat-Chat

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus claves API

# 4. Iniciar servidor de desarrollo
npm run dev
```

Abre `http://localhost:3000` en tu navegador.

---

## 🔧 Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto con las siguientes variables:

### Autenticación de la App

| Variable | Descripción | Default |
| :--- | :--- | :--- |
| `VITE_ADMIN_USER` | Usuario para login | `admin` |
| `VITE_ADMIN_PASSWORD` | Contraseña para login | `admin` |

### API Keys de Proveedores

| Variable | Proveedor | Prefijo de Key | Dónde obtenerla |
| :--- | :--- | :--- | :--- |
| `VITE_GROQ_API_KEY` | Groq Cloud | `gsk_...` | [console.groq.com/keys](https://console.groq.com/keys) |
| `VITE_OPENROUTER_API_KEY` | OpenRouter | `sk-or-...` | [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) |
| `VITE_OPENAI_API_KEY` | OpenAI | `sk-...` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `VITE_CEREBRAS_API_KEY` | Cerebras | `csk-...` | [cloud.cerebras.ai](https://cloud.cerebras.ai) |
| `VITE_GEMINI_API_KEY` | Gemini (AI Studio) | `AIza...` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `VITE_XAI_API_KEY` | xAI (Grok) | `xai-...` | [console.x.ai](https://console.x.ai) |

### Proveedores Personalizados

Para preconfigurar proveedores compatibles con OpenAI (ej: Mistral, Together AI, etc.):

| Variable | Descripción |
| :--- | :--- |
| `VITE_CUSTOM1_NAME` | Nombre visible del proveedor 1 |
| `VITE_CUSTOM1_API_KEY` | API Key del proveedor 1 |
| `VITE_CUSTOM1_API_URL` | URL base (ej: `https://api.mistral.ai/v1`) |
| `VITE_CUSTOM1_MODEL` | Modelo por defecto |
| `VITE_CUSTOM2_NAME` | Nombre visible del proveedor 2 |
| `VITE_CUSTOM2_API_KEY` | API Key del proveedor 2 |
| `VITE_CUSTOM2_API_URL` | URL base de la API |
| `VITE_CUSTOM2_MODEL` | Modelo por defecto |

### Configuración Avanzada

| Variable | Descripción |
| :--- | :--- |
| `VITE_MCP_REGISTRY_URL` | URL del registro de servidores MCP (opcional) |

---

## 📂 Estructura del Proyecto

```
nodemat-chat/
├── App.tsx              # Componente principal de la app
├── components/          # Componentes UI reutilizables
│   ├── ChatImage.tsx    # Imágenes en chat (ampliar, compartir, descargar)
│   ├── ImageGenModal.tsx # Generador de imágenes
│   ├── ToolMessage.tsx  # Llamadas/resultados de herramientas MCP en el chat
│   ├── FileUploadModal.tsx # Modal para adjuntar archivos
│   └── SearchableSelect.tsx # Selector de modelos
├── services/
│   ├── llmService.ts    # ⭐ Orquestador de llamadas a LLM (MUY DOCUMENTADO)
│   ├── mcpClient.ts     # ⭐ Cliente MCP (handshake, transportes, sesiones)
│   ├── imageGenService.ts # Generación de imágenes multi-proveedor
│   ├── fileService.ts   # Adjuntos, compartir, exportar/importar
│   └── storageService.ts # Persistencia en IndexedDB
└── types.ts             # Definiciones de TypeScript
```

> **💡 Tip:** Comienza leyendo `services/llmService.ts`. Es el corazón de la aplicación y está extensamente documentado con explicaciones de cómo funcionan las APIs de LLM.

---

## ⚠️ Posibles Problemas y Limitaciones

### 🔐 Seguridad de API Keys
- Las variables `VITE_*` se **embeben en el bundle público**: no definas keys ni la contraseña de admin en un deploy accesible por terceros (el login es sólo una validación en el navegador)
- Las claves se guardan en el `localStorage` del navegador
- **Riesgo:** Si alguien tiene acceso a tu computadora, puede extraer las claves
- **Mitigación:** Usa navegación privada para sesiones temporales

### 🌐 Restricciones CORS
- Algunas APIs (ej: Anthropic) no permiten llamadas directas desde navegadores
- Esto es una limitación del navegador, no de Nodemat
- **Alternativa:** Usar OpenRouter como intermediario

### 📦 Límites de Almacenamiento
- IndexedDB tiene límites que varían por navegador (~50MB - varios GB)
- Conversaciones muy largas con muchas imágenes pueden alcanzar estos límites
- **Mitigación:** Exportar y borrar chats periódicamente

### 🔧 Proveedores Personalizados
- Deben ser 100% compatibles con la API de OpenAI
- No todos los proveedores implementan `/v1/models` correctamente

---

## 🛠️ Stack Tecnológico

| Categoría | Tecnología |
| :--- | :--- |
| Framework | React 18 + TypeScript |
| Build | Vite 6 |
| Estilos | Tailwind CSS |
| Iconos | Lucide React |
| Persistencia | IndexedDB (idb-keyval) |
| Markdown | react-markdown + remark-gfm |

---

## 📜 Licencia

MIT License - Libre para uso educativo y comercial.

---

**Nodemat Chat** - Aprende cómo funcionan los LLMs construyendo con ellos. 🧠💻
