// Toast de acción (spec `specs/toasts-y-logro`): la confirmación efímera de que
// una mutación salió bien (o de que algo se borró). Mismo patrón que
// `lib/logro.ts`: el módulo solo define el contrato del evento; el componente
// vive en el layout de `(app)` y quien muta despacha.

/** Cuánto queda el toast en pantalla antes de descartarse solo. */
export const MS_TOAST = 2600;

/** Evento que despachan las mutaciones y escucha el toast del layout. */
export const EVENTO_TOAST = 'cursada:toast';

/**
 * `ok` es la confirmación verde; `delete` la roja de "esto se borró". La
 * variante la decide quién dispara, nunca una heurística sobre el mensaje.
 */
export type VarianteToast = 'ok' | 'delete';

export type Toast = { mensaje: string; variante: VarianteToast };

/**
 * Despacha el toast. Se llama **después** de que la Server Action respondió
 * `{ ok: true }`: si falla, el error se sigue mostrando inline.
 */
export function lanzarToast(mensaje: string, variante: VarianteToast): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<Toast>(EVENTO_TOAST, { detail: { mensaje, variante } }));
}
