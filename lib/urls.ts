/** Helpers de URLs (los usan las actions de archivos y la Fase 6). */

/**
 * Normaliza una URL de usuario:
 * - http:// o https:// → se deja como está.
 * - Cualquier otro esquema (mailto:, javascript:, data:, etc.) → '' (rechazado).
 * - Sin esquema → se antepone https:// (limpiando barras iniciales).
 * Devuelve '' si viene vacía.
 */
export function normalizarUrl(url: string): string {
  const limpia = url.trim();
  if (!limpia) return '';
  if (/^https?:\/\//i.test(limpia)) return limpia;
  if (/^[a-z][a-z0-9+.-]*:/i.test(limpia)) return '';
  return `https://${limpia.replace(/^\/+/, '')}`;
}
