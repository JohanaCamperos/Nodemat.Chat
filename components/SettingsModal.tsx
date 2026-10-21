import React from 'react';
import { AlertTriangle, CheckCircle2, Cpu, Globe, Key, Plus, Power, RefreshCw, Settings, Settings2, X } from 'lucide-react';
import { ChatGPTAccountCard } from './ChatGPTAccountCard';
import { SearchableSelect } from './SearchableSelect';
import { SecretInput } from './SecretInput';
import { AppSettings, MCPServer } from '../types';
import { MCPServerCard } from './MCPServerCard';

export const SettingsModal: React.FC<any> = ({
    isOpen, onClose, settings, setSettings, connectProvider, disconnectProvider,
    isConnectingGroq, isConnectingOpenRouter, addMCPServer, removeMCPServer,
    connectMCPServer, disconnectMCPServer, toggleMCPTool, openModelsManager, updateMCPServer, cancelMCPServer
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

                            {/* ANTHROPIC CARD */}
                            <div className={`border rounded-xl p-5 transition-all bg-surface ${settings.anthropicConnected ? 'border-green-200 bg-green-50/20' : 'border-border'}`}>
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2 font-bold text-text-main">
                                        <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-primary transition-colors">Anthropic (Claude)</a>
                                        {settings.anthropicConnected && <CheckCircle2 size={16} className="text-green-600" />}
                                    </div>
                                    <div className="flex gap-2">
                                        {!settings.anthropicConnected ? (
                                            <button
                                                onClick={() => connectProvider('anthropic')}
                                                disabled={!settings.anthropicKey}
                                                className="flex items-center gap-2 px-3 py-1.5 bg-text-main text-text-inverted rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90"
                                            >
                                                <Power size={14} /> Conectar
                                            </button>
                                        ) : (
                                            <button onClick={() => disconnectProvider('anthropic')} className="text-red-500 text-xs font-medium hover:underline">Desconectar</button>
                                        )}
                                    </div>
                                </div>
                                <SecretInput placeholder="sk-ant-..." value={settings.anthropicKey} disabled={settings.anthropicConnected}
                                    onChange={(e: any) => setSettings((s: AppSettings) => ({ ...s, anthropicKey: e.target.value }))}
                                    className="w-full p-3 border border-border bg-background rounded-lg text-sm mb-3 focus:ring-2 focus:ring-primary outline-none disabled:opacity-60 text-text-main" />
                                {settings.anthropicConnected && (
                                    <div>
                                        <label className="block text-xs font-semibold text-text-muted mb-1 uppercase">Modelo</label>
                                        <SearchableSelect options={settings.anthropicModelsList} value={settings.anthropicModel} onChange={(val: string) => setSettings((s: AppSettings) => ({ ...s, anthropicModel: val }))} />
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
                                <Cpu size={20} /> Servidores MCP
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
                                    <strong>Importante:</strong> desde el navegador, un servidor remoto tiene que permitir <strong>CORS</strong>; si no, activa
                                    <strong> "Conectar vía proxy"</strong>. Los servidores de tipo comando (<code>npx …</code>) se agregan con transporte
                                    <strong> "Comando local (stdio)"</strong> y requieren Nodemat corriendo en tu máquina.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {settings.mcpServers.map((server: MCPServer, idx: number) => (
                                <MCPServerCard
                                    key={server.id}
                                    server={server}
                                    index={idx}
                                    update={(patch) => updateMCPServer(server.id, patch)}
                                    onConnect={() => connectMCPServer(server.id)}
                                    onAuthorize={() => connectMCPServer(server.id, { authorize: true })}
                                    onCancel={() => cancelMCPServer(server.id)}
                                    onDisconnect={() => disconnectMCPServer(server.id)}
                                    onRemove={() => removeMCPServer(server.id)}
                                    onToggleTool={(name) => toggleMCPTool(server.id, name)}
                                />
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
