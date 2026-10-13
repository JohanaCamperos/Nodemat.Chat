import React, { useState, useEffect, useRef } from 'react';
import { X, Image as ImageIcon, Download, Terminal, Loader2, Sparkles, ChevronDown, RefreshCw, Share2, MessageSquarePlus, Paperclip, Upload, StopCircle, Wand2 } from 'lucide-react';
import { imageGenService, fetchImageModels, IMAGE_PROVIDERS, AspectRatio, GeneratedImage } from '../services/imageGenService';
import { downloadImage, fileToAttachment, shareImage, shareOutcomeLabel } from '../services/fileService';
import { Provider, AppSettings, PROVIDER_NAMES, Attachment } from '../types';

interface ImageGenModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: AppSettings;
    /** Inserta las imágenes en la conversación actual como un intercambio usuario/modelo */
    onInsertInChat?: (images: GeneratedImage[], prompt: string, meta: { provider: Provider; model: string; logs: any }) => void;
    /** Agrega las imágenes como adjuntos del próximo mensaje (para que un LLM con visión las analice) */
    onAttach?: (attachments: Attachment[]) => void;
}

const KEY_MAP: Record<Provider, keyof AppSettings> = {
    groq: 'groqKey', openrouter: 'openRouterKey', openai: 'openaiKey', cerebras: 'cerebrasKey',
    gemini: 'geminiKey', xai: 'xaiKey', custom1: 'custom1Key', custom2: 'custom2Key'
};

const ASPECTS: AspectRatio[] = ['1:1', '16:9', '9:16', '4:3', '3:4'];

interface HistoryItem { id: string; prompt: string; provider: Provider; model: string; images: GeneratedImage[]; }

export const ImageGenModal: React.FC<ImageGenModalProps> = ({ isOpen, onClose, settings, onInsertInChat, onAttach }) => {
    const [provider, setProvider] = useState<Provider>('openrouter');
    const [models, setModels] = useState<string[]>([]);
    const [model, setModel] = useState('');
    const [prompt, setPrompt] = useState('');
    const [aspect, setAspect] = useState<AspectRatio>('1:1');
    const [count, setCount] = useState(1);
    const [quality, setQuality] = useState<'auto' | 'low' | 'medium' | 'high'>('auto');
    const [references, setReferences] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingModels, setIsLoadingModels] = useState(false);
    const [result, setResult] = useState<{ images: GeneratedImage[]; text?: string; logs: any | null; error: string | null }>({ images: [], logs: null, error: null });
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [showLogs, setShowLogs] = useState(false);
    const [toast, setToast] = useState('');
    const abortRef = useRef<AbortController | null>(null);
    const refInput = useRef<HTMLInputElement>(null);

    const keyFor = (p: Provider) => (settings[KEY_MAP[p]] as string) || '';
    const customUrlFor = (p: Provider) => p === 'custom1' ? settings.custom1Url : p === 'custom2' ? settings.custom2Url : undefined;
    const providerLabel = (p: Provider) => p === 'custom1' ? settings.custom1Name : p === 'custom2' ? settings.custom2Name : PROVIDER_NAMES[p];

    const availableProviders = IMAGE_PROVIDERS.filter(p => keyFor(p));
    const providerOptions = availableProviders.length > 0 ? availableProviders : IMAGE_PROVIDERS;

    const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2200); };

    // Al abrir: elegir un proveedor con key configurada
    useEffect(() => {
        if (isOpen && !keyFor(provider) && availableProviders.length > 0) {
            setProvider(availableProviders[0]);
        }
    }, [isOpen]);

    // Cargar modelos de imagen cuando cambia el proveedor
    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        const key = keyFor(provider);
        if (!key) { setModels([]); return; }

        setIsLoadingModels(true);
        fetchImageModels(provider, key, customUrlFor(provider))
            .then(list => {
                if (cancelled) return;
                setModels(list);
                setModel(m => list.includes(m) ? m : (list[0] || ''));
            })
            .finally(() => !cancelled && setIsLoadingModels(false));
        return () => { cancelled = true; };
    }, [provider, isOpen, keyFor(provider)]);

    if (!isOpen) return null;

    const currentKey = keyFor(provider);
    const isGptImage = provider === 'openai' && !model.includes('dall-e');
    const supportsReferences = provider === 'openrouter' || provider === 'openai' || (provider === 'gemini' && !model.startsWith('imagen'));
    const maxCount = provider === 'openai' && model.includes('dall-e-3') ? 1 : 4;

    const handleGenerate = async () => {
        if (!prompt.trim() || !model || isLoading) return;
        if (!currentKey) {
            setResult({ images: [], error: `Falta la API Key de ${providerLabel(provider)} en Ajustes`, logs: { note: "Local Check Failed" } });
            return;
        }

        abortRef.current = new AbortController();
        setIsLoading(true);
        setResult({ images: [], logs: null, error: null });

        try {
            const response = await imageGenService.generateImage({
                prompt, model, provider, apiKey: currentKey,
                aspectRatio: aspect,
                n: Math.min(count, maxCount),
                quality,
                referenceImages: supportsReferences ? references : [],
                customUrl: customUrlFor(provider),
                signal: abortRef.current.signal
            });

            setResult({ images: response.images, text: response.text || response.revised_prompt, logs: response.logs, error: response.error || null });
            if (response.images.length) {
                setHistory(h => [{ id: Date.now().toString(), prompt, provider, model, images: response.images }, ...h].slice(0, 20));
            }
        } catch (e: any) {
            setResult({ images: [], logs: { error: e?.message }, error: e?.message || 'Error inesperado' });
        } finally {
            setIsLoading(false);
            abortRef.current = null;
        }
    };

    const handleReferenceFiles = async (files: FileList | File[] | null) => {
        if (!files) return;
        for (const f of Array.from(files)) {
            if (!f.type.startsWith('image/')) continue;
            try {
                const att = await fileToAttachment(f);
                setReferences(r => [...r, att.data].slice(0, 4));
            } catch (e: any) {
                flash(e.message);
            }
        }
    };

    const toAttachments = (imgs: GeneratedImage[]): Attachment[] =>
        imgs.map((img, i) => ({ name: `imagen-generada-${i + 1}.${img.mimeType.split('/')[1] || 'png'}`, type: img.mimeType, data: img.url }));

    const selectCls = "w-full p-2.5 bg-background border border-border rounded-xl text-sm appearance-none cursor-pointer pr-9 text-text-main";
    const label = "block text-xs font-bold text-text-muted uppercase mb-1";

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 md:p-4 animate-in fade-in">
            <div className="bg-surface border border-border rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border bg-surface-highlight/30">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 rounded-lg">
                            <Sparkles size={20} />
                        </div>
                        <h3 className="font-bold text-lg text-text-main">Generador de Imágenes</h3>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-surface-highlight rounded-lg transition-colors text-text-muted" title="Cerrar">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 md:p-6 md:flex gap-6">

                    {/* Left: Controls */}
                    <div className="w-full md:w-[340px] shrink-0 space-y-4 flex flex-col">

                        <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                                <label className={label}>Proveedor</label>
                                <div className="relative">
                                    <select value={provider} onChange={(e) => setProvider(e.target.value as Provider)} className={selectCls}>
                                        {providerOptions.map(p => <option key={p} value={p}>{providerLabel(p)}</option>)}
                                    </select>
                                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                                </div>
                                {!currentKey && <p className="text-[11px] text-red-500 mt-1">⚠️ Sin API Key. Añádela en Ajustes.</p>}
                            </div>

                            <div className="col-span-2">
                                <label className={label}>Modelo</label>
                                {isLoadingModels ? (
                                    <div className="w-full p-2.5 bg-background border border-border rounded-xl text-sm flex items-center gap-2 text-text-muted">
                                        <RefreshCw size={14} className="animate-spin" /> Cargando modelos...
                                    </div>
                                ) : (
                                    <>
                                        <input
                                            list="image-models"
                                            value={model}
                                            onChange={(e) => setModel(e.target.value)}
                                            className="w-full p-2.5 bg-background border border-border rounded-xl text-sm font-mono text-text-main"
                                            placeholder="Elige o escribe un modelo..."
                                        />
                                        <datalist id="image-models">
                                            {models.map(m => <option key={m} value={m} />)}
                                        </datalist>
                                        <p className="text-[10px] text-text-muted mt-1">{models.length} modelos de imagen disponibles</p>
                                    </>
                                )}
                            </div>

                            <div>
                                <label className={label}>Formato</label>
                                <div className="relative">
                                    <select value={aspect} onChange={e => setAspect(e.target.value as AspectRatio)} className={selectCls}>
                                        {ASPECTS.map(a => <option key={a} value={a}>{a}</option>)}
                                    </select>
                                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                                </div>
                            </div>
                            <div>
                                <label className={label}>Cantidad</label>
                                <div className="relative">
                                    <select value={Math.min(count, maxCount)} onChange={e => setCount(Number(e.target.value))} className={selectCls} disabled={provider === 'openrouter'}>
                                        {Array.from({ length: maxCount }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
                                    </select>
                                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                                </div>
                            </div>
                            {isGptImage && (
                                <div className="col-span-2">
                                    <label className={label}>Calidad</label>
                                    <div className="flex gap-1">
                                        {(['auto', 'low', 'medium', 'high'] as const).map(q => (
                                            <button key={q} onClick={() => setQuality(q)}
                                                className={`flex-1 py-1.5 rounded-lg text-xs border ${quality === q ? 'bg-primary text-white border-primary' : 'border-border text-text-muted hover:bg-surface-highlight'}`}>
                                                {q}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Prompt */}
                        <div>
                            <label className={label}>Prompt</label>
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleGenerate(); }}
                                onPaste={(e) => {
                                    const files = Array.from(e.clipboardData.files).filter(f => f.type.startsWith('image/'));
                                    if (files.length && supportsReferences) { e.preventDefault(); handleReferenceFiles(files); }
                                }}
                                className="w-full p-3 bg-background border border-border rounded-xl text-sm min-h-[110px] resize-y focus:ring-2 focus:ring-primary/50 text-text-main"
                                placeholder="Describe la imagen con detalle... (Ctrl+Enter para generar)"
                            />
                        </div>

                        {/* Reference images */}
                        {supportsReferences && (
                            <div>
                                <label className={label}>Imágenes de referencia (opcional)</label>
                                <div className="flex gap-2 flex-wrap">
                                    {references.map((r, i) => (
                                        <div key={i} className="relative">
                                            <img src={r} className="h-14 w-14 object-cover rounded-lg border border-border" />
                                            <button onClick={() => setReferences(refs => refs.filter((_, j) => j !== i))}
                                                className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5"><X size={10} /></button>
                                        </div>
                                    ))}
                                    {references.length < 4 && (
                                        <button onClick={() => refInput.current?.click()}
                                            className="h-14 w-14 border-2 border-dashed border-border rounded-lg flex items-center justify-center text-text-muted hover:border-primary hover:text-primary"
                                            title="Subir o pegar imagen para editar / usar de referencia">
                                            <Upload size={18} />
                                        </button>
                                    )}
                                    <input ref={refInput} type="file" accept="image/*" multiple className="hidden"
                                        onChange={e => { handleReferenceFiles(e.target.files); e.target.value = ''; }} />
                                </div>
                                <p className="text-[10px] text-text-muted mt-1">Para editar una imagen o mantener un estilo. También puedes pegarla en el prompt.</p>
                            </div>
                        )}

                        {isLoading ? (
                            <button onClick={() => abortRef.current?.abort()}
                                className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 bg-surface-highlight text-text-main hover:bg-border">
                                <Loader2 size={18} className="animate-spin" /> Generando... <StopCircle size={16} className="ml-1" /> Cancelar
                            </button>
                        ) : (
                            <button
                                onClick={handleGenerate}
                                disabled={!prompt.trim() || !model}
                                className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${!prompt.trim() || !model
                                    ? 'bg-surface-highlight text-text-muted cursor-not-allowed'
                                    : 'bg-primary text-white hover:bg-primary-hover shadow-lg hover:shadow-primary/25'}`}
                            >
                                <ImageIcon size={18} /> {references.length && supportsReferences ? 'Editar / Generar' : 'Generar Imagen'}
                            </button>
                        )}
                    </div>

                    {/* Right: Preview & Logs */}
                    <div className="flex-1 mt-6 md:mt-0 flex flex-col min-h-[300px] min-w-0">

                        <div className="flex-1 bg-black/5 dark:bg-black/40 rounded-xl border border-border relative overflow-hidden min-h-[300px] flex items-center justify-center p-3">
                            {result.images.length > 0 ? (
                                <div className={`grid gap-3 w-full ${result.images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                    {result.images.map((img, i) => (
                                        <div key={i} className="relative group flex items-center justify-center">
                                            <img src={img.url} alt={`Generada ${i + 1}`} className="max-w-full max-h-[55vh] object-contain rounded-lg shadow-lg" />
                                            <div className="absolute inset-x-0 bottom-0 p-2 flex flex-wrap justify-center gap-1.5 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/60 to-transparent rounded-b-lg">
                                                <ActionBtn onClick={() => downloadImage(img.url, 'nodemat_gen')} icon={<Download size={14} />} text="Guardar" />
                                                <ActionBtn onClick={async () => { const o = await shareImage(img.url, prompt); if (o !== 'shared' && o !== 'cancelled') flash(shareOutcomeLabel[o]); }} icon={<Share2 size={14} />} text="Compartir" />
                                                {supportsReferences && img.url.startsWith('data:') && (
                                                    <ActionBtn onClick={() => { setReferences(r => [...r, img.url].slice(0, 4)); flash('Añadida como referencia'); }} icon={<Wand2 size={14} />} text="Editar" />
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center text-text-muted">
                                    {result.error ? (
                                        <div className="p-4 max-w-sm text-red-500 bg-red-50 dark:bg-red-900/10 rounded-xl">
                                            <p className="font-bold mb-1">Error</p>
                                            <p className="text-sm break-words">{result.error}</p>
                                        </div>
                                    ) : isLoading ? (
                                        <div className="flex flex-col items-center gap-2"><Loader2 size={40} className="animate-spin" /><p>Generando…</p></div>
                                    ) : (
                                        <div className="flex flex-col items-center opacity-50">
                                            <Sparkles size={48} className="mb-2" />
                                            <p>Tu creatividad aparecerá aquí</p>
                                        </div>
                                    )}
                                </div>
                            )}
                            {toast && <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/80 text-white text-xs px-3 py-1 rounded-full">{toast}</div>}
                        </div>

                        {result.images.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3">
                                {onInsertInChat && (
                                    <button onClick={() => { onInsertInChat(result.images, prompt, { provider, model, logs: result.logs }); flash('Insertada en el chat'); }}
                                        className="flex items-center gap-2 px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover">
                                        <MessageSquarePlus size={16} /> Insertar en el chat
                                    </button>
                                )}
                                {onAttach && (
                                    <button onClick={() => { onAttach(toAttachments(result.images)); onClose(); }}
                                        className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm font-medium text-text-main hover:bg-surface-highlight">
                                        <Paperclip size={16} /> Adjuntar al próximo mensaje
                                    </button>
                                )}
                            </div>
                        )}

                        {result.text && (
                            <p className="mt-3 text-xs text-text-muted bg-surface-highlight/50 p-2 rounded-lg"><strong>Respuesta del modelo:</strong> {result.text}</p>
                        )}

                        {/* History */}
                        {history.length > 1 && (
                            <div className="mt-4">
                                <div className="text-xs font-bold text-text-muted uppercase mb-2">Historial de esta sesión</div>
                                <div className="flex gap-2 overflow-x-auto pb-1">
                                    {history.map(h => (
                                        <button key={h.id} title={`${h.prompt}\n${h.model}`}
                                            onClick={() => { setResult({ images: h.images, logs: null, error: null }); setPrompt(h.prompt); }}
                                            className="shrink-0">
                                            <img src={h.images[0].url} className="h-14 w-14 object-cover rounded-lg border border-border hover:ring-2 hover:ring-primary" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Logs */}
                        {result.logs && (
                            <div className="mt-4 border border-border rounded-xl overflow-hidden bg-background">
                                <button
                                    onClick={() => setShowLogs(!showLogs)}
                                    className="w-full flex items-center justify-between p-3 bg-surface-highlight/30 hover:bg-surface-highlight transition-colors text-xs font-mono text-text-muted"
                                >
                                    <span className="flex items-center gap-2"><Terminal size={12} /> Debug JSON (request / response)</span>
                                    <ChevronDown size={14} className={`transition-transform ${showLogs ? 'rotate-180' : ''}`} />
                                </button>
                                {showLogs && (
                                    <div className="max-h-64 overflow-y-auto p-3 bg-black text-green-400 font-mono text-[10px] leading-tight">
                                        <pre>{JSON.stringify(result.logs, null, 2)}</pre>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const ActionBtn: React.FC<{ onClick: () => void; icon: React.ReactNode; text: string }> = ({ onClick, icon, text }) => (
    <button onClick={onClick} className="px-2.5 py-1.5 bg-white/90 text-black rounded-full text-xs font-bold flex items-center gap-1 hover:scale-105 transition-transform">
        {icon} {text}
    </button>
);
