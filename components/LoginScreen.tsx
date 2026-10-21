import React, { useState } from 'react';
import { Search, Terminal } from 'lucide-react';
import { SecretInput } from './SecretInput';
import { LOGIN_USER, LOGIN_PASSWORD } from '../config/defaults';

export const LoginScreen = ({ onLogin }: { onLogin: () => void }) => {
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
