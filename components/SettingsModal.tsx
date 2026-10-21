import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Cpu, Globe, Key, Lock, Plug, Plus, Power, RefreshCw, Server, Settings, Settings2, Trash2, Wrench, X } from 'lucide-react';
import { ChatGPTAccountCard } from './ChatGPTAccountCard';
import { SearchableSelect } from './SearchableSelect';
import { SecretInput } from './SecretInput';
import { AppSettings, MCPTransport, MCPAuthType } from '../types';

export const SettingsModal: React.FC<any> = ({
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
