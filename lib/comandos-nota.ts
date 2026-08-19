// Parseo del composer de notas cuando arranca con `/`.
//
// Vive en lib/ y no en el componente por la misma razón que `mencionEnCursor`
// (lib/referencias.ts, el equivalente para `@`): es lógica pura del composer y
// se testea sin montar nada.

export type ComandoTipeado = {
  /** El comando sin la barra, en minúsculas: `"/TODO x"` → `"todo"`. */
  cmd: string;
  /** Lo escrito después del comando, con sus mayúsculas y sin bordes en blanco. */
  resto: string;
};

/**
 * Parte lo tipeado en el composer: el comando y su contenido.
 * `"/todo Traer el TP"` → `{ cmd: 'todo', resto: 'Traer el TP' }`.
 *
 * Existe para que un comando cree la nota YA terminada. Antes `/todo` creaba
 * un bloque vacío abajo del input y había que rellenarlo ahí, con el foco
 * saltando fuera del campo donde estabas escribiendo.
 */
export function partirComando(valor: string): ComandoTipeado {
  const m = /^\/(\S*)\s*([\s\S]*)$/.exec(valor);
  return { cmd: (m?.[1] ?? '').toLowerCase(), resto: (m?.[2] ?? '').trim() };
}
