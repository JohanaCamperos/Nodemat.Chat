import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import { AppSettings } from '../types';
import { transcribeAudio, transcriptionProvider } from '../services/transcriptionService';

interface Props {
    settings: AppSettings;
    disabled?: boolean;
    onText: (text: string) => void;
    onError: (message: string) => void;
}

/** Dictado: graba con el micrófono y agrega la transcripción al mensaje. */
export const DictationButton: React.FC<Props> = ({ settings, disabled, onText, onError }) => {
    const [state, setState] = useState<'idle' | 'recording' | 'transcribing'>('idle');
    const [seconds, setSeconds] = useState(0);
    const recorder = useRef<MediaRecorder | null>(null);
    const chunks = useRef<Blob[]>([]);
    const timer = useRef<ReturnType<typeof setInterval>>();

    useEffect(() => () => {
        clearInterval(timer.current);
        recorder.current?.stream.getTracks().forEach(t => t.stop());
    }, []);

    const provider = transcriptionProvider(settings);

    const start = async () => {
        if (!provider) { onError('Para dictar hace falta una API key de Groq, OpenAI o Gemini (Ajustes).'); return; }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const rec = new MediaRecorder(stream);
            chunks.current = [];
            rec.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
            rec.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                clearInterval(timer.current);
                const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' });
                if (!blob.size) { setState('idle'); return; }
                setState('transcribing');
                try {
                    const ext = (rec.mimeType || 'audio/webm').split('/')[1].split(';')[0];
                    const text = await transcribeAudio(blob, `dictado.${ext}`, settings);
                    if (text) onText(text);
                } catch (e: any) {
                    onError(e?.message || String(e));
                } finally {
                    setState('idle');
                }
            };
            rec.start();
            recorder.current = rec;
            setSeconds(0);
            timer.current = setInterval(() => setSeconds(s => s + 1), 1000);
            setState('recording');
        } catch (e: any) {
            onError(e?.name === 'NotAllowedError' ? 'El navegador no dio permiso para usar el micrófono.' : `No se pudo usar el micrófono: ${e?.message || e}`);
        }
    };

    const stop = () => recorder.current?.state === 'recording' && recorder.current.stop();

    if (state === 'recording') {
        return (
            <button onClick={stop} className="flex items-center gap-1.5 px-2.5 py-2 rounded-full text-red-600 bg-red-500/10 hover:bg-red-500/20 transition-colors text-xs font-medium"
                title="Detener y transcribir" aria-label="Detener el dictado">
                <Square size={14} className="fill-current" /> {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
            </button>
        );
    }
    return (
        <button
            onClick={start}
            disabled={disabled || state === 'transcribing'}
            className="p-2 text-text-muted hover:text-text-main hover:bg-surface-highlight rounded-full transition-colors disabled:opacity-50"
            title={state === 'transcribing' ? 'Transcribiendo…' : provider ? `Dictar (transcribe con ${provider})` : 'Dictar (requiere una API key de Groq, OpenAI o Gemini)'}
            aria-label="Dictar mensaje"
        >
            {state === 'transcribing' ? <Loader2 size={20} className="animate-spin" /> : <Mic size={20} />}
        </button>
    );
};
