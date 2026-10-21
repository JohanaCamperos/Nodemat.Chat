import React, { useMemo, useState } from 'react';
import { Search, Images, AlertTriangle, LogOut, MessageSquare, Moon, Plus, Settings, Shield, ShieldOff, Sparkles, Sun, Terminal, Trash2, X } from 'lucide-react';
import { Tooltip } from './Tooltip';
import { storageService } from '../services/storageService';
import { ThemeOption } from '../types';
import { THEMES, LOGIN_REQUIRED } from '../config/defaults';

export const Sidebar: React.FC<any> = ({
    isOpen, onClose, sessions, currentSessionId, setCurrentSessionId, handleNewChat, handleDeleteChat,
    settings, setSettings, setIsSettingsOpen, setIsManageModalOpen, setIsImageModalOpen, setIsGalleryOpen, onLogout
}) => {
    const [query, setQuery] = useState('');
    // Busca en el título y en el texto de los mensajes
    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return sessions;
        return sessions.filter((s: any) => s.title?.toLowerCase().includes(q) ||
            s.messages?.some((m: any) => typeof m.content === 'string' && m.content.toLowerCase().includes(q)));
    }, [sessions, query]);

    return (
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
                    <button onClick={onClose} aria-label="Cerrar menú" className="text-text-muted hover:text-text-main p-1 rounded-md hover:bg-surface-highlight">
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
                <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                        onClick={() => { setIsImageModalOpen(true); onClose(); }}
                        className="flex items-center justify-center gap-2 border border-border text-text-main hover:bg-surface-highlight p-3 rounded-xl transition-all font-medium text-sm"
                    >
                        <Sparkles size={18} className="text-purple-500" />
                        Imágenes
                    </button>
                    <button
                        onClick={() => { setIsGalleryOpen(true); onClose(); }}
                        className="flex items-center justify-center gap-2 border border-border text-text-main hover:bg-surface-highlight p-3 rounded-xl transition-all font-medium text-sm"
                    >
                        <Images size={18} className="text-primary" />
                        Galería
                    </button>
                </div>

            </div>

            <div className="px-3 pt-3">
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Buscar en tus chats…"
                        aria-label="Buscar en tus chats"
                        className="w-full pl-8 pr-2 py-2 text-sm bg-background border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary text-text-main"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1">
                {visible.length === 0 && <p className="text-xs text-text-muted text-center py-6">Ningún chat coincide.</p>}
                {visible.map((session: any) => (
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
                            aria-label={`Borrar ${session.title}`}
                            className="opacity-100 md:opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 hover:bg-red-100 hover:text-red-500 rounded-lg transition-all"
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
};
