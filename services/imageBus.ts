/**
 * Aviso liviano entre componentes: cualquier imagen del chat o de la galería
 * puede pedir "editar esta imagen" y App abre el generador con ella cargada.
 */
type Listener = (src: string) => void;
const listeners = new Set<Listener>();

export function onImageEditRequest(fn: Listener) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}

export function requestImageEdit(src: string) {
    listeners.forEach(fn => fn(src));
}
