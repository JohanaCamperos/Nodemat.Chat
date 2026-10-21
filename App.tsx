import React, { useState, useEffect, useRef } from 'react';
import { Send, Menu, Settings, X, Plus, MessageSquare, Image, MoreVertical, Trash2, StopCircle, RefreshCw, Copy, Check, Edit2, Play, Square, Paperclip, ChevronDown, CheckCircle2, AlertTriangle, AlertCircle, Info, Download, Upload, ExternalLink, Power, Cpu, Globe, Lock, Key, Server, Settings2, Search, Terminal, Wrench, Ban, Sun, Moon, Shield, ShieldOff, Plug, Layout, LogOut, Palette, VenetianMask, EyeOff, FileCode, GraduationCap } from 'lucide-react';
import { Share2, FileText, FileJson, Sparkles } from 'lucide-react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Tooltip } from './components/Tooltip';
import { storageService } from './services/storageService';
import { sendMessage, fetchModels, ToolApprovalRequest } from './services/llmService';
import { connectServer, disconnectServer, getFriendlyMCPError } from './services/mcpClient';
import { setBridgeToken } from './services/bridge';
import { ChatGPTAccountCard } from './components/ChatGPTAccountCard';
import { ConfigBackupSection } from './components/ConfigBackupSection';
import {
    fileToAttachment, downloadImage, downloadAttachment, formatBytes, ACCEPT_ATTRIBUTE,
    exportSessionJSON, exportSessionMarkdown, shareSession, shareText, copyText, shareOutcomeLabel,
    importSessionsFromFile, sessionToMarkdown
} from './services/fileService';
import { GeneratedImage } from './services/imageGenService';
import { ImageGenModal } from './components/ImageGenModal';
import { FileUploadModal } from './components/FileUploadModal';
import { ChatImage } from './components/ChatImage';
import { ToolCallsBlock, ToolResultCard } from './components/ToolMessage';
import { SearchableSelect } from './components/SearchableSelect';
import { SecretInput } from './components/SecretInput';
import { AppSettings, ChatSession, Message, Provider, Attachment, MCPTransport, MCPServer, ThemeOption, MCPAuthType, PROVIDER_NAMES } from './types';

/** react-markdown elimina las URLs `data:` por seguridad; permitimos sólo imágenes. */
const markdownUrlTransform = (url: string) =>
    /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(url) ? url : defaultUrlTransform(url);

// Safe Env Access (supports both REACT_APP_ and VITE_ prefixes)
const getEnv = (key: string, defaultVal: string = '') => {
    // Try original key
    // @ts-ignore
    if (typeof process !== 'undefined' && process.env && process.env[key]) return process.env[key];
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) return import.meta.env[key];

    // Try VITE_ prefix if key starts with REACT_APP_
    if (key.startsWith('REACT_APP_')) {
        const viteKey = key.replace('REACT_APP_', 'VITE_');
        // @ts-ignore
        if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[viteKey]) return import.meta.env[viteKey];
    }

    return defaultVal;
};

// --- Themes Configuration ---
const THEMES: Record<ThemeOption, { primary: string, primaryHover: string, primaryLight: string, name: string }> = {
    ocean: { primary: '#818cf8', primaryHover: '#6366f1', primaryLight: '#e0e7ff', name: 'Océano' },
    mint: { primary: '#34d399', primaryHover: '#10b981', primaryLight: '#d1fae5', name: 'Menta' },
    lavender: { primary: '#a78bfa', primaryHover: '#8b5cf6', primaryLight: '#ede9fe', name: 'Lavanda' },
    coral: { primary: '#fb7185', primaryHover: '#f43f5e', primaryLight: '#ffe4e6', name: 'Coral' },
    amber: { primary: '#fbbf24', primaryHover: '#f59e0b', primaryLight: '#fef3c7', name: 'Ámbar' },
    rose: { primary: '#f472b6', primaryHover: '#ec4899', primaryLight: '#fce7f3', name: 'Rosa' },
    teal: { primary: '#2dd4bf', primaryHover: '#14b8a6', primaryLight: '#ccfbf1', name: 'Turquesa' },
    slate: { primary: '#64748b', primaryHover: '#475569', primaryLight: '#f1f5f9', name: 'Pizarra' },
};

// --- Constants & Defaults ---
const DEFAULT_MCP_REGISTRY = getEnv('REACT_APP_MCP_REGISTRY_URL', 'https://mcpplaygroundonline.com/mcp-registry');

const DEFAULT_SETTINGS: AppSettings = {
    theme: 'ocean',
    darkMode: false,

    groqKey: getEnv('REACT_APP_GROQ_API_KEY', ''),
    groqModel: 'llama-3.3-70b-versatile',
    groqConnected: !!getEnv('REACT_APP_GROQ_API_KEY', ''),
    groqModelsList: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b'],

    openRouterKey: getEnv('REACT_APP_OPENROUTER_API_KEY', ''),
    openRouterModel: 'openai/gpt-4o-mini',
    openRouterConnected: !!getEnv('REACT_APP_OPENROUTER_API_KEY', ''),
    openRouterModelsList: ['openai/gpt-4o-mini', 'openai/gpt-4o', 'google/gemini-2.5-flash'],

    openaiKey: getEnv('REACT_APP_OPENAI_API_KEY', ''),
    openaiModel: 'gpt-4o-mini',
    openaiConnected: !!getEnv('REACT_APP_OPENAI_API_KEY', ''),
    openaiModelsList: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o', 'gpt-4o-mini'],

    cerebrasKey: getEnv('REACT_APP_CEREBRAS_API_KEY', ''),
    cerebrasModel: 'llama3.1-8b',
    cerebrasConnected: !!getEnv('REACT_APP_CEREBRAS_API_KEY', ''),
    cerebrasModelsList: ['llama3.1-8b', 'llama-3.3-70b'],

    geminiKey: getEnv('REACT_APP_GEMINI_API_KEY', ''),
    geminiModel: 'gemini-2.5-flash',
    geminiConnected: !!getEnv('REACT_APP_GEMINI_API_KEY', ''),
    geminiModelsList: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],

    xaiKey: getEnv('REACT_APP_XAI_API_KEY', ''),
    xaiModel: 'grok-3-mini',
    xaiConnected: !!getEnv('REACT_APP_XAI_API_KEY', ''),
    xaiModelsList: ['grok-3-mini', 'grok-3', 'grok-4'],

    // Custom 1 - Configurable via env vars or UI
    custom1Name: getEnv('REACT_APP_CUSTOM1_NAME', 'Personalizado 1'),
    custom1Key: getEnv('REACT_APP_CUSTOM1_API_KEY', ''),
    custom1Url: getEnv('REACT_APP_CUSTOM1_API_URL', 'https://api.openai.com/v1'),
    custom1Model: getEnv('REACT_APP_CUSTOM1_MODEL', ''),
    custom1Connected: !!getEnv('REACT_APP_CUSTOM1_API_KEY', ''),
    custom1ModelsList: [],

    // Custom 2 - Configurable via env vars or UI
    custom2Name: getEnv('REACT_APP_CUSTOM2_NAME', 'Personalizado 2'),
    custom2Key: getEnv('REACT_APP_CUSTOM2_API_KEY', ''),
    custom2Url: getEnv('REACT_APP_CUSTOM2_API_URL', 'https://api.openai.com/v1'),
    custom2Model: getEnv('REACT_APP_CUSTOM2_MODEL', ''),
    custom2Connected: !!getEnv('REACT_APP_CUSTOM2_API_KEY', ''),
    custom2ModelsList: [],

    // Cuenta de ChatGPT (experimental)
    chatgptKey: '',
    chatgptRefreshToken: '',
    chatgptAccountId: '',
    chatgptExpiresAt: 0,
    chatgptEmail: '',
    chatgptPlan: '',
    chatgptModel: 'gpt-5',
    chatgptConnected: false,
    chatgptModelsList: ['gpt-5', 'gpt-5-codex'],

    proxyToken: '',

    // System Prompt
    systemPrompt: '',

    activeProvider: 'groq',

    mcpRegistryUrl: DEFAULT_MCP_REGISTRY,
    mcpServers: [],

    incognitoMode: false
};

const INITIAL_SESSION: ChatSession = {
    id: 'init',
    title: 'Nuevo Chat',
    messages: [],
    createdAt: Date.now(),
};

// --- UI HELPERS ---

// downloadImage vive ahora en services/fileService.ts (detecta la extensión real y tiene fallback CORS)

// --- UI COMPONENTS ---


/**
 * Pantalla de acceso OPCIONAL: sólo aparece si se definió VITE_ADMIN_PASSWORD.
 * Ojo: se valida en el navegador y el valor queda en el bundle, así que sólo
 * evita que alguien use la app por accidente; no protege nada de verdad.
 */
const LOGIN_USER = getEnv('REACT_APP_ADMIN_USER', '');
const LOGIN_PASSWORD = getEnv('REACT_APP_ADMIN_PASSWORD', '');
const LOGIN_REQUIRED = !!LOGIN_PASSWORD;

const LoginScreen = ({ onLogin }: { onLogin: () => void }) => {
    const [user, setUser] = useState('');
    const [pass, setPass] = useState('');
    const [error, setError] = useState('');

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if ((!LOGIN_USER || user === LOGIN_USER) && pass === LOGIN_PASSWORD) {
            onLogin();
        } else {
            setError('Credenciales incorrectas');
        }
    };

    const inputClass = "w-full p-3 bg-background border border-border text-text-main rounded-lg outline-none focus:ring-2 focus:ring-primary transition-all";

    return (
        <div className="h-screen w-full flex items-center justify-center bg-background">
            <div className="bg-surface p-8 rounded-2xl shadow-xl w-full max-w-sm border border-border">
                <div className="flex flex-col items-center mb-6">
                    <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-white mb-3 shadow-lg">
                        <Terminal size={24} />
                    </div>
                    <h1 className="text-2xl font-bold text-text-main">Nodemat Chat</h1>
                    <p className="text-sm text-text-muted">Acceso privado</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                    {LOGIN_USER && (
                        <div>
                            <label htmlFor="login-user" className="block text-xs font-semibold text-text-muted mb-1">USUARIO</label>
                            <input id="login-user" type="text" autoComplete="username" value={user} onChange={e => setUser(e.target.value)} className={inputClass} />
                        </div>
                    )}
                    <div>
                        <label htmlFor="login-pass" className="block text-xs font-semibold text-text-muted mb-1">CONTRASEÑA</label>
                        <SecretInput id="login-pass" autoComplete="current-password" value={pass} onChange={e => setPass(e.target.value)} className={inputClass} />
                    </div>

                    {error && <p className="text-red-500 text-sm text-center bg-red-500/10 p-2 rounded">{error}</p>}

                    <button type="submit" className="w-full bg-primary hover:bg-primary-hover text-white font-bold py-3 rounded-xl transition-all shadow-md active:scale-95">
                        Ingresar
                    </button>
                </form>

                <a
                    href="https://github.com/diegoparras/Nodemat-Chat"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-6 flex items-center justify-center gap-2 text-text-muted hover:text-text-main transition-colors text-sm"
                >
                    <Search size={18} />
                    Explorá el proyecto completo en GitHub
                </a>
            </div>
        </div>
    );
};

// --- MODALS ---

type ToolDecision = 'deny' | 'allow' | 'always';

const ToolApprovalModal = ({ pendingTool, onConfirm }: { pendingTool: (ToolApprovalRequest & { resolve: (v: boolean) => void }) | null, onConfirm: (decision: ToolDecision) => void }) => {
    if (!pendingTool) return null;
    const destructive = pendingTool.annotations?.destructiveHint === true && pendingTool.annotations?.readOnlyHint !== true;
    const readOnly = pendingTool.annotations?.readOnlyHint === true;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-surface rounded-2xl w-full max-w-lg shadow-2xl p-0 border border-border overflow-hidden animate-in zoom-in-95">
                <div className="bg-amber-50 dark:bg-amber-900/20 p-5 border-b border-amber-100 dark:border-amber-800/30 flex items-start gap-4">
                    <div className="bg-amber-100 dark:bg-amber-800/40 p-2 rounded-lg text-amber-600 dark:text-amber-400">
                        <Wrench size={24} />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-lg font-bold text-text-main">Solicitud de Herramienta</h3>
                        <p className="text-sm text-text-muted truncate">
                            La IA quiere ejecutar una acción en <strong className="text-text-main">{pendingTool.serverName}</strong>
                        </p>
                    </div>
                </div>

                <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                    <div>
                        <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Herramienta</span>
                        <div className="font-mono text-lg font-semibold text-primary mt-1 break-all">{pendingTool.originalName}</div>
                        {pendingTool.description && <p className="text-xs text-text-muted mt-1 line-clamp-4">{pendingTool.description}</p>}
                        <div className="flex gap-2 mt-2">
                            {readOnly && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">SOLO LECTURA</span>}
                            {destructive && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">⚠️ PUEDE MODIFICAR / BORRAR DATOS</span>}
                        </div>
                    </div>

                    <div>
                        <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Argumentos (Datos)</span>
                        <div className="mt-2 bg-background p-4 rounded-lg border border-border overflow-x-auto">
                            <pre className="text-xs font-mono text-text-main whitespace-pre-wrap break-all">
                                {JSON.stringify(pendingTool.args, null, 2)}
                            </pre>
                        </div>
                    </div>
                </div>

                <div className="p-5 bg-surface-highlight border-t border-border flex flex-wrap gap-3 justify-end">
                    <button
                        onClick={() => onConfirm('deny')}
                        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-border text-text-muted hover:text-red-500 hover:border-red-200 rounded-xl font-medium transition-colors"
                    >
                        <Ban size={18} /> Rechazar
                    </button>
                    {!destructive && (
                        <button
                            onClick={() => onConfirm('always')}
                            className="flex items-center gap-2 px-4 py-2 border border-primary text-primary hover:bg-primary/10 rounded-xl font-medium transition-colors"
                            title="No volver a preguntar por esta herramienta hasta recargar la página"
                        >
                            <CheckCircle2 size={18} /> Permitir siempre
                        </button>
                    )}
                    <button
                        autoFocus
                        onClick={() => onConfirm('allow')}
                        className="flex items-center gap-2 px-5 py-2 bg-primary text-white hover:bg-primary-hover shadow-md hover:shadow-lg rounded-xl font-bold transition-all transform active:scale-95"
                    >
                        <Play size={18} /> Aprobar
                    </button>
                </div>
            </div>
        </div>
    );
};

const ManageModal: React.FC<any> = ({ isOpen, onClose, onExport, onImport, onDeleteAll, storageUsage, settings, sessions, onImportConfig }) => {
    const [filename, setFilename] = useState(`nexus_backup_${new Date().toISOString().slice(0, 10)}`);

    if (!isOpen) return null;

    const limit = 5 * 1024 * 1024; // 5MB approx limit
    const percentage = Math.min(100, (storageUsage.used / limit) * 100);

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface rounded-2xl w-full max-w-md shadow-2xl p-6 border border-border text-text-main max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <Settings size={20} className="text-text-muted" /> Gestión de Datos
                    </h3>
                    <button onClick={onClose} className="text-text-muted hover:text-text-main"><X size={20} /></button>
                </div>

                <div className="mb-6 p-4 bg-surface-highlight/50 rounded-xl border border-border">
                    <div className="flex justify-between text-sm font-medium mb-2">
                        <span>Almacenamiento (IndexedDB)</span>
                        <span className="text-primary">{storageUsage.formatted}</span>
                    </div>
                    {/* Progress bar removed as IDB is huge */}
                    <p className="text-xs text-text-muted mt-2">
                        Almacenamiento masivo habilitado. El límite depende de tu disco duro.
                    </p>
                </div>

                <ConfigBackupSection settings={settings} sessions={sessions} onImported={onImportConfig} />


                <div className="mb-6">
                    <p className="text-sm text-text-muted mb-3">
                        Opciones de exportación y limpieza:
                    </p>

                    <div className="mb-3">
                        <label className="block text-xs font-semibold text-text-muted mb-1 uppercase">Nombre del Archivo</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={filename}
                                onChange={(e) => setFilename(e.target.value)}
                                className="flex-1 p-2 bg-background border border-border rounded-lg text-sm outline-none focus:border-primary text-text-main"
                                placeholder="Nombre del backup..."
                            />
                            <span className="text-sm text-text-muted font-mono">.json</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-3">
                    <button
                        onClick={() => onExport(filename)}
                        className="w-full flex items-center justify-center gap-3 p-3 bg-primary-light text-primary rounded-xl hover:opacity-90 transition-colors font-medium"
                    >
                        <Download size={20} /> Exportar Todos los Chats
                    </button>

                    <label className="w-full flex items-center justify-center gap-3 p-3 border border-border text-text-main rounded-xl hover:bg-surface-highlight transition-colors font-medium cursor-pointer">
                        <Upload size={20} /> Importar Chats (JSON)
                        <input
                            type="file"
                            accept="application/json,.json"
                            className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ''; }}
                        />
                    </label>

                    <button
                        onClick={onDeleteAll}
                        className="w-full flex items-center justify-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors font-medium border border-red-100 dark:border-red-900/30"
                    >
                        <AlertTriangle size={20} /> Borrar Todo y Resetear
                    </button>
                </div>
            </div>
        </div>
    );
};


const Sidebar: React.FC<any> = ({
    isOpen, onClose, sessions, currentSessionId, setCurrentSessionId, handleNewChat, handleDeleteChat,
    settings, setSettings, setIsSettingsOpen, setIsManageModalOpen, setIsImageModalOpen, onLogout
}) => (
    <>
        {isOpen && (
            <div
                className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity"
                onClick={onClose}
            />
        )}
        <div className={`fixed top-0 left-0 h-full w-72 bg-surface border-r border-border z-50 transform transition-transform duration-300 ease-in-out shadow-2xl flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="p-5 border-b border-border">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2 font-bold text-xl">
                        <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white shadow-md">
                            <Terminal size={18} />
                        </div>
                        <div>
                            <span className="text-orange-600">Nodemat</span> <span className="text-text-main">Chat</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-text-muted hover:text-text-main p-1 rounded-md hover:bg-surface-highlight">
                        <X size={20} />
                    </button>
                </div>
                <button
                    onClick={() => { handleNewChat(); onClose(); }}
                    className="w-full flex items-center justify-center gap-2 bg-text-main hover:opacity-90 text-text-inverted p-3 rounded-xl transition-all shadow-sm font-medium text-sm"
                >
                    <Plus size={18} />
                    Nuevo Chat
                </button>
                <button
                    onClick={() => { setIsImageModalOpen(true); onClose(); }}
                    className="w-full mt-2 flex items-center justify-center gap-2 border border-border text-text-main hover:bg-surface-highlight p-3 rounded-xl transition-all font-medium text-sm"
                >
                    <Sparkles size={18} className="text-purple-500" />
                    Generar Imágenes
                </button>

            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1">
                {sessions.map((session: any) => (
                    <div
                        key={session.id}
                        onClick={() => { setCurrentSessionId(session.id); onClose(); }}
                        className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${currentSessionId === session.id
                            ? 'bg-primary-light text-primary font-medium shadow-sm'
                            : 'text-text-muted hover:bg-surface-highlight hover:text-text-main'
                            }`}
                    >
                        <div className="flex items-center gap-3 overflow-hidden">
                            <MessageSquare size={16} className={currentSessionId === session.id ? 'text-primary' : 'text-text-muted'} />
                            <span className="truncate text-sm">{session.title}</span>
                        </div>
                        <button
                            onClick={(e) => handleDeleteChat(session.id, e)}
                            className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-100 hover:text-red-500 rounded-lg transition-all"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                ))}
            </div>

            <div className="p-4 border-t border-border space-y-2 bg-surface">
                <div className="flex items-center justify-between px-2 py-2">
                    <button
                        onClick={() => setSettings((s: any) => ({ ...s, darkMode: !s.darkMode }))}
                        className="p-2 rounded-lg hover:bg-surface-highlight text-text-muted hover:text-text-main transition-colors"
                    >
                        {settings.darkMode ? <Sun size={20} /> : <Moon size={20} />}
                    </button>
                    <div className="flex gap-1">
                        {Object.entries(THEMES).map(([key, val]) => (
                            <button
                                key={key}
                                onClick={() => setSettings((s: any) => ({ ...s, theme: key as ThemeOption }))}
                                className={`w-5 h-5 rounded-full border border-border shadow-sm transition-transform hover:scale-110 ${settings.theme === key ? 'ring-2 ring-offset-2 ring-text-main scale-110' : ''}`}
                                style={{ backgroundColor: val.primary }}
                                title={val.name}
                            />
                        ))}
                    </div>
                </div>

                <Tooltip
                    active={settings.educationalMode}
                    title="Modo Incógnito"
                    explanation="Si activas esto, nada se guardará en tu navegador cuando recargues la página."
                >
                    <button
                        onClick={() => setSettings((prev: any) => ({ ...prev, incognitoMode: !prev.incognitoMode }))}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl text-sm font-medium transition-colors ${settings.incognitoMode
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
                            : 'text-text-muted hover:bg-surface-highlight'
                            }`}
                    >
                        {settings.incognitoMode ? <ShieldOff size={18} /> : <Shield size={18} />}
                        {settings.incognitoMode ? 'No se guarda nada' : 'Sesión Local'}
                    </button>
                </Tooltip>

                <button
                    onClick={() => { setIsManageModalOpen(true); onClose(); }}
                    className="w-full flex items-center gap-3 p-3 text-text-muted hover:bg-surface-highlight hover:text-text-main rounded-xl text-sm font-medium transition-colors"
                >
                    <Trash2 size={18} />
                    Gestión de Datos
                </button>

                <button
                    onClick={() => { setIsSettingsOpen(true); onClose(); }}
                    className="w-full flex items-center gap-3 p-3 text-text-muted hover:bg-surface-highlight hover:text-text-main rounded-xl text-sm font-medium transition-colors"
                >
                    <Settings size={18} />
                    Ajustes y Conexiones
                </button>

                <button
                    onClick={async () => {
                        if (confirm('⚠️ ATENCIÓN: Esto eliminará TODOS los datos guardados (chats, configuración, claves API). ¿Continuar?')) {
                            // Clear IndexedDB (chats)
                            await storageService.clearAll();
                            // Clear localStorage (settings)
                            localStorage.clear();
                            sessionStorage.clear();
                            window.location.reload();
                        }
                    }}
                    className="w-full flex items-center gap-3 p-3 text-orange-600 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-900/20 rounded-xl text-sm font-medium transition-colors"
                >
                    <AlertTriangle size={18} />
                    Borrar Todo (Reset)
                </button>

                {LOGIN_REQUIRED && (
                    <button
                        onClick={onLogout}
                        className="w-full flex items-center gap-3 p-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl text-sm font-medium transition-colors"
                    >
                        <LogOut size={18} />
                        Cerrar Sesión
                    </button>
                )}
            </div>
        </div>
    </>
);

const SettingsModal: React.FC<any> = ({
    isOpen, onClose, settings, setSettings, connectProvider, disconnectProvider,
    isConnectingGroq, isConnectingOpenRouter, addMCPServer, removeMCPServer,
    connectMCPServer, disconnectMCPServer, toggleMCPTool, openModelsManager
}) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 text-text-main">
            <div className="bg-surface rounded-2xl w-full max-w-5xl h-[90vh] shadow-2xl flex flex-col overflow-hidden border border-border">

                <div className="flex items-center justify-between p-6 border-b border-border bg-surface flex-shrink-0">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Settings className="text-primary" /> Configuración
                    </h2>
                    <button onClick={onClose} className="text-text-muted hover:text-text-main">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 space-y-8 overflow-y-auto flex-1 bg-background">



                    {/* AI PROVIDERS */}
                    <div className="space-y-6">
                        <h3 className="text-lg font-semibold text-text-main">Proveedores de IA</h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* CHATGPT ACCOUNT CARD (experimental) */}
                            <ChatGPTAccountCard settings={settings} setSettings={setSettings} />

                            {/* GROQ CARD */}
                            <div className={`border rounded-xl p-5 transition-all bg-surface ${settings.groqConnected ? 'border-green-200 bg-green-50/20' : 'border-border'}`}>
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2 font-bold text-text-main">
                                        <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-primary transition-colors">Groq Cloud</a>
                                        {settings.groqConnected && <CheckCircle2 size={16} className="text-green-600" />}
                                    </div>
                                    <div className="flex gap-2">
                                        {!settings.groqConnected ? (
                                            <button
                                                onClick={() => connectProvider('groq')}
                                                disabled={!settings.groqKey || isConnectingGroq}
                                                className="flex items-center gap-2 px-3 py-1.5 bg-text-main text-text-inverted rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90"
                                            >
                                                {isConnectingGroq ? <RefreshCw className="animate-spin" size={14} /> : <Power size={14} />}
                                                Conectar
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => disconnectProvider('groq')}
                                                className="text-red-500 text-xs font-medium hover:underline"
                                            >
                                                Desconectar
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <SecretInput
                                    placeholder="gsk_..."
                                    value={settings.groqKey}
                                    disabled={settings.groqConnected}
                                    onChange={(e: any) => setSettings((s: AppSettings) => ({ ...s, groqKey: e.target.value }))}
                                    className="w-full p-3 border border-border bg-background rounded-lg text-sm mb-3 focus:ring-2 focus:ring-primary outline-none disabled:opacity-60 text-text-main"
                                />
                                {settings.groqConnected && (
                                    <div>
                                        <label className="block text-xs font-semibold text-text-muted mb-1 uppercase">Modelo Disponible</label>
                                        <SearchableSelect
                                            options={settings.groqModelsList}
                                            value={settings.groqModel}
                                            onChange={(val: string) => setSettings((s: AppSettings) => ({ ...s, groqModel: val }))}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* OPENROUTER CARD */}
                            <div className={`border rounded-xl p-5 transition-all bg-surface ${settings.openRouterConnected ? 'border-green-200 bg-green-50/20' : 'border-border'}`}>
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2 font-bold text-text-main">
                                        <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-primary transition-colors">OpenRouter</a>
                                        {settings.openRouterConnected && <CheckCircle2 size={16} className="text-green-600" />}
                                    </div>
                                    <div className="flex gap-2">
                                        {!settings.openRouterConnected ? (
                                            <button
                                                onClick={() => connectProvider('openrouter')}
                                                disabled={!settings.openRouterKey || isConnectingOpenRouter}
                                                className="flex items-center gap-2 px-3 py-1.5 bg-text-main text-text-inverted rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90"
                                            >
                                                {isConnectingOpenRouter ? <RefreshCw className="animate-spin" size={14} /> : <Power size={14} />}
                                                Conectar
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => disconnectProvider('openrouter')}
                                                className="text-red-500 text-xs font-medium hover:underline"
                                            >
                                                Desconectar
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <SecretInput
                                    placeholder="sk-or-..."
                                    value={settings.openRouterKey}
                                    disabled={settings.openRouterConnected}
                                    onChange={(e: any) => setSettings((s: AppSettings) => ({ ...s, openRouterKey: e.target.value }))}
                                    className="w-full p-3 border border-border bg-background rounded-lg text-sm mb-3 focus:ring-2 focus:ring-primary outline-none disabled:opacity-60 text-text-main"
                                />
                                {settings.openRouterConnected && (
                                    <div>
                                        <label className="block text-xs font-semibold text-text-muted mb-1 uppercase">Modelo Disponible</label>
                                        <SearchableSelect
                                            options={settings.openRouterModelsList}
                                            value={settings.openRouterModel}
                                            onChange={(val: string) => setSettings((s: AppSettings) => ({ ...s, openRouterModel: val }))}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* OPENAI CARD */}
                            <div className={`border rounded-xl p-5 transition-all bg-surface ${settings.openaiConnected ? 'border-green-200 bg-green-50/20' : 'border-border'}`}>
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2 font-bold text-text-main">
                                        <a href="https://openai.com/es-ES/api/" target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-primary transition-colors">OpenAI</a>
                                        {settings.openaiConnected && <CheckCircle2 size={16} className="text-green-600" />}
                                    </div>
                                    <div className="flex gap-2">
                                        {!settings.openaiConnected ? (
                                            <button
                                                onClick={() => connectProvider('openai')}
                                                disabled={!settings.openaiKey}
                                                className="flex items-center gap-2 px-3 py-1.5 bg-text-main text-text-inverted rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90"
                                            >
                                                <Power size={14} /> Conectar
                                            </button>
                                        ) : (
                                            <button onClick={() => disconnectProvider('openai')} className="text-red-500 text-xs font-medium hover:underline">Desconectar</button>
                                        )}
                                    </div>
                                </div>
                                <SecretInput placeholder="sk-..." value={settings.openaiKey} disabled={settings.openaiConnected}
                                    onChange={(e: any) => setSettings((s: AppSettings) => ({ ...s, openaiKey: e.target.value }))}
                                    className="w-full p-3 border border-border bg-background rounded-lg text-sm mb-3 focus:ring-2 focus:ring-primary outline-none disabled:opacity-60 text-text-main" />
                                {settings.openaiConnected && (
                                    <div>
                                        <label className="block text-xs font-semibold text-text-muted mb-1 uppercase">Modelo</label>
                                        <SearchableSelect options={settings.openaiModelsList} value={settings.openaiModel} onChange={(val: string) => setSettings((s: AppSettings) => ({ ...s, openaiModel: val }))} />
                                    </div>
                                )}
                            </div>



                            {/* CEREBRAS CARD */}
                            <div className={`border rounded-xl p-5 transition-all bg-surface ${settings.cerebrasConnected ? 'border-green-200 bg-green-50/20' : 'border-border'}`}>
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2 font-bold text-text-main">
                                        <a href="https://cloud.cerebras.ai/platform/" target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-primary transition-colors">Cerebras</a>
                                        {settings.cerebrasConnected && <CheckCircle2 size={16} className="text-green-600" />}
                                    </div>
                                    <div className="flex gap-2">
                                        {!settings.cerebrasConnected ? (
                                            <button
                                                onClick={() => connectProvider('cerebras')}
                                                disabled={!settings.cerebrasKey}
                                                className="flex items-center gap-2 px-3 py-1.5 bg-text-main text-text-inverted rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90"
                                            >
                                                <Power size={14} /> Conectar
                                            </button>
                                        ) : (
                                            <button onClick={() => disconnectProvider('cerebras')} className="text-red-500 text-xs font-medium hover:underline">Desconectar</button>
                                        )}
                                    </div>
                                </div>
                                <SecretInput placeholder="csk-..." value={settings.cerebrasKey} disabled={settings.cerebrasConnected}
                                    onChange={(e: any) => setSettings((s: AppSettings) => ({ ...s, cerebrasKey: e.target.value }))}
                                    className="w-full p-3 border border-border bg-background rounded-lg text-sm mb-3 focus:ring-2 focus:ring-primary outline-none disabled:opacity-60 text-text-main" />
                                {settings.cerebrasConnected && (
                                    <div>
                                        <label className="block text-xs font-semibold text-text-muted mb-1 uppercase">Modelo</label>
                                        <SearchableSelect options={settings.cerebrasModelsList} value={settings.cerebrasModel} onChange={(val: string) => setSettings((s: AppSettings) => ({ ...s, cerebrasModel: val }))} />
                                    </div>
                                )}
                            </div>

                            {/* GEMINI CARD */}
                            <div className={`border rounded-xl p-5 transition-all bg-surface ${settings.geminiConnected ? 'border-green-200 bg-green-50/20' : 'border-border'}`}>
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2 font-bold text-text-main">
                                        <a href="https://aistudio.google.com/api-keys" target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-primary transition-colors">Gemini (AI Studio)</a>
                                        {settings.geminiConnected && <CheckCircle2 size={16} className="text-green-600" />}
                                    </div>
                                    <div className="flex gap-2">
                                        {!settings.geminiConnected ? (
                                            <button
                                                onClick={() => connectProvider('gemini')}
                                                disabled={!settings.geminiKey}
                                                className="flex items-center gap-2 px-3 py-1.5 bg-text-main text-text-inverted rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90"
                                            >
                                                <Power size={14} /> Conectar
                                            </button>
                                        ) : (
                                            <button onClick={() => disconnectProvider('gemini')} className="text-red-500 text-xs font-medium hover:underline">Desconectar</button>
                                        )}
                                    </div>
                                </div>
                                <SecretInput placeholder="AIza..." value={settings.geminiKey} disabled={settings.geminiConnected}
                                    onChange={(e: any) => setSettings((s: AppSettings) => ({ ...s, geminiKey: e.target.value }))}
                                    className="w-full p-3 border border-border bg-background rounded-lg text-sm mb-3 focus:ring-2 focus:ring-primary outline-none disabled:opacity-60 text-text-main" />
                                {settings.geminiConnected && (
                                    <div>
                                        <label className="block text-xs font-semibold text-text-muted mb-1 uppercase">Modelo</label>
                                        <SearchableSelect options={settings.geminiModelsList} value={settings.geminiModel} onChange={(val: string) => setSettings((s: AppSettings) => ({ ...s, geminiModel: val }))} />
                                    </div>
                                )}
                            </div>

                            {/* XAI CARD */}
                            <div className={`border rounded-xl p-5 transition-all bg-surface ${settings.xaiConnected ? 'border-green-200 bg-green-50/20' : 'border-border'}`}>
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2 font-bold text-text-main">
                                        <a href="https://console.x.ai/" target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-primary transition-colors">xAI (Grok)</a>
                                        {settings.xaiConnected && <CheckCircle2 size={16} className="text-green-600" />}
                                    </div>
                                    <div className="flex gap-2">
                                        {!settings.xaiConnected ? (
                                            <button
                                                onClick={() => connectProvider('xai')}
                                                disabled={!settings.xaiKey}
                                                className="flex items-center gap-2 px-3 py-1.5 bg-text-main text-text-inverted rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90"
                                            >
                                                <Power size={14} /> Conectar
                                            </button>
                                        ) : (
                                            <button onClick={() => disconnectProvider('xai')} className="text-red-500 text-xs font-medium hover:underline">Desconectar</button>
                                        )}
                                    </div>
                                </div>
                                <SecretInput placeholder="xai-..." value={settings.xaiKey} disabled={settings.xaiConnected}
                                    onChange={(e: any) => setSettings((s: AppSettings) => ({ ...s, xaiKey: e.target.value }))}
                                    className="w-full p-3 border border-border bg-background rounded-lg text-sm mb-3 focus:ring-2 focus:ring-primary outline-none disabled:opacity-60 text-text-main" />
                                {settings.xaiConnected && (
                                    <div>
                                        <label className="block text-xs font-semibold text-text-muted mb-1 uppercase">Modelo</label>
                                        <SearchableSelect options={settings.xaiModelsList} value={settings.xaiModel} onChange={(val: string) => setSettings((s: AppSettings) => ({ ...s, xaiModel: val }))} />
                                    </div>
                                )}
                            </div>

                            {/* CUSTOM PROVIDER 1 */}
                            <div className={`border rounded-xl p-5 transition-all bg-surface ${settings.custom1Connected ? 'border-green-200 bg-green-50/20' : 'border-border'}`}>
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2 font-bold text-text-main">
                                        {settings.custom1Name || 'Personalizado 1'}
                                        {settings.custom1Connected && <CheckCircle2 size={16} className="text-green-600" />}
                                    </div>
                                    <div className="flex gap-2">
                                        {!settings.custom1Connected ? (
                                            <button
                                                onClick={() => connectProvider('custom1')}
                                                disabled={!settings.custom1Key || !settings.custom1Url}
                                                className="flex items-center gap-2 px-3 py-1.5 bg-text-main text-text-inverted rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90"
                                            >
                                                <Power size={14} /> Conectar
                                            </button>
                                        ) : (
                                            <button onClick={() => disconnectProvider('custom1')} className="text-red-500 text-xs font-medium hover:underline">Desconectar</button>
                                        )}
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs font-medium text-text-muted mb-1 uppercase">Nombre (Visible)</label>
                                        <input type="text" placeholder="Ej: DeepSeek" value={settings.custom1Name}
                                            onChange={(e: any) => setSettings((s: AppSettings) => ({ ...s, custom1Name: e.target.value }))}
                                            className="w-full p-2 border border-border bg-background rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none text-text-main" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-text-muted mb-1 uppercase">URL de la API (Debe ser compatible con OpenAI)</label>
                                        <input type="text" placeholder="Ej: https://api.deepseek.com/v1" value={settings.custom1Url}
                                            disabled={settings.custom1Connected}
                                            onChange={(e: any) => setSettings((s: AppSettings) => ({ ...s, custom1Url: e.target.value }))}
                                            className="w-full p-2 border border-border bg-background rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none disabled:opacity-60 text-text-main" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-text-muted mb-1 uppercase">API Key</label>
                                        <SecretInput placeholder="sk-..." value={settings.custom1Key}
                                            disabled={settings.custom1Connected}
                                            onChange={(e: any) => setSettings((s: AppSettings) => ({ ...s, custom1Key: e.target.value }))}
                                            className="w-full p-2 border border-border bg-background rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none disabled:opacity-60 text-text-main" />
                                    </div>
                                </div>
                                {settings.custom1Connected && (
                                    <div className="mt-3">
                                        <label className="block text-xs font-semibold text-text-muted mb-1 uppercase">Modelo</label>
                                        <SearchableSelect options={settings.custom1ModelsList} value={settings.custom1Model} onChange={(val: string) => setSettings((s: AppSettings) => ({ ...s, custom1Model: val }))} />
                                        <button onClick={() => openModelsManager('custom1')} className="text-xs text-primary hover:underline mt-1 flex items-center gap-1">
                                            <Settings2 size={12} /> Gestionar modelos
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* CUSTOM PROVIDER 2 */}
                            <div className={`border rounded-xl p-5 transition-all bg-surface ${settings.custom2Connected ? 'border-green-200 bg-green-50/20' : 'border-border'}`}>
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2 font-bold text-text-main">
                                        {settings.custom2Name || 'Personalizado 2'}
                                        {settings.custom2Connected && <CheckCircle2 size={16} className="text-green-600" />}
                                    </div>
                                    <div className="flex gap-2">
                                        {!settings.custom2Connected ? (
                                            <button
                                                onClick={() => connectProvider('custom2')}
                                                disabled={!settings.custom2Key || !settings.custom2Url}
                                                className="flex items-center gap-2 px-3 py-1.5 bg-text-main text-text-inverted rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90"
                                            >
                                                <Power size={14} /> Conectar
                                            </button>
                                        ) : (
                                            <button onClick={() => disconnectProvider('custom2')} className="text-red-500 text-xs font-medium hover:underline">Desconectar</button>
                                        )}
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs font-medium text-text-muted mb-1 uppercase">Nombre (Visible)</label>
                                        <input type="text" placeholder="Ej: Together AI" value={settings.custom2Name}
                                            onChange={(e: any) => setSettings((s: AppSettings) => ({ ...s, custom2Name: e.target.value }))}
                                            className="w-full p-2 border border-border bg-background rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none text-text-main" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-text-muted mb-1 uppercase">URL de la API (Debe ser compatible con OpenAI)</label>
                                        <input type="text" placeholder="Ej: https://api.together.xyz/v1" value={settings.custom2Url}
                                            disabled={settings.custom2Connected}
                                            onChange={(e: any) => setSettings((s: AppSettings) => ({ ...s, custom2Url: e.target.value }))}
                                            className="w-full p-2 border border-border bg-background rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none disabled:opacity-60 text-text-main" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-text-muted mb-1 uppercase">API Key</label>
                                        <SecretInput placeholder="sk-..." value={settings.custom2Key}
                                            disabled={settings.custom2Connected}
                                            onChange={(e: any) => setSettings((s: AppSettings) => ({ ...s, custom2Key: e.target.value }))}
                                            className="w-full p-2 border border-border bg-background rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none disabled:opacity-60 text-text-main" />
                                    </div>
                                </div>
                                {settings.custom2Connected && (
                                    <div className="mt-3">
                                        <label className="block text-xs font-semibold text-text-muted mb-1 uppercase">Modelo</label>
                                        <SearchableSelect options={settings.custom2ModelsList} value={settings.custom2Model} onChange={(val: string) => setSettings((s: AppSettings) => ({ ...s, custom2Model: val }))} />
                                        <button onClick={() => openModelsManager('custom2')} className="text-xs text-primary hover:underline mt-1 flex items-center gap-1">
                                            <Settings2 size={12} /> Gestionar modelos
                                        </button>
                                    </div>
                                )}
                            </div>




                        </div>
                    </div>

                    {/* MCP CONFIG */}
                    <section className="border-t border-border pt-6">
                        <div className="mb-4">
                            <label className="block text-lg font-semibold text-text-main flex items-center gap-2">
                                <Cpu size={20} /> Servidores MCP (Herramientas Locales)
                            </label>
                        </div>

                        <div className="mb-4 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800 text-sm">
                            <p className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-medium mb-1">
                                <Globe size={16} /> Registro de Servidores
                            </p>
                            <p className="text-text-muted mb-2">
                                Puedes encontrar servidores públicos en:{" "}
                                <a href={settings.mcpRegistryUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline underline-offset-4 font-medium">
                                    {settings.mcpRegistryUrl}
                                </a>
                            </p>
                            <div className="flex items-start gap-2 text-xs text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/10 p-2 rounded border border-orange-100 dark:border-orange-900/30">
                                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                                <p>
                                    <strong>Importante:</strong> Los servidores deben soportar <strong>CORS</strong> para funcionar en el navegador: permitir este origen, los headers <code>Mcp-Session-Id</code> y <code>MCP-Protocol-Version</code>, y exponer <code>Mcp-Session-Id</code>. Servidores <code>stdio</code> necesitan un puente HTTP (ej. <code>npx supergateway --stdio "..." --outputTransport streamableHttp --cors</code>).
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {/* Render existing servers */}
                            {settings.mcpServers.map((server: any, idx: number) => (
                                <div key={server.id} className="bg-surface p-4 rounded-xl space-y-4 border border-border shadow-sm">
                                    <div className="flex justify-between items-start">
                                        <h4 className="font-bold text-text-main flex items-center gap-2 text-sm min-w-0">
                                            <Server size={14} className="shrink-0" />
                                            <span className="truncate">{server.name || server.serverInfo?.name || `Servidor #${idx + 1}`}</span>
                                            {server.status === 'connected' && <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="Conectado" />}
                                        </h4>
                                        <button onClick={() => removeMCPServer(server.id)} className="text-text-muted hover:text-red-500">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex flex-col md:flex-row gap-4">
                                            <div className="flex-[2]">
                                                <label className="block text-xs font-medium text-text-muted mb-1 uppercase flex items-center gap-1">
                                                    <Globe size={12} /> URL
                                                </label>
                                                <input
                                                    type="text"
                                                    value={server.url}
                                                    disabled={server.status === 'connected'}
                                                    onChange={(e: any) => {
                                                        const val = e.target.value;
                                                        setSettings((s: AppSettings) => ({
                                                            ...s,
                                                            mcpServers: s.mcpServers.map((srv: any) => srv.id === server.id ? { ...srv, url: val } : srv)
                                                        }));
                                                    }}
                                                    className="w-full p-2 text-sm border border-border bg-background text-text-main rounded-lg outline-none font-mono disabled:opacity-60"
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <label className="block text-xs font-medium text-text-muted mb-1 uppercase">Transporte</label>
                                                <select
                                                    value={server.transport}
                                                    disabled={server.status === 'connected'}
                                                    onChange={(e: any) => {
                                                        const val = e.target.value as MCPTransport;
                                                        setSettings((s: AppSettings) => ({
                                                            ...s,
                                                            mcpServers: s.mcpServers.map((srv: any) => srv.id === server.id ? { ...srv, transport: val } : srv)
                                                        }));
                                                    }}
                                                    className="w-full p-2 text-sm border border-border bg-background text-text-main rounded-lg outline-none disabled:opacity-60"
                                                >
                                                    <option value="auto">Auto (recomendado)</option>
                                                    <option value="http-stream">Streamable HTTP (/mcp)</option>
                                                    <option value="sse">SSE legacy (/sse)</option>
                                                </select>
                                            </div>
                                        </div>

                                        {/* Row 2: Authentication */}
                                        <div className="flex flex-col md:flex-row gap-4 bg-surface-highlight/30 p-3 rounded-lg border border-border/50">
                                            <div className="flex-1">
                                                <label className="block text-xs font-medium text-text-muted mb-1 uppercase flex items-center gap-1">
                                                    <Lock size={12} /> Autenticación
                                                </label>
                                                <select
                                                    value={server.authType}
                                                    disabled={server.status === 'connected'}
                                                    onChange={(e: any) => {
                                                        const val = e.target.value as MCPAuthType;
                                                        setSettings((s: AppSettings) => ({
                                                            ...s,
                                                            mcpServers: s.mcpServers.map((srv: any) => srv.id === server.id ? { ...srv, authType: val } : srv)
                                                        }));
                                                    }}
                                                    className="w-full p-2 text-sm border border-border bg-background text-text-main rounded-lg outline-none disabled:opacity-60"
                                                >
                                                    <option value="none">Ninguna</option>
                                                    <option value="api-key">API Key</option>
                                                    <option value="oauth">Bearer / OAuth (token manual)</option>
                                                </select>
                                            </div>

                                            {server.authType === 'api-key' && (
                                                <div className="flex-1">
                                                    <label className="block text-xs font-medium text-text-muted mb-1 uppercase">Header</label>
                                                    <input
                                                        type="text"
                                                        placeholder="Authorization"
                                                        value={server.authHeader || ''}
                                                        disabled={server.status === 'connected'}
                                                        onChange={(e: any) => {
                                                            const val = e.target.value;
                                                            setSettings((s: AppSettings) => ({
                                                                ...s,
                                                                mcpServers: s.mcpServers.map((srv: any) => srv.id === server.id ? { ...srv, authHeader: val } : srv)
                                                            }));
                                                        }}
                                                        className="w-full p-2 text-sm border border-border bg-background text-text-main rounded-lg outline-none font-mono disabled:opacity-60"
                                                        title="Vacío = 'Authorization: Bearer <key>'. Ej: X-API-Key"
                                                    />
                                                </div>
                                            )}

                                            {server.authType !== 'none' && (
                                                <div className="flex-[2] animate-in fade-in slide-in-from-left-2">
                                                    <label className="block text-xs font-medium text-text-muted mb-1 uppercase flex items-center gap-1">
                                                        <Key size={12} /> Token / Key
                                                    </label>
                                                    <SecretInput
                                                        value={server.authToken}
                                                        disabled={server.status === 'connected'}
                                                        onChange={(e: any) => {
                                                            const val = e.target.value;
                                                            setSettings((s: AppSettings) => ({
                                                                ...s,
                                                                mcpServers: s.mcpServers.map((srv: any) => srv.id === server.id ? { ...srv, authToken: val } : srv)
                                                            }));
                                                        }}
                                                        className="w-full p-2 text-sm border border-border bg-background text-text-main rounded-lg outline-none font-mono disabled:opacity-60"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <label className="flex items-start gap-2 text-xs text-text-muted cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            className="mt-0.5"
                                            checked={!!server.useProxy}
                                            disabled={server.status === 'connected'}
                                            onChange={(e: any) => {
                                                const val = e.target.checked;
                                                setSettings((s: AppSettings) => ({
                                                    ...s,
                                                    mcpServers: s.mcpServers.map((srv: any) => srv.id === server.id ? { ...srv, useProxy: val } : srv)
                                                }));
                                            }}
                                        />
                                        <span>
                                            <strong className="text-text-main">Conectar vía proxy</strong> — evita el bloqueo CORS pasando por <code>/api/mcp</code> de esta app
                                            (necesario para n8n Cloud). El proxy no guarda nada y sólo conecta con servidores https públicos.
                                        </span>
                                    </label>

                                    {/* Actions & Status */}
                                    <div className="flex items-center gap-3 pt-2">
                                        {server.status === 'connected' ? (
                                            <button
                                                onClick={() => disconnectMCPServer(server.id)}
                                                className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg font-medium text-sm transition-all"
                                            >
                                                <Power size={16} /> Desconectar
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => connectMCPServer(server.id)}
                                                disabled={server.status === 'loading'}
                                                className="flex items-center gap-2 px-4 py-2 bg-text-main text-text-inverted hover:opacity-90 rounded-lg font-medium text-sm transition-all disabled:opacity-70"
                                            >
                                                {server.status === 'loading' ? <RefreshCw className="animate-spin" size={16} /> : <Plug size={16} />}
                                                {server.status === 'loading' ? 'Conectando...' : 'Conectar Servidor'}
                                            </button>
                                        )}
                                    </div>

                                    {/* Connection info (educativo: qué se negoció en el handshake) */}
                                    {server.status === 'connected' && (
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-muted bg-green-50/50 dark:bg-green-900/10 border border-green-200/60 dark:border-green-800/30 rounded-lg p-3">
                                            {server.serverInfo && <span><strong className="text-text-main">{server.serverInfo.name}</strong>{server.serverInfo.version ? ` v${server.serverInfo.version}` : ''}</span>}
                                            {server.resolvedTransport && <span>Transporte: <code>{server.resolvedTransport}</code></span>}
                                            {server.protocolVersion && <span>Protocolo: <code>{server.protocolVersion}</code></span>}
                                            <label className="flex items-center gap-2 ml-auto cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    checked={!!server.autoApprove}
                                                    onChange={(e: any) => {
                                                        const val = e.target.checked;
                                                        setSettings((s: AppSettings) => ({
                                                            ...s,
                                                            mcpServers: s.mcpServers.map((srv: any) => srv.id === server.id ? { ...srv, autoApprove: val } : srv)
                                                        }));
                                                    }}
                                                />
                                                Ejecutar sin pedir confirmación
                                            </label>
                                        </div>
                                    )}

                                    {/* Error Banner */}
                                    {server.status === 'error' && (
                                        <div className="mt-3 p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 rounded-lg flex items-start gap-3 animate-in slide-in-from-top-2">
                                            <AlertCircle className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" size={20} />
                                            <div className="flex-1">
                                                <h5 className="text-sm font-bold text-red-700 dark:text-red-300 mb-1">Error de conexión</h5>
                                                <p className="text-sm text-red-600 dark:text-red-400 leading-relaxed whitespace-pre-wrap">
                                                    {server.errorMessage}
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Tools Selector */}
                                    {server.status === 'connected' && server.tools.length > 0 && (
                                        <div className="mt-4 p-4 bg-surface-highlight/50 rounded-xl border border-border animate-in fade-in">
                                            <h5 className="font-semibold text-sm mb-3 flex items-center gap-2 text-text-main">
                                                <Wrench size={16} className="text-primary" />
                                                Herramientas ({server.enabledTools.length}/{server.tools.length})
                                            </h5>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {server.tools.map((tool: any) => {
                                                    const isEnabled = server.enabledTools.includes(tool.name);
                                                    return (
                                                        <div
                                                            key={tool.name}
                                                            onClick={() => toggleMCPTool(server.id, tool.name)}
                                                            className={`p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm flex items-start gap-3 ${isEnabled
                                                                ? 'bg-surface border-primary ring-1 ring-primary'
                                                                : 'bg-background border-border hover:bg-surface'
                                                                }`}
                                                        >
                                                            <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center transition-colors ${isEnabled ? 'bg-primary border-primary' : 'bg-transparent border-gray-400'
                                                                }`}>
                                                                {isEnabled && <CheckCircle2 size={12} className="text-white" />}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className={`text-sm font-bold truncate flex items-center gap-1.5 ${isEnabled ? 'text-primary' : 'text-text-main'}`}>
                                                                    <span className="truncate">{tool.title || tool.name}</span>
                                                                    {tool.annotations?.readOnlyHint && <span className="text-[9px] px-1.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 shrink-0">lectura</span>}
                                                                    {tool.annotations?.destructiveHint && !tool.annotations?.readOnlyHint && <span className="text-[9px] px-1.5 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 shrink-0">destructiva</span>}
                                                                </div>
                                                                <div className="text-xs text-text-muted line-clamp-2 leading-relaxed">
                                                                    {tool.description || 'Sin descripción.'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            <div className="flex flex-col md:flex-row md:items-center gap-2 text-xs text-text-muted bg-surface p-3 rounded-xl border border-border">
                                <label className="font-medium uppercase flex items-center gap-1 shrink-0"><Key size={12} /> Token del proxy</label>
                                <SecretInput
                                    value={settings.proxyToken || ''}
                                    onChange={(e: any) => { const val = e.target.value; setSettings((s: AppSettings) => ({ ...s, proxyToken: val })); }}
                                    placeholder="Opcional: sólo si el administrador definió NODEMAT_PROXY_TOKEN en el servidor"
                                    className="flex-1 p-2 text-sm border border-border bg-background text-text-main rounded-lg outline-none font-mono"
                                />
                            </div>

                            <button
                                onClick={addMCPServer}
                                className="w-full py-3 border-2 border-dashed border-border rounded-xl text-text-muted font-medium hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2"
                            >
                                <Plus size={18} /> Agregar otro servidor MCP
                            </button>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};

const StorageWarningModal = ({
    isOpen,
    onClose,
    onBackup,
    onCleanup
}: {
    isOpen: boolean,
    onClose: () => void,
    onBackup: () => void,
    onCleanup: () => void
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-surface border border-border rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6">
                    <div className="flex items-center gap-3 text-amber-500 mb-4">
                        <AlertTriangle size={32} />
                        <h2 className="text-xl font-bold text-text-main">Almacenamiento Lleno</h2>
                    </div>

                    <p className="text-text-muted mb-4 leading-relaxed">
                        El navegador no permite guardar más datos (límite de ~5MB alcanzado).
                        Tus nuevos mensajes <strong>no se guardarán</strong> si cierras la pestaña.
                    </p>

                    <div className="space-y-3">
                        <button
                            onClick={onBackup}
                            className="w-full flex items-center justify-center gap-2 p-3 bg-surface-highlight hover:bg-surface-hover text-text-main rounded-xl transition-colors border border-border font-medium"
                        >
                            <Download size={18} />
                            Descargar Copia de Seguridad (JSON)
                        </button>

                        <button
                            onClick={onCleanup}
                            className="w-full flex items-center justify-center gap-2 p-3 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors font-medium shadow-sm"
                        >
                            <Trash2 size={18} />
                            Borrar Mensajes Antiguos y Guardar
                        </button>
                    </div>

                    <div className="mt-4 pt-4 border-t border-border flex justify-end">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-text-muted hover:text-text-main text-sm font-medium transition-colors"
                        >
                            Cancelar (Riesgo de pérdida)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Storage Helpers --- (formatBytes viene de services/fileService)
const getStorageUsage = async () => {
    const estimate = await storageService.getUsageEstimate();
    if (estimate) {
        return { used: estimate.usage, formatted: formatBytes(estimate.usage) };
    }
    return { used: 0, formatted: 'Calculando...' };
};

const SystemPromptModal = ({ isOpen, onClose, prompt, onChange, educationalMode }: any) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 text-text-main">
            <div className="bg-surface rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col border border-border">
                <div className="flex items-center justify-between p-6 border-b border-border">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Terminal className="text-primary" /> Instrucciones personalizadas
                    </h2>
                    <button onClick={onClose} className="text-text-muted hover:text-text-main">
                        <X size={24} />
                    </button>
                </div>
                <div className="p-6 space-y-4">

                    <textarea
                        value={prompt}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder="Escribe aquí las instrucciones globales para la IA..."
                        className="w-full h-48 p-4 bg-background border border-border rounded-xl resize-none focus:ring-2 focus:ring-primary outline-none text-text-main font-mono text-sm leading-relaxed"
                    />
                </div>
                <div className="p-6 border-t border-border flex justify-end">
                    <button onClick={onClose} className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover font-medium">
                        Guardar
                    </button>
                </div>
            </div>
        </div>
    );
};

const DeleteChatModal = ({
    isOpen,
    onClose,
    onConfirm,
    onExport,
    onDownloadOnly,
    chatTitle
}: {
    isOpen: boolean,
    onClose: () => void,
    onConfirm: () => void,
    onExport: (name: string) => void,
    onDownloadOnly: (name: string) => void,
    chatTitle: string
}) => {
    const [filename, setFilename] = useState('');

    useEffect(() => {
        if (isOpen && chatTitle) {
            const safeTitle = chatTitle.substring(0, 30).replace(/[^a-z0-9]/gi, '_').toLowerCase();
            setFilename(`${safeTitle}_${new Date().toISOString().slice(0, 10)}`);
        }
    }, [isOpen, chatTitle]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-border text-text-main animate-in zoom-in-95 duration-200">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-500">
                        <Trash2 size={20} />
                    </div>
                    <h3 className="text-lg font-bold">¿Borrar este chat?</h3>
                </div>
                <p className="text-text-muted mb-6">
                    Estás a punto de eliminar permanentemente <strong>"{chatTitle}"</strong>.
                    <br /><br />
                    Esta acción <strong>no afectará</strong> a tus otros chats.
                </p>

                <div className="mb-4 bg-surface-highlight/30 p-3 rounded-xl border border-border">
                    <label className="block text-xs font-semibold text-text-muted mb-1 uppercase">Guardar copia como:</label>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={filename}
                            onChange={(e) => setFilename(e.target.value)}
                            className="flex-1 p-2 bg-background border border-border rounded-lg text-sm outline-none focus:border-primary text-text-main"
                            placeholder="nombre_archivo"
                        />
                        <span className="text-xs text-text-muted">.json</span>
                    </div>
                </div>

                <div className="space-y-2 mb-4">
                    <button
                        onClick={() => { onDownloadOnly(filename); onClose(); }}
                        className="w-full flex items-center justify-center gap-2 p-3 bg-primary-light hover:bg-primary/20 text-primary rounded-xl transition-colors border border-primary/20 font-medium text-sm"
                    >
                        <Download size={16} /> Solo Descargar
                    </button>
                    <button
                        onClick={() => onExport(filename)}
                        className="w-full flex items-center justify-center gap-2 p-3 bg-surface-highlight hover:bg-surface-hover text-text-main rounded-xl transition-colors border border-border font-medium text-sm"
                    >
                        <Download size={16} /> Descargar y Borrar
                    </button>
                </div>

                <div className="flex gap-3 justify-end pt-2 border-t border-border">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl hover:bg-surface-highlight text-text-muted font-medium transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium shadow-sm transition-colors"
                    >
                        Borrar sin Guardar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default function App() {
    // --- Auth State ---
    const [isAuthenticated, setIsAuthenticated] = useState(() => {
        return !LOGIN_REQUIRED || localStorage.getItem('nexus_auth') === 'true';
    });

    // --- App State ---
    const [settings, setSettings] = useState<AppSettings>(() => {
        const saved = localStorage.getItem('nexus_settings');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                return {
                    ...DEFAULT_SETTINGS, ...parsed,
                    mcpRegistryUrl: parsed.mcpRegistryUrl || DEFAULT_SETTINGS.mcpRegistryUrl,
                    // Un servidor que quedó "loading" al recargar nunca terminaría de conectar
                    mcpServers: Array.isArray(parsed.mcpServers)
                        ? parsed.mcpServers.map((s: MCPServer) => s.status === 'loading' ? { ...s, status: 'idle' } : s)
                        : []
                };
            } catch (e) {
                return DEFAULT_SETTINGS;
            }
        }
        return DEFAULT_SETTINGS;
    });

    // NEW Architecture: Load sessions from IndexedDB
    const [sessions, setSessions] = useState<ChatSession[]>([INITIAL_SESSION]);
    const [isStorageReady, setIsStorageReady] = useState(false);

    // Auto-connect providers if key exists in env/settings but marked disconnected
    useEffect(() => {
        setSettings(prev => {
            const updates: Partial<AppSettings> = {};
            let changed = false;

            // Helper to auto-connect if key exists and not connected
            const check = (keyProp: keyof AppSettings, connProp: keyof AppSettings) => {
                if (prev[keyProp] && !prev[connProp]) {
                    // Use type assertion to avoid TS errors with string|boolean
                    (updates as any)[connProp] = true;
                    changed = true;
                }
            };

            check('geminiKey', 'geminiConnected');
            check('openaiKey', 'openaiConnected');
            check('groqKey', 'groqConnected');
            check('openRouterKey', 'openRouterConnected');
            check('cerebrasKey', 'cerebrasConnected');
            check('xaiKey', 'xaiConnected');
            check('chatgptKey', 'chatgptConnected');
            // Check custom providers if keys exist
            if (prev.custom1Key && prev.custom1Url) check('custom1Key', 'custom1Connected');
            if (prev.custom2Key && prev.custom2Url) check('custom2Key', 'custom2Connected');

            return changed ? { ...prev, ...updates } : prev;
        });
    }, []); // Run once on mount


    // Ensure activeProvider is actually connected
    useEffect(() => {
        const connectedMap: Record<Provider, keyof AppSettings> = {
            groq: 'groqConnected', openrouter: 'openRouterConnected', openai: 'openaiConnected',
            cerebras: 'cerebrasConnected', gemini: 'geminiConnected', xai: 'xaiConnected',
            custom1: 'custom1Connected', custom2: 'custom2Connected', chatgpt: 'chatgptConnected'
        };

        const isCurrentConnected = settings[connectedMap[settings.activeProvider]];
        if (!isCurrentConnected) {
            // Find first connected provider
            const providers: Provider[] = ['groq', 'openrouter', 'openai', 'cerebras', 'gemini', 'xai', 'custom1', 'custom2', 'chatgpt'];
            const firstConnected = providers.find(p => settings[connectedMap[p]]);

            if (firstConnected) {
                setSettings(s => ({ ...s, activeProvider: firstConnected }));
            }
        }
    }, [settings.groqConnected, settings.openRouterConnected, settings.openaiConnected, settings.cerebrasConnected, settings.geminiConnected, settings.xaiConnected, settings.custom1Connected, settings.custom2Connected, settings.chatgptConnected, settings.activeProvider]);

    // Token compartido con /api/mcp y /api/chatgpt
    useEffect(() => { setBridgeToken(settings.proxyToken); }, [settings.proxyToken]);

    useEffect(() => {
        const initStorage = async () => {
            try {
                await storageService.migrateFromLocalStorage();
                const loaded = await storageService.loadAllSessions();
                if (loaded.length > 0) {
                    setSessions(loaded);
                    setCurrentSessionId(loaded[0].id);
                }
            } catch (err) {
                console.error("Critical: Storage initialization failed", err);
                alert("Hubo un problema al cargar tus conversaciones. Por favor, recarga la página.");
            } finally {
                setIsStorageReady(true);
                updateStorageStats();
            }
        };
        initStorage();
    }, []);

    const updateStorageStats = async () => {
        const stats = await getStorageUsage();
        setStorageUsage(stats);
    };

    const [currentSessionId, setCurrentSessionId] = useState<string>(sessions[0].id);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // UI State
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isManageModalOpen, setIsManageModalOpen] = useState(false);
    const [isImageModalOpen, setIsImageModalOpen] = useState(false);
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [showStorageWarning, setShowStorageWarning] = useState(false);
    const [storageUsage, setStorageUsage] = useState({ used: 0, formatted: 'Calculando...' });
    const [chatToDelete, setChatToDelete] = useState<{ id: string, title: string } | null>(null);

    // Tool Approval State
    const [pendingTool, setPendingTool] = useState<(ToolApprovalRequest & { resolve: (v: boolean) => void }) | null>(null);
    const autoApprovedTools = useRef<Set<string>>(new Set());   // "Permitir siempre" (hasta recargar)
    const abortRef = useRef<AbortController | null>(null);

    // Sharing / drag & drop
    const [isDragging, setIsDragging] = useState(false);
    const [showShareMenu, setShowShareMenu] = useState(false);
    const [toast, setToast] = useState('');
    const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

    // Connection Loading States
    const [isConnectingGroq, setIsConnectingGroq] = useState(false);
    const [isConnectingOpenRouter, setIsConnectingOpenRouter] = useState(false);

    const [isSystemPromptOpen, setIsSystemPromptOpen] = useState(false);

    // Models Manager Modal State
    const [showModelsManager, setShowModelsManager] = useState(false);
    const [showFileUploadModal, setShowFileUploadModal] = useState(false);
    const [modelsManagerProvider, setModelsManagerProvider] = useState<Provider>('gemini');
    const [newModelName, setNewModelName] = useState('');

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // --- Derived State ---
    const currentSession = sessions.find(s => s.id === currentSessionId) || sessions[0];

    // --- Effects ---

    useEffect(() => {
        const root = document.documentElement;
        const themeConfig = THEMES[settings.theme];

        if (settings.darkMode) {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }

        const vars: Record<string, string> = {
            '--color-primary': themeConfig.primary,
            '--color-primary-hover': themeConfig.primaryHover,
            '--color-primary-light': settings.darkMode ? `${themeConfig.primary}30` : themeConfig.primaryLight,
            '--color-background': settings.darkMode ? '#0f172a' : '#f8fafc',
            '--color-surface': settings.darkMode ? '#1e293b' : '#ffffff',
            '--color-surface-highlight': settings.darkMode ? '#334155' : '#f1f5f9',
            '--color-text-main': settings.darkMode ? '#f8fafc' : '#0f172a',
            '--color-text-muted': settings.darkMode ? '#94a3b8' : '#64748b',
            '--color-text-inverted': settings.darkMode ? '#0f172a' : '#ffffff',
            '--color-border': settings.darkMode ? '#334155' : '#e2e8f0',
        };

        Object.entries(vars).forEach(([key, val]) => {
            root.style.setProperty(key, val);
        });

    }, [settings.theme, settings.darkMode]);

    useEffect(() => {
        if (!settings.incognitoMode) {
            localStorage.setItem('nexus_settings', JSON.stringify(settings));
        }
    }, [settings]);

    useEffect(() => {
        if (!settings.incognitoMode && isStorageReady) {
            const saveCurrent = async () => {
                const current = sessions.find(s => s.id === currentSessionId);
                if (current) {
                    await storageService.saveSession(current);
                    updateStorageStats();
                }
            };
            saveCurrent();
        }
    }, [sessions, currentSessionId, settings.incognitoMode, isStorageReady]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [currentSession.messages]);

    // --- Handlers ---
    const handleBackupSessions = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(sessions, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "nexus_backup_" + new Date().toISOString().replace(/[:.]/g, '-') + ".json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    const handleStorageCleanup = async () => {
        // Keep last 20 messages of current session
        const current = sessions.find(s => s.id === currentSessionId);
        if (current && current.messages.length > 20) {
            const truncatedMessages = current.messages.slice(-20);
            const updatedSession = { ...current, messages: truncatedMessages };

            setSessions(prev => prev.map(s => s.id === currentSessionId ? updatedSession : s));

            // Explicit save to IDB
            await storageService.saveSession(updatedSession);
            setShowStorageWarning(false);
            updateStorageStats();
            alert('Limpieza completada. Se ha reducido el tamaño de este chat.');
        }
    };

    const handleLogin = () => {
        setIsAuthenticated(true);
        localStorage.setItem('nexus_auth', 'true');
    };

    const handleLogout = () => {
        setIsAuthenticated(false);
        localStorage.removeItem('nexus_auth');
    };

    const handleNewChat = () => {
        const newSession: ChatSession = {
            id: Date.now().toString(),
            title: 'Nuevo Chat',
            messages: [],
            createdAt: Date.now()
        };
        setSessions(prev => [newSession, ...prev]);
        setCurrentSessionId(newSession.id);
    };

    const handleDeleteChat = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const chat = sessions.find(s => s.id === id);
        if (chat) {
            setChatToDelete({ id: chat.id, title: chat.title });
        }
    };

    const handleExportSingleChat = async (customName?: string) => {
        if (!chatToDelete) return;
        const chat = sessions.find(s => s.id === chatToDelete.id);
        if (!chat) return;

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(chat, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);

        let filename = `nexus_chat_${chat.id}_${new Date().toISOString().slice(0, 10)}.json`;
        if (customName && typeof customName === 'string' && customName.trim()) {
            filename = customName.endsWith('.json') ? customName : `${customName}.json`;
        }

        downloadAnchorNode.setAttribute("download", filename);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();

        // After export, also delete the chat
        await confirmDeleteChat();
    };

    const handleDownloadOnlyChat = (customName?: string) => {
        if (!chatToDelete) return;
        const chat = sessions.find(s => s.id === chatToDelete.id);
        if (!chat) return;

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(chat, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);

        let filename = `nexus_chat_${chat.id}_${new Date().toISOString().slice(0, 10)}.json`;
        if (customName && typeof customName === 'string' && customName.trim()) {
            filename = customName.endsWith('.json') ? customName : `${customName}.json`;
        }

        downloadAnchorNode.setAttribute("download", filename);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        // Note: Does NOT delete the chat
    };

    const confirmDeleteChat = async () => {
        if (!chatToDelete) return;
        const id = chatToDelete.id;

        // 1. Remove from IDB
        await storageService.deleteSession(id);

        const newSessions = sessions.filter(s => s.id !== id);
        if (newSessions.length === 0) {
            const newSession = { ...INITIAL_SESSION, id: Date.now().toString() };
            setSessions([newSession]);
            setCurrentSessionId(newSession.id);
            await storageService.saveSession(newSession);
        } else {
            setSessions(newSessions);
            if (currentSessionId === id) {
                setCurrentSessionId(newSessions[0].id);
            }
        }

        setChatToDelete(null);
        updateStorageStats();
    };

    const handleDeleteAll = async () => {
        if (confirm('ADVERTENCIA: ¿Estás seguro de que quieres borrar ABSOLUTAMENTE TODO el historial?')) {
            await storageService.clearAll();

            const newSession = { ...INITIAL_SESSION, id: Date.now().toString() };
            setSessions([newSession]);
            setCurrentSessionId(newSession.id);
            await storageService.saveSession(newSession);

            setIsManageModalOpen(false);
            updateStorageStats();
        }
    };

    const handleExportChats = (customName?: string) => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(sessions, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);

        let filename = `nexus_chats_${new Date().toISOString().slice(0, 10)}.json`;
        if (customName && typeof customName === 'string' && customName.trim()) {
            filename = customName.endsWith('.json') ? customName : `${customName}.json`;
        }

        downloadAnchorNode.setAttribute("download", filename);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        setIsManageModalOpen(false);
    };

    const connectProvider = async (provider: Provider) => {
        // Dynamic key mapping for all providers
        const keyMap: Record<Provider, keyof AppSettings> = {
            groq: 'groqKey', openrouter: 'openRouterKey', openai: 'openaiKey',
            cerebras: 'cerebrasKey', gemini: 'geminiKey', xai: 'xaiKey',
            custom1: 'custom1Key', custom2: 'custom2Key', chatgpt: 'chatgptKey'
        };
        const connectedMap: Record<Provider, keyof AppSettings> = {
            groq: 'groqConnected', openrouter: 'openRouterConnected', openai: 'openaiConnected',
            cerebras: 'cerebrasConnected', gemini: 'geminiConnected', xai: 'xaiConnected',
            custom1: 'custom1Connected', custom2: 'custom2Connected', chatgpt: 'chatgptConnected'
        };
        const modelsListMap: Record<Provider, keyof AppSettings> = {
            groq: 'groqModelsList', openrouter: 'openRouterModelsList', openai: 'openaiModelsList',
            cerebras: 'cerebrasModelsList', gemini: 'geminiModelsList', xai: 'xaiModelsList',
            custom1: 'custom1ModelsList', custom2: 'custom2ModelsList', chatgpt: 'chatgptModelsList'
        };
        const modelMap: Record<Provider, keyof AppSettings> = {
            groq: 'groqModel', openrouter: 'openRouterModel', openai: 'openaiModel',
            cerebras: 'cerebrasModel', gemini: 'geminiModel', xai: 'xaiModel',
            custom1: 'custom1Model', custom2: 'custom2Model', chatgpt: 'chatgptModel'
        };

        const key = settings[keyMap[provider]] as string;
        if (!key) return;

        // Set loading state (simplified - just use a generic flag or skip)
        if (provider === 'groq') setIsConnectingGroq(true);
        else if (provider === 'openrouter') setIsConnectingOpenRouter(true);

        // For custom providers, we need to pass the custom URL
        let customUrl: string | undefined = undefined;
        if (provider === 'custom1') customUrl = settings.custom1Url;
        if (provider === 'custom2') customUrl = settings.custom2Url;

        const models = await fetchModels(provider, key, customUrl);

        if (models.length > 0) {
            setSettings(prev => ({
                ...prev,
                [connectedMap[provider]]: true,
                [modelsListMap[provider]]: models,
                [modelMap[provider]]: models.includes(prev[modelMap[provider]] as string) ? prev[modelMap[provider]] : models[0]
            }));
        } else {
            alert('Error de conexión: No se pudieron obtener los modelos. Verifica tu API Key.');
            setSettings(prev => ({ ...prev, [connectedMap[provider]]: false }));
        }

        if (provider === 'groq') setIsConnectingGroq(false);
        else if (provider === 'openrouter') setIsConnectingOpenRouter(false);
    };

    const disconnectProvider = (provider: Provider) => {
        const connectedMap: Record<Provider, keyof AppSettings> = {
            groq: 'groqConnected', openrouter: 'openRouterConnected', openai: 'openaiConnected',
            cerebras: 'cerebrasConnected', gemini: 'geminiConnected', xai: 'xaiConnected',
            custom1: 'custom1Connected', custom2: 'custom2Connected', chatgpt: 'chatgptConnected'
        };
        setSettings(prev => ({ ...prev, [connectedMap[provider]]: false }));
    };

    // --- MCP Handlers (Multi-Server) ---

    const addMCPServer = () => {
        const newServer: MCPServer = {
            id: Date.now().toString(),
            url: 'https://TU-INSTANCIA.app.n8n.cloud/mcp/...',
            transport: 'auto',
            useProxy: true,
            authType: 'none',
            authToken: '',
            status: 'idle',
            errorMessage: '',
            tools: [],
            enabledTools: []
        };
        setSettings(s => ({ ...s, mcpServers: [...s.mcpServers, newServer] }));
    };

    const removeMCPServer = (serverId: string) => {
        disconnectServer(serverId);
        setSettings(s => ({ ...s, mcpServers: s.mcpServers.filter(srv => srv.id !== serverId) }));
    };

    const connectMCPServer = async (serverId: string) => {
        setSettings(s => ({
            ...s,
            mcpServers: s.mcpServers.map(srv => srv.id === serverId ? { ...srv, status: 'loading', errorMessage: '' } : srv)
        }));

        const server = settings.mcpServers.find(s => s.id === serverId);
        if (!server) return;

        try {
            // Handshake completo: initialize -> notifications/initialized -> tools/list
            const res = await connectServer({ ...server, url: server.url.trim() });
            const toolNames = res.tools.map(t => t.name);
            setSettings(s => ({
                ...s,
                mcpServers: s.mcpServers.map(srv => srv.id === serverId ? {
                    ...srv,
                    status: 'connected',
                    tools: res.tools,
                    serverInfo: res.serverInfo,
                    protocolVersion: res.protocolVersion,
                    resolvedTransport: res.resolvedTransport,
                    instructions: res.instructions,
                    // Conservar la selección previa si las herramientas siguen existiendo
                    enabledTools: srv.enabledTools.filter(n => toolNames.includes(n)).length > 0
                        ? srv.enabledTools.filter(n => toolNames.includes(n))
                        : toolNames
                } : srv)
            }));
        } catch (e: any) {
            setSettings(s => ({
                ...s,
                mcpServers: s.mcpServers.map(srv => srv.id === serverId ? {
                    ...srv,
                    status: 'error',
                    errorMessage: getFriendlyMCPError(e)
                } : srv)
            }));
        }
    };

    const disconnectMCPServer = (serverId: string) => {
        disconnectServer(serverId);
        setSettings(s => ({
            ...s,
            mcpServers: s.mcpServers.map(srv => srv.id === serverId ? {
                ...srv,
                status: 'idle',
                tools: [],
                enabledTools: []
            } : srv)
        }));
    };

    const toggleMCPTool = (serverId: string, toolName: string) => {
        setSettings(s => ({
            ...s,
            mcpServers: s.mcpServers.map(srv => {
                if (srv.id !== serverId) return srv;
                const isEnabled = srv.enabledTools.includes(toolName);
                return {
                    ...srv,
                    enabledTools: isEnabled
                        ? srv.enabledTools.filter(n => n !== toolName)
                        : [...srv.enabledTools, toolName]
                };
            })
        }));
    };

    // --- Adjuntos: input, drag & drop y pegar desde el portapapeles ---
    const addFiles = async (files: File[]) => {
        const newAttachments: Attachment[] = [];
        const errors: string[] = [];

        for (const file of files) {
            try {
                newAttachments.push(await fileToAttachment(file));
            } catch (err: any) {
                errors.push(err.message || `Error leyendo ${file.name}`);
            }
        }

        if (newAttachments.length > 0) setAttachments(prev => [...prev, ...newAttachments]);
        if (errors.length > 0) alert(errors.join('\n'));
        setShowFileUploadModal(false);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files ? Array.from(e.target.files) : [];
        if (e.target) e.target.value = '';
        if (files.length) await addFiles(files);
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const files = Array.from(e.clipboardData.files);
        if (files.length > 0) {
            e.preventDefault();
            addFiles(files);
        }
    };

    // --- Tool Approval Logic ---

    const handleToolApproval = async (req: ToolApprovalRequest): Promise<boolean> => {
        if (autoApprovedTools.current.has(`${req.serverName}::${req.originalName}`)) return true;
        return new Promise<boolean>((resolve) => {
            setPendingTool({ ...req, resolve });
        });
    };

    const confirmTool = (decision: ToolDecision) => {
        if (pendingTool) {
            if (decision === 'always') autoApprovedTools.current.add(`${pendingTool.serverName}::${pendingTool.originalName}`);
            pendingTool.resolve(decision !== 'deny');
            setPendingTool(null);
        }
    };

    const handleStop = () => {
        abortRef.current?.abort();
        // Si estaba esperando aprobación, liberar la promesa
        if (pendingTool) {
            pendingTool.resolve(false);
            setPendingTool(null);
        }
    };

    const handleSend = async () => {
        if ((!input.trim() && attachments.length === 0) || isLoading) return;

        const connectedMap: Record<Provider, keyof AppSettings> = {
            groq: 'groqConnected', openrouter: 'openRouterConnected', openai: 'openaiConnected',
            cerebras: 'cerebrasConnected', gemini: 'geminiConnected', xai: 'xaiConnected',
            custom1: 'custom1Connected', custom2: 'custom2Connected', chatgpt: 'chatgptConnected'
        };
        const isConnected = settings[connectedMap[settings.activeProvider]];
        if (!isConnected) {
            alert(`Por favor, conecta ${settings.activeProvider.toUpperCase()} en los Ajustes primero.`);
            setIsSettingsOpen(true);
            return;
        }

        // ============================================
        // CHAT MODE
        // ============================================
        const sessionId = currentSessionId;
        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input,
            timestamp: Date.now(),
            attachments: attachments.length ? [...attachments] : undefined
        };

        const updatedMessages = [...currentSession.messages, userMsg];
        const updatedSession = { ...currentSession, messages: updatedMessages };

        if (currentSession.messages.length === 0) {
            updatedSession.title = input.slice(0, 30) || attachments[0]?.name || 'Archivo adjunto';
        }

        setSessions(prev => prev.map(s => s.id === sessionId ? updatedSession : s));
        setInput('');
        setAttachments([]);
        setIsLoading(true);

        const controller = new AbortController();
        abortRef.current = controller;
        const showMessages = (extra: Message[]) => setSessions(prev => prev.map(s =>
            s.id === sessionId ? { ...s, messages: [...updatedMessages, ...extra] } : s
        ));

        // Progreso parcial: si el usuario cancela, conservamos lo ya ejecutado
        let partial: Message[] = [];

        try {
            // El historial ya incluye el mensaje del usuario (antes se enviaba dos veces)
            const newMessages = await sendMessage(settings, updatedMessages, {
                onToolApproval: handleToolApproval,
                onUpdate: (msgs) => { partial = msgs; showMessages(msgs); },
                onSettingsPatch: (patch) => setSettings(s => ({ ...s, ...patch })),
                sessionId,
                signal: controller.signal
            });
            showMessages(newMessages);
        } catch (error: any) {
            const cancelled = error?.name === 'AbortError' || controller.signal.aborted;
            const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'system',
                content: cancelled ? '⏹️ Generación detenida por el usuario.' : `Error: ${error.message}. Verifica tu conexión.`,
                timestamp: Date.now()
            };
            showMessages([...partial, errorMsg]);
        } finally {
            abortRef.current = null;
            setIsLoading(false);
        }
    };

    // --- Imágenes generadas -> chat ---
    const handleInsertGeneratedImages = (images: GeneratedImage[], prompt: string, meta: { provider: Provider; model: string; logs: any }) => {
        const now = Date.now();
        const userMsg: Message = { id: `${now}`, role: 'user', content: `🖼️ ${prompt}`, timestamp: now };
        const modelMsg: Message = {
            id: `${now + 1}`,
            role: 'model',
            content: `Imagen generada con **${meta.model}** (${PROVIDER_NAMES[meta.provider] || meta.provider}).`,
            attachments: images.map((img, i) => ({ name: `imagen-${i + 1}.${img.mimeType.split('/')[1] || 'png'}`, type: img.mimeType, data: img.url })),
            timestamp: now + 1,
            rawDebug: { requestId: `img-${now}`, provider: meta.provider, model: meta.model, requestPayload: meta.logs?.request, responsePayload: meta.logs?.response }
        };
        setSessions(prev => prev.map(s => s.id === currentSessionId ? {
            ...s,
            title: s.messages.length === 0 ? `🖼️ ${prompt.slice(0, 28)}` : s.title,
            messages: [...s.messages, userMsg, modelMsg]
        } : s));
    };

    // --- Compartir / exportar ---
    const handleImportChats = async (file: File) => {
        try {
            const imported = await importSessionsFromFile(file);
            setSessions(prev => [...imported, ...prev]);
            setCurrentSessionId(imported[0].id);
            if (!settings.incognitoMode) {
                for (const s of imported) await storageService.saveSession(s);
            }
            setIsManageModalOpen(false);
            flash(`${imported.length} conversación(es) importada(s)`);
        } catch (e: any) {
            alert(e.message);
        }
    };

    const handleImportConfig = async (imported: Partial<AppSettings>, importedSessions: ChatSession[]) => {
        // Las conexiones MCP vivas no se pueden restaurar: se reconectan desde Ajustes
        settings.mcpServers.forEach(s => disconnectServer(s.id));
        setSettings(prev => ({ ...prev, ...imported }));
        if (importedSessions.length > 0) {
            setSessions(prev => [...importedSessions, ...prev]);
            setCurrentSessionId(importedSessions[0].id);
            if (!settings.incognitoMode) {
                for (const s of importedSessions) await storageService.saveSession(s);
            }
        }
    };

    const handleShareMessage = async (msg: Message) => {
        const outcome = await shareText(msg.content || '', currentSession.title);
        if (outcome !== 'shared' && outcome !== 'cancelled') flash(shareOutcomeLabel[outcome]);
    };



    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    if (!isStorageReady) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-background text-text-main flex-col gap-4">
                <RefreshCw className="animate-spin text-primary" size={48} />
                <h2 className="text-xl font-bold">Cargando Conversaciones...</h2>
                <p className="text-text-muted">Optimizando base de datos</p>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <LoginScreen onLogin={handleLogin} />;
    }

    return (
        <div className="flex h-screen w-full bg-background transition-colors duration-300">
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                sessions={sessions}
                currentSessionId={currentSessionId}
                setCurrentSessionId={setCurrentSessionId}
                handleNewChat={handleNewChat}
                handleDeleteChat={handleDeleteChat}
                settings={settings}
                setSettings={setSettings}
                setIsSettingsOpen={setIsSettingsOpen}
                setIsManageModalOpen={setIsManageModalOpen}
                setIsImageModalOpen={setIsImageModalOpen}
                onLogout={handleLogout}
            />

            <SystemPromptModal
                isOpen={isSystemPromptOpen}
                onClose={() => setIsSystemPromptOpen(false)}
                prompt={settings.systemPrompt}
                onChange={(val: string) => setSettings((s: AppSettings) => ({ ...s, systemPrompt: val }))}
            />
            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                settings={settings}
                setSettings={setSettings}
                connectProvider={connectProvider}
                disconnectProvider={disconnectProvider}
                isConnectingGroq={isConnectingGroq}
                isConnectingOpenRouter={isConnectingOpenRouter}
                addMCPServer={addMCPServer}
                removeMCPServer={removeMCPServer}
                connectMCPServer={connectMCPServer}
                disconnectMCPServer={disconnectMCPServer}
                toggleMCPTool={toggleMCPTool}
                openModelsManager={(provider: Provider) => { setModelsManagerProvider(provider); setShowModelsManager(true); }}
            />

            <ManageModal
                isOpen={isManageModalOpen}
                onClose={() => setIsManageModalOpen(false)}
                onExport={handleExportChats}
                onImport={handleImportChats}
                onDeleteAll={handleDeleteAll}
                storageUsage={storageUsage}
                settings={settings}
                sessions={sessions}
                onImportConfig={handleImportConfig}
            />

            <ImageGenModal
                isOpen={isImageModalOpen}
                onClose={() => setIsImageModalOpen(false)}
                settings={settings}
                onInsertInChat={handleInsertGeneratedImages}
                onAttach={(atts) => setAttachments(prev => [...prev, ...atts])}
            />


            <ToolApprovalModal
                pendingTool={pendingTool}
                onConfirm={confirmTool}
            />

            <StorageWarningModal
                isOpen={showStorageWarning}
                onClose={() => setShowStorageWarning(false)}
                onBackup={handleBackupSessions}
                onCleanup={handleStorageCleanup}
            />

            <DeleteChatModal
                isOpen={!!chatToDelete}
                onClose={() => setChatToDelete(null)}
                onConfirm={confirmDeleteChat}
                onExport={handleExportSingleChat}
                onDownloadOnly={handleDownloadOnlyChat}
                chatTitle={chatToDelete?.title || ''}
            />

            {/* Models Manager Modal */}
            {showModelsManager && modelsManagerProvider && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm p-4">
                    <div className="bg-surface rounded-2xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto shadow-xl border border-border animate-in fade-in zoom-in-95">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-text-main flex items-center gap-2">
                                <Wrench size={20} /> Gestionar Modelos
                            </h2>
                            <button onClick={() => { setShowModelsManager(false); setNewModelName(''); }} className="text-text-muted hover:text-text-main">
                                <X size={20} />
                            </button>
                        </div>

                        <p className="text-sm text-text-muted mb-4">
                            Proveedor: <strong className="text-text-main capitalize">{modelsManagerProvider}</strong>
                        </p>

                        {/* Current Models List */}
                        <div className="space-y-2 mb-4">
                            <label className="block text-xs font-semibold text-text-muted uppercase">Modelos disponibles</label>
                            {(() => {
                                const modelsListMap: Record<Provider, keyof AppSettings> = {
                                    groq: 'groqModelsList', openrouter: 'openRouterModelsList', openai: 'openaiModelsList',
                                    cerebras: 'cerebrasModelsList', gemini: 'geminiModelsList', xai: 'xaiModelsList',
                                    custom1: 'custom1ModelsList', custom2: 'custom2ModelsList', chatgpt: 'chatgptModelsList'
                                };
                                const models = settings[modelsListMap[modelsManagerProvider]] as string[];
                                return (
                                    <div className="max-h-48 overflow-y-auto space-y-1">
                                        {models.map((model, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-2 bg-background rounded-lg border border-border">
                                                <span className="text-sm text-text-main truncate flex-1">{model}</span>
                                                <button
                                                    onClick={() => {
                                                        const newList = models.filter((_, i) => i !== idx);
                                                        setSettings(prev => ({ ...prev, [modelsListMap[modelsManagerProvider]]: newList }));
                                                    }}
                                                    className="text-red-500 hover:text-red-700 p-1"
                                                    title="Eliminar modelo"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ))}
                                        {models.length === 0 && <p className="text-sm text-text-muted italic">No hay modelos</p>}
                                    </div>
                                );
                            })()}
                        </div>

                        {/* Add New Model */}
                        <div className="border-t border-border pt-4">
                            <label className="block text-xs font-semibold text-text-muted uppercase mb-2">Agregar nuevo modelo</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newModelName}
                                    onChange={(e) => setNewModelName(e.target.value)}
                                    placeholder="nombre-del-modelo"
                                    className="flex-1 p-2 border border-border bg-background rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none text-text-main"
                                />
                                <button
                                    onClick={() => {
                                        if (newModelName.trim()) {
                                            const modelsListMap: Record<Provider, keyof AppSettings> = {
                                                groq: 'groqModelsList', openrouter: 'openRouterModelsList', openai: 'openaiModelsList',
                                                cerebras: 'cerebrasModelsList', gemini: 'geminiModelsList', xai: 'xaiModelsList',
                                                custom1: 'custom1ModelsList', custom2: 'custom2ModelsList', chatgpt: 'chatgptModelsList'
                                            };
                                            const currentModels = settings[modelsListMap[modelsManagerProvider]] as string[];
                                            if (!currentModels.includes(newModelName.trim())) {
                                                setSettings(prev => ({
                                                    ...prev,
                                                    [modelsListMap[modelsManagerProvider]]: [newModelName.trim(), ...currentModels]
                                                }));
                                            }
                                            setNewModelName('');
                                        }
                                    }}
                                    disabled={!newModelName.trim()}
                                    className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary-hover"
                                >
                                    <Plus size={16} />
                                </button>
                            </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-border">
                            <button
                                onClick={() => { setShowModelsManager(false); setNewModelName(''); }}
                                className="w-full px-4 py-2 bg-surface-highlight text-text-main rounded-lg text-sm font-medium hover:bg-border"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <FileUploadModal
                isOpen={showFileUploadModal}
                onClose={() => setShowFileUploadModal(false)}
                onSelectFile={() => document.getElementById('hidden-file-input')?.click()}
                onFilesDropped={addFiles}
            />

            {/* MAIN CHAT AREA */}
            <div className="flex-1 flex flex-col h-full relative">
                {/* Header */}
                <header className="h-16 border-b border-border flex items-center justify-between px-4 bg-surface/80 backdrop-blur z-10 transition-colors">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsSidebarOpen(true)}
                            className="p-2 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-highlight transition-colors"
                        >
                            <Menu size={24} />
                        </button>
                        <div className="font-semibold text-text-main truncate max-w-[150px] md:max-w-xs">{currentSession.title}</div>
                    </div>

                    <div className="flex items-center gap-3 max-w-[60%] md:max-w-none">
                        {/* Provider Selector - Clean Dropdown */}
                        {(() => {
                            const connectedMap: Record<Provider, keyof AppSettings> = {
                                groq: 'groqConnected', openrouter: 'openRouterConnected', openai: 'openaiConnected',
                                cerebras: 'cerebrasConnected', gemini: 'geminiConnected', xai: 'xaiConnected',
                                custom1: 'custom1Connected', custom2: 'custom2Connected', chatgpt: 'chatgptConnected'
                            };
                            const labels: Record<Provider, string> = {
                                groq: 'Groq Cloud', openrouter: 'OpenRouter', openai: 'OpenAI',
                                cerebras: 'Cerebras', gemini: 'Gemini', xai: 'xAI (Grok)',
                                custom1: settings.custom1Name || 'Personalizado 1', custom2: settings.custom2Name || 'Personalizado 2', chatgpt: 'ChatGPT (cuenta)'
                            };
                            const connectedProviders = (['groq', 'openrouter', 'openai', 'cerebras', 'gemini', 'xai', 'custom1', 'custom2', 'chatgpt'] as Provider[]).filter(p => settings[connectedMap[p]]);

                            return (
                                <div className="relative">
                                    <select
                                        value={settings.activeProvider}
                                        onChange={(e) => setSettings(s => ({ ...s, activeProvider: e.target.value as Provider }))}
                                        className="appearance-none bg-surface-highlight border border-border text-text-main text-sm font-medium rounded-lg px-3 py-2 pr-8 focus:ring-2 focus:ring-primary outline-none cursor-pointer"
                                        disabled={connectedProviders.length === 0}
                                    >
                                        {connectedProviders.length === 0 ? (
                                            <option value="">Sin conexión</option>
                                        ) : (
                                            connectedProviders.map(p => (
                                                <option key={p} value={p}>{labels[p]}</option>
                                            ))
                                        )}
                                    </select>
                                    <ChevronDown size={16} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                                </div>
                            );
                        })()}

                        {/* Model Switcher - Only show if a provider is connected */}
                        {(() => {
                            const connectedMap: Record<Provider, keyof AppSettings> = {
                                groq: 'groqConnected', openrouter: 'openRouterConnected', openai: 'openaiConnected',
                                cerebras: 'cerebrasConnected', gemini: 'geminiConnected', xai: 'xaiConnected',
                                custom1: 'custom1Connected', custom2: 'custom2Connected', chatgpt: 'chatgptConnected'
                            };
                            const hasConnectedProvider = (['groq', 'openrouter', 'openai', 'cerebras', 'gemini', 'xai', 'custom1', 'custom2', 'chatgpt'] as Provider[]).some(p => settings[connectedMap[p]]);

                            if (!hasConnectedProvider) return null;

                            const modelsListMap: Record<Provider, keyof AppSettings> = {
                                groq: 'groqModelsList', openrouter: 'openRouterModelsList', openai: 'openaiModelsList',
                                cerebras: 'cerebrasModelsList', gemini: 'geminiModelsList', xai: 'xaiModelsList',
                                custom1: 'custom1ModelsList', custom2: 'custom2ModelsList', chatgpt: 'chatgptModelsList'
                            };
                            const modelMap: Record<Provider, keyof AppSettings> = {
                                groq: 'groqModel', openrouter: 'openRouterModel', openai: 'openaiModel',
                                cerebras: 'cerebrasModel', gemini: 'geminiModel', xai: 'xaiModel',
                                custom1: 'custom1Model', custom2: 'custom2Model', chatgpt: 'chatgptModel'
                            };
                            const ap = settings.activeProvider;
                            return (
                                <div className="w-[180px] md:w-[220px]">
                                    <SearchableSelect
                                        key={ap}
                                        options={settings[modelsListMap[ap]] as string[]}
                                        value={settings[modelMap[ap]] as string}
                                        onChange={(val: string) => setSettings(s => ({ ...s, [modelMap[ap]]: val }))}
                                        placeholder="Elige modelo..."
                                    />
                                </div>
                            );
                        })()}

                        {/* Header Actions */}
                        <div className="h-8 w-px bg-border mx-2" />
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setSettings(s => ({ ...s, incognitoMode: !s.incognitoMode }))}
                                className={`p-2 rounded-lg transition-all ${settings.incognitoMode ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' : 'text-text-muted hover:text-text-main hover:bg-surface-highlight'}`}
                                title={settings.incognitoMode ? "Desactivar Incógnito" : "Activar Incógnito"}
                            >
                                {settings.incognitoMode ? <VenetianMask size={20} /> : <EyeOff size={20} />}
                            </button>

                            <button
                                onClick={() => setIsImageModalOpen(true)}
                                className="p-2 text-text-muted hover:text-purple-500 hover:bg-surface-highlight rounded-lg transition-colors"
                                title="Generar imágenes"
                            >
                                <Sparkles size={20} />
                            </button>

                            <div className="relative">
                                <button
                                    onClick={() => setShowShareMenu(v => !v)}
                                    disabled={currentSession.messages.length === 0}
                                    className="p-2 text-text-muted hover:text-text-main hover:bg-surface-highlight rounded-lg transition-colors disabled:opacity-40"
                                    title="Compartir / exportar esta conversación"
                                >
                                    <Share2 size={20} />
                                </button>
                                {showShareMenu && (
                                    <>
                                        <div className="fixed inset-0 z-20" onClick={() => setShowShareMenu(false)} />
                                        <div className="absolute right-0 mt-2 w-64 bg-surface border border-border rounded-xl shadow-xl z-30 p-1.5 text-sm">
                                            {[
                                                { icon: <Share2 size={16} />, label: 'Compartir…', run: async () => { const o = await shareSession(currentSession); if (o !== 'shared' && o !== 'cancelled') flash(shareOutcomeLabel[o]); } },
                                                { icon: <Copy size={16} />, label: 'Copiar como Markdown', run: async () => flash((await copyText(sessionToMarkdown(currentSession))) ? 'Copiado' : 'No se pudo copiar') },
                                                { icon: <FileText size={16} />, label: 'Descargar Markdown (.md)', run: () => exportSessionMarkdown(currentSession, true) },
                                                { icon: <FileJson size={16} />, label: 'Descargar JSON (re-importable)', run: () => exportSessionJSON(currentSession) },
                                            ].map(item => (
                                                <button key={item.label}
                                                    onClick={() => { setShowShareMenu(false); item.run(); }}
                                                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-text-main hover:bg-surface-highlight text-left">
                                                    <span className="text-text-muted">{item.icon}</span>{item.label}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>

                            <button
                                onClick={() => currentSession && setChatToDelete({ id: currentSession.id, title: currentSession.title || 'Chat actual' })}
                                disabled={!currentSession}
                                className="p-2 text-text-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-colors disabled:opacity-50"
                                title="Borrar conversación"
                            >
                                <Trash2 size={20} />
                            </button>
                        </div>
                    </div>
                </header>

                {/* Messages (acepta soltar archivos) */}
                <div
                    className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 scrollbar-hide bg-background relative"
                    onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setIsDragging(true); } }}
                    onDragLeave={(e) => { if (e.currentTarget === e.target) setIsDragging(false); }}
                    onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        if (e.dataTransfer.files.length) addFiles(Array.from(e.dataTransfer.files));
                    }}
                >
                    {isDragging && (
                        <div className="sticky top-0 inset-x-0 h-full min-h-[200px] z-10 border-2 border-dashed border-primary bg-primary/10 rounded-2xl flex items-center justify-center pointer-events-none">
                            <div className="flex items-center gap-2 text-primary font-semibold"><Upload size={22} /> Suelta los archivos para adjuntarlos</div>
                        </div>
                    )}
                    {currentSession.messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-60">
                            <div className="w-20 h-20 bg-primary-light text-primary rounded-full flex items-center justify-center mb-6">
                                <MessageSquare size={32} />
                            </div>
                            <h1 className="text-2xl font-bold text-text-main mb-2">¡Hola! Soy Nodemat.</h1>
                            <p className="text-text-muted max-w-md mb-3">
                                Soy una plataforma pensada para que puedas aprender<br />
                                en profundidad cómo funcionan los modelos LLMs.
                            </p>
                            <p className="text-text-muted max-w-md text-sm">
                                Selecciona un proveedor conectado arriba para comenzar.
                            </p>
                        </div>
                    ) : (
                        currentSession.messages.map((msg) => {
                            // Resultados de herramientas MCP: tarjeta compacta
                            if (msg.role === 'tool') {
                                return (
                                    <div key={msg.id} className="flex justify-start">
                                        <div className="max-w-[90%] md:max-w-[80%] w-full md:w-auto md:min-w-[320px]">
                                            <ToolResultCard message={msg} onDownload={downloadImage} />
                                        </div>
                                    </div>
                                );
                            }

                            const isUser = msg.role === 'user';
                            const isAssistant = msg.role === 'model' || msg.role === 'assistant';
                            const onlyToolCalls = isAssistant && !!msg.toolCalls?.length && !msg.content;
                            const imageAtts = msg.attachments?.filter(a => a.type.startsWith('image/')) || [];
                            const fileAtts = msg.attachments?.filter(a => !a.type.startsWith('image/')) || [];

                            return (
                                <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[90%] md:max-w-[80%] space-y-2 group/msg`}>
                                        <div className={`${onlyToolCalls ? 'p-0' : 'p-4 rounded-2xl shadow-sm'} ${onlyToolCalls ? '' : isUser
                                            ? 'bg-primary text-white rounded-br-none'
                                            : msg.role === 'system'
                                                ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-100 dark:border-red-800'
                                                : 'bg-surface border border-border text-text-main rounded-bl-none'
                                            }`}>
                                            {/* Adjuntos del usuario: miniaturas */}
                                            {isUser && imageAtts.length > 0 && (
                                                <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
                                                    {imageAtts.map((att, i) => (
                                                        <a key={i} href="#" onClick={(e) => { e.preventDefault(); downloadImage(att.data, 'adjunto'); }} title={`${att.name} — clic para descargar`} className="shrink-0">
                                                            <img src={att.data} alt={att.name} className="h-20 w-20 object-cover rounded-lg border border-white/20" />
                                                        </a>
                                                    ))}
                                                </div>
                                            )}
                                            {fileAtts.length > 0 && (
                                                <div className="flex flex-wrap gap-2 mb-3">
                                                    {fileAtts.map((att, i) => (
                                                        <button key={i} onClick={() => downloadAttachment(att)} title="Descargar"
                                                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border max-w-[220px] ${isUser ? 'bg-white/10 border-white/20' : 'bg-surface-highlight border-border'}`}>
                                                            {att.type === 'application/pdf' ? <FileText size={16} /> : <Paperclip size={16} />}
                                                            <span className="truncate">{att.name}</span>
                                                            {att.size ? <span className="opacity-70 shrink-0">{formatBytes(att.size)}</span> : null}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}

                                            <div className="leading-relaxed">
                                                {isAssistant ? (
                                                    <>
                                                        {msg.content && (
                                                            <ReactMarkdown
                                                                remarkPlugins={[remarkGfm]}
                                                                urlTransform={markdownUrlTransform}
                                                                components={{
                                                                    p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                                                                    a: ({ node, ...props }) => {
                                                                        // Auto-detect image links that look like images
                                                                        const isImage = /\.(jpeg|jpg|gif|png|webp|bmp|svg)($|\?)/i.test(props.href || '');
                                                                        if (isImage) {
                                                                            return <ChatImage src={props.href} alt="Imagen enlazada" onDownload={downloadImage} />;
                                                                        }
                                                                        return <a className="text-blue-500 hover:underline font-medium break-all" target="_blank" rel="noopener noreferrer" {...props} />;
                                                                    },
                                                                    ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-2 space-y-1" {...props} />,
                                                                    ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-2 space-y-1" {...props} />,
                                                                    li: ({ node, ...props }) => <li className="pl-1" {...props} />,
                                                                    h1: ({ node, ...props }) => <h1 className="text-xl font-bold mt-4 mb-2" {...props} />,
                                                                    h2: ({ node, ...props }) => <h2 className="text-lg font-bold mt-3 mb-2" {...props} />,
                                                                    h3: ({ node, ...props }) => <h3 className="text-base font-bold mt-2 mb-1" {...props} />,
                                                                    code: ({ node, ...props }) => {
                                                                        const match = /language-(\w+)/.exec(props.className || '');
                                                                        // Simple inline code vs block code
                                                                        const isInline = !match && !String(props.children).includes('\n');
                                                                        return isInline
                                                                            ? <code className="bg-surface-highlight dark:bg-black/30 px-1 py-0.5 rounded font-mono text-sm" {...props} />
                                                                            : <code className="block bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto font-mono text-sm my-2" {...props} />;
                                                                    },
                                                                    pre: ({ node, ...props }) => <pre className="bg-transparent p-0 m-0" {...props} />,
                                                                    table: ({ node, ...props }) => <div className="overflow-x-auto my-3 border border-border rounded-lg"><table className="w-full text-sm border-collapse" {...props} /></div>,
                                                                    thead: ({ node, ...props }) => <thead className="bg-surface-highlight text-text-muted font-semibold" {...props} />,
                                                                    th: ({ node, ...props }) => <th className="p-2 border-b border-r border-border last:border-r-0 text-left" {...props} />,
                                                                    td: ({ node, ...props }) => <td className="p-2 border-b border-r border-border last:border-r-0" {...props} />,
                                                                    blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-primary/50 pl-4 italic my-2 text-text-muted" {...props} />,
                                                                    img: ({ node, ...props }) => <ChatImage src={props.src} alt={props.alt} onDownload={downloadImage} />
                                                                }}
                                                            >
                                                                {msg.content}
                                                            </ReactMarkdown>
                                                        )}
                                                        {/* Imágenes generadas por el modelo */}
                                                        {imageAtts.length > 0 && (
                                                            <div className="flex flex-wrap gap-3">
                                                                {imageAtts.map((att, i) => <ChatImage key={i} src={att.data} alt={att.name} onDownload={downloadImage} />)}
                                                            </div>
                                                        )}
                                                        <ToolCallsBlock message={msg} />
                                                    </>
                                                ) : (
                                                    <p className="whitespace-pre-wrap">{msg.content}</p>
                                                )}
                                            </div>
                                        </div>
                                        {!onlyToolCalls && (
                                            <div className={`flex items-center gap-2 text-xs text-text-muted ${isUser ? 'justify-end' : 'justify-start'}`}>
                                                <span>{isUser ? 'Tú' : msg.role === 'system' ? 'Sistema' : 'Nodemat AI'} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                {msg.usage && isAssistant && (
                                                    <span className="bg-surface-highlight px-1.5 py-0.5 rounded text-[10px] text-text-muted font-mono" title="Tokens de entrada | salida">
                                                        ⬇ {msg.usage.input} | ⬆ {msg.usage.output}
                                                    </span>
                                                )}
                                                {msg.content && msg.role !== 'system' && (
                                                    <span className="flex items-center gap-1 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                                                        <button onClick={async () => flash((await copyText(msg.content || '')) ? 'Copiado' : 'No se pudo copiar')} className="p-1 hover:text-text-main rounded" title="Copiar">
                                                            <Copy size={12} />
                                                        </button>
                                                        <button onClick={() => handleShareMessage(msg)} className="p-1 hover:text-text-main rounded" title="Compartir">
                                                            <Share2 size={12} />
                                                        </button>
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                    {isLoading && (
                        <div className="flex justify-start animate-pulse">
                            <div className="bg-surface p-4 rounded-2xl rounded-bl-none text-text-muted text-sm border border-border">
                                {pendingTool ? `Esperando tu aprobación para ${pendingTool.originalName}…` : 'Escribiendo...'}
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 md:p-6 bg-surface border-t border-border">
                    <div className="max-w-4xl mx-auto w-full">

                        {attachments.length > 0 && (
                            <div className="flex gap-2 mb-3 overflow-x-auto py-2">
                                {attachments.map((att, i) => (
                                    <div key={i} className="relative group shrink-0 animate-in zoom-in-90 duration-200">
                                        {att.type.startsWith('image/') ? (
                                            <img src={att.data} alt={att.name} title={att.name} className="h-16 w-16 object-cover rounded-lg border border-border shadow-sm" />
                                        ) : (
                                            <div className="h-16 w-28 bg-surface-highlight flex flex-col items-center justify-center gap-1 rounded-lg border border-border text-[10px] text-text-muted font-medium p-1 text-center shadow-sm" title={att.name}>
                                                {att.type === 'application/pdf' ? <FileText size={18} className="text-red-500" /> : <FileCode size={18} />}
                                                <span className="truncate w-full">{att.name}</span>
                                                {att.size ? <span className="opacity-70">{formatBytes(att.size)}</span> : null}
                                            </div>
                                        )}
                                        <button
                                            onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                                            className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 shadow-md transition-transform hover:scale-110"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div
                            className="flex items-end gap-2 p-2 rounded-2xl border border-border shadow-sm focus-within:ring-2 focus-within:ring-primary focus-within:border-primary transition-all"
                            style={{ backgroundColor: THEMES[settings.theme]?.primaryLight || '#f3f4f6' }}
                        >
                            <button
                                onClick={() => setIsSystemPromptOpen(true)}
                                className={`p-2 rounded-full transition-colors ${settings.systemPrompt ? 'text-primary bg-primary/10' : 'text-text-muted hover:text-text-main hover:bg-surface-highlight'}`}
                                title="Configurar Instrucciones Personalizadas"
                            >
                                <FileCode size={20} />
                            </button>

                            <div className="relative group">
                                <button
                                    onClick={() => setShowFileUploadModal(true)}
                                    className="p-2 text-text-muted hover:text-text-main hover:bg-surface-highlight rounded-full transition-colors"
                                    disabled={isLoading}
                                    title="Adjuntar archivo"
                                >
                                    <Paperclip size={20} />
                                </button>
                                <input
                                    type="file"
                                    multiple
                                    accept={ACCEPT_ATTRIBUTE}
                                    onChange={handleFileUpload}
                                    className="hidden"
                                    id="hidden-file-input"
                                />
                            </div>

                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                onPaste={handlePaste}
                                placeholder="Escribe un mensaje... (puedes pegar o soltar archivos)"
                                className="flex-1 bg-transparent max-h-32 min-h-[44px] py-3 text-text-main placeholder-text-muted outline-none resize-none scrollbar-hide text-sm md:text-base leading-relaxed"
                                rows={1}
                            />

                            {isLoading ? (
                                <button
                                    onClick={handleStop}
                                    className="p-3 rounded-xl transition-all shadow-sm bg-text-main text-text-inverted hover:opacity-90"
                                    title="Detener"
                                >
                                    <Square size={20} />
                                </button>
                            ) : (
                                <button
                                    onClick={handleSend}
                                    disabled={!input.trim() && attachments.length === 0}
                                    className={`p-3 rounded-xl transition-all shadow-sm ${!input.trim() && attachments.length === 0
                                        ? 'bg-surface-highlight text-text-muted cursor-not-allowed'
                                        : 'bg-primary text-white hover:bg-primary-hover hover:scale-105 active:scale-95'
                                        }`}
                                >
                                    <Send size={20} />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="mt-2 text-center">
                        <p className="text-[10px] text-text-muted">

                            Nodemat puede cometer errores. Considera verificar la información importante. • {settings.incognitoMode ? '🛡️ Modo Incógnito Activado' : '💾 Historial Local Activo'}
                        </p>

                    </div>
                </div>
            </div>

            {toast && (
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[130] bg-black/85 text-white text-sm px-4 py-2 rounded-full shadow-lg">
                    {toast}
                </div>
            )}
        </div>

    );
}
