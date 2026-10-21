import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>;

/** Campo para claves y tokens con botón para mostrar / ocultar el valor. */
export const SecretInput: React.FC<Props> = ({ className = '', ...props }) => {
    const [visible, setVisible] = useState(false);
    // Los márgenes van al contenedor: si quedan en el input, el botón no queda centrado
    const margins = className.split(/\s+/).filter(c => /^-?m[trblxy]?-/.test(c));
    const inputClass = className.split(/\s+/).filter(c => !margins.includes(c)).join(' ');
    return (
        <div className={`relative flex-1 min-w-0 ${margins.join(' ')}`}>
            <input {...props} type={visible ? 'text' : 'password'} className={`${inputClass} w-full pr-9`} />
            <button
                type="button"
                onClick={() => setVisible(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-main"
                aria-label={visible ? 'Ocultar' : 'Mostrar'}
                title={visible ? 'Ocultar' : 'Mostrar'}
                tabIndex={-1}
            >
                {visible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
        </div>
    );
};
