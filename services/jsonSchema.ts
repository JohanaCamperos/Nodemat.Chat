/**
 * Validación liviana de JSON Schema para los argumentos que el modelo arma
 * antes de llamar a una herramienta MCP.
 *
 * EDUCATIVO: los modelos se equivocan con los argumentos (falta un campo
 * obligatorio, mandan "5" en vez de 5…). Validar ANTES de llamar al servidor
 * permite devolverle al modelo un error claro para que corrija y reintente,
 * sin gastar una llamada ni arriesgar efectos raros.
 *
 * Cubre lo que usan los servidores MCP en la práctica: type, required,
 * properties, items, enum, const, mínimos/máximos y largos. Lo que no conoce
 * lo deja pasar: el servidor tiene la última palabra.
 */

const typeOf = (v: any): string =>
    v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v;

const matchesType = (v: any, t: string) => {
    const actual = typeOf(v);
    return actual === t || (t === 'number' && actual === 'integer');
};

/** Corrige errores típicos sin cambiar el significado ("5" -> 5, "true" -> true). */
function coerce(value: any, schema: any): any {
    const types: string[] = Array.isArray(schema?.type) ? schema.type : schema?.type ? [schema.type] : [];
    if (typeof value === 'string') {
        if ((types.includes('number') || types.includes('integer')) && value.trim() !== '' && !isNaN(Number(value))) return Number(value);
        if (types.includes('boolean') && /^(true|false)$/i.test(value)) return value.toLowerCase() === 'true';
        if ((types.includes('object') || types.includes('array')) && /^[[{]/.test(value.trim())) {
            try { return JSON.parse(value); } catch { /* se valida tal cual */ }
        }
    }
    return value;
}

export interface ValidationResult {
    value: any;
    errors: string[];
}

export function validateArgs(schema: any, input: any): ValidationResult {
    const errors: string[] = [];

    const walk = (s: any, v: any, path: string): any => {
        if (!s || typeof s !== 'object') return v;
        v = coerce(v, s);

        const types: string[] = Array.isArray(s.type) ? s.type : s.type ? [s.type] : [];
        if (types.length && v !== undefined && !types.some(t => matchesType(v, t))) {
            errors.push(`${path || 'los argumentos'}: se esperaba ${types.join(' o ')} y llegó ${typeOf(v)}`);
            return v;
        }
        if (s.enum && !s.enum.some((e: any) => JSON.stringify(e) === JSON.stringify(v))) {
            errors.push(`${path}: debe ser uno de ${s.enum.map((e: any) => JSON.stringify(e)).join(', ')}`);
        }
        if (s.const !== undefined && JSON.stringify(s.const) !== JSON.stringify(v)) {
            errors.push(`${path}: debe valer ${JSON.stringify(s.const)}`);
        }
        if (typeof v === 'number') {
            if (s.minimum !== undefined && v < s.minimum) errors.push(`${path}: mínimo ${s.minimum}`);
            if (s.maximum !== undefined && v > s.maximum) errors.push(`${path}: máximo ${s.maximum}`);
        }
        if (typeof v === 'string') {
            if (s.minLength !== undefined && v.length < s.minLength) errors.push(`${path}: al menos ${s.minLength} caracteres`);
            if (s.maxLength !== undefined && v.length > s.maxLength) errors.push(`${path}: como mucho ${s.maxLength} caracteres`);
        }
        if (Array.isArray(v) && s.items && typeof s.items === 'object') {
            v = v.map((item: any, i: number) => walk(s.items, item, `${path}[${i}]`));
        }
        if (typeOf(v) === 'object') {
            const out = { ...v };
            (Array.isArray(s.required) ? s.required : []).forEach((k: string) => {
                if (out[k] === undefined) errors.push(`falta el campo obligatorio "${path ? `${path}.` : ''}${k}"`);
            });
            Object.entries(s.properties || {}).forEach(([k, sub]) => {
                if (out[k] !== undefined) out[k] = walk(sub, out[k], path ? `${path}.${k}` : k);
            });
            return out;
        }
        return v;
    };

    const value = walk(schema, input ?? {}, '');
    return { value, errors };
}
