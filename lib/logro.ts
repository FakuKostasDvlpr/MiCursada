// Hitos del toast de logro (handoff §6): el subtítulo depende de cuántas notas
// llevás acumuladas en TODA la cursada, no en la materia.

/** Cuánto queda el toast en pantalla antes de descartarse solo. */
export const MS_LOGRO = 3800;

/** Evento que dispara el editor de notas y escucha el toast. */
export const EVENTO_NOTA_CREADA = 'cursada:nota-creada';

/**
 * Subtítulo del toast para el total de notas acumuladas, o `null` si ese total
 * no es un hito.
 *
 * Sin fallback a propósito: `Nota anotada · +10 XP` hacía saltar el logro en
 * CADA nota y lo volvía ruido. El logro es de hitos —1, 5, 10 y cada 25—; fuera
 * de ellos no aparece nada.
 */
export function subtituloLogro(total: number): string | null {
  if (total === 1) return 'Primera nota de tu cursada · +50 XP';
  if (total === 5) return '¡5 notas! Vas tomando ritmo · +100 XP';
  if (total === 10) return '10 notas. Imparable · +150 XP';
  if (total > 0 && total % 25 === 0) return `${total} notas acumuladas · +250 XP`;
  return null;
}
