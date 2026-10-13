import React, { useState } from 'react';
import { Download, Upload, Lock, RefreshCw, ShieldCheck } from 'lucide-react';
import { AppSettings, ChatSession } from '../types';
import { exportConfig, readConfigFile, openConfigFile } from '../services/configBackup';

interface Props {
    settings: AppSettings;
    sessions: ChatSession[];
    onImported: (settings: Partial<AppSettings>, sessions: ChatSession[]) => void;
}

/** Exportar / importar toda la configuración (keys, MCP, ChatGPT, ajustes) a un archivo local. */
export const ConfigBackupSection: React.FC<Props> = ({ settings, sessions, onImported }) => {
    const [password, setPassword] = useState('');
    const [includeChats, setIncludeChats] = useState(false);
    const [pendingFile, setPendingFile] = useState<Awaited<ReturnType<typeof readConfigFile>> | null>(null);
    const [importPassword, setImportPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    const run = async (fn: () => Promise<void>) => {
        setBusy(true);
        setMsg(null);
        try { await fn(); } catch (e: any) { setMsg({ ok: false, text: e.message || String(e) }); } finally { setBusy(false); }
    };

    const doImport = (file: typeof pendingFile, pwd?: string) => run(async () => {
        const { settings: imported, sessions: importedSessions } = await openConfigFile(file!, pwd);
        onImported(imported, importedSessions);
        setPendingFile(null);
        setImportPassword('');
        setMsg({ ok: true, text: `Configuración importada${importedSessions.length ? ` (+${importedSessions.length} chats)` : ''}. Reconecta tus servidores MCP.` });
    });

    const input = "w-full p-2 bg-background border border-border rounded-lg text-sm outline-none focus:border-primary text-text-main";

    return (
        <div className="mb-6 p-4 bg-surface-highlight/50 rounded-xl border border-border space-y-4">
            <div>
                <h4 className="text-sm font-semibold flex items-center gap-2"><ShieldCheck size={16} className="text-primary" /> Configuración (sólo en este navegador)</h4>
                <p className="text-xs text-text-muted mt-1">
                    Tus API keys, sesión de ChatGPT, servidores MCP y ajustes se guardan únicamente aquí. Exporta un archivo para
                    respaldarlos o llevarlos a otra PC.
                </p>
            </div>

            {/* Exportar */}
            <div className="space-y-2">
                <div className="relative">
                    <Lock size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                        placeholder="Contraseña para cifrar (recomendado)" className={`${input} pl-8`} />
                </div>
                {!password && <p className="text-[11px] text-amber-600">Sin contraseña, el archivo tendrá tus API keys en texto plano.</p>}
                <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
                    <input type="checkbox" checked={includeChats} onChange={e => setIncludeChats(e.target.checked)} />
                    Incluir también las conversaciones ({sessions.length})
                </label>
                <button
                    disabled={busy}
                    onClick={() => run(async () => {
                        await exportConfig(settings, { password: password || undefined, sessions: includeChats ? sessions : undefined });
                        setMsg({ ok: true, text: 'Archivo descargado.' });
                    })}
                    className="w-full flex items-center justify-center gap-2 p-2.5 bg-primary-light text-primary rounded-xl hover:opacity-90 font-medium text-sm disabled:opacity-50"
                >
                    {busy ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />} Exportar configuración
                </button>
            </div>

            {/* Importar */}
            {pendingFile ? (
                <div className="space-y-2">
                    <input type="password" value={importPassword} onChange={e => setImportPassword(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') doImport(pendingFile, importPassword); }}
                        placeholder="Contraseña del archivo" className={input} autoFocus />
                    <div className="flex gap-2">
                        <button onClick={() => doImport(pendingFile, importPassword)} disabled={busy || !importPassword}
                            className="flex-1 p-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50">Descifrar e importar</button>
                        <button onClick={() => { setPendingFile(null); setImportPassword(''); }} className="px-3 p-2 border border-border rounded-lg text-sm">Cancelar</button>
                    </div>
                </div>
            ) : (
                <label className="w-full flex items-center justify-center gap-2 p-2.5 border border-border text-text-main rounded-xl hover:bg-surface-highlight font-medium text-sm cursor-pointer">
                    <Upload size={16} /> Importar configuración
                    <input
                        type="file"
                        accept="application/json,.json"
                        className="hidden"
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            if (!f) return;
                            run(async () => {
                                const backup = await readConfigFile(f);
                                if (backup.encrypted) setPendingFile(backup);
                                else await doImport(backup);
                            });
                        }}
                    />
                </label>
            )}

            {msg && <p className={`text-xs ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>{msg.text}</p>}
        </div>
    );
};
