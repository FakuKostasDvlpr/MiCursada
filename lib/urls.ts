/** Helpers de URLs (los usan las actions de archivos y la Fase 6). */

/** Si la URL no tiene protocolo, antepone https://. Devuelve '' si viene vacía. */
export function normalizarUrl(url: string): string {
  const limpia = url.trim();
  if (!limpia) return '';
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(limpia)) return limpia;
  return `https://${limpia}`;
}
