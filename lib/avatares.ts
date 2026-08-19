// Reglas de la biblioteca de avatares, compartidas entre el server y la UI.
//
// Vive acá y no en app/actions.ts porque ese archivo lleva `'use server'`: ahí
// TODO export tiene que ser una función async, y exportar una constante rompe
// el build (el typecheck no lo ve, el bundler sí).

/**
 * Cuántas fotos propias puede tener alguien guardadas a la vez.
 *
 * El tope existe para que la biblioteca siga siendo elegible de un vistazo y
 * para no acumular archivos para siempre en el bucket. Llegado al máximo hay
 * que borrar una para subir otra: cuál se va es decisión de la persona, no se
 * resuelve solo tirando la más vieja.
 */
export const MAX_FOTOS_BIBLIOTECA = 3;

// --- Tamaño de las fotos ---------------------------------------------------
//
// El presupuesto importa: el bucket es compartido y una foto de celular actual
// pesa entre 3 y 12 MB. Sin optimizar, 3 fotos por persona son ~20 MB cada
// una — con 50 personas ya es 1 GB.
//
// La foto se redimensiona y se recomprime EN EL CLIENTE antes de subir (ver
// lib/imagen.ts). Un avatar nunca se muestra a más de 160 px, así que 256 px
// de lado alcanzan de sobra incluso en pantallas retina, y es la misma medida
// a la que se rasterizan los avatares predefinidos: todo el bucket queda
// homogéneo. Una foto de 8 MB termina pesando ~25 KB, unas 300 veces menos.

/** Lado del cuadrado final, en px. El avatar más grande se ve a 160. */
export const LADO_AVATAR = 256;

/** Calidad del WebP. 0.82 es indistinguible a este tamaño y pesa la mitad que 0.95. */
export const CALIDAD_AVATAR = 0.82;

/**
 * Techo del archivo ORIGINAL que se intenta procesar. No es un límite de
 * producto: es para no colgar el navegador decodificando una imagen enorme en
 * un canvas antes de poder achicarla.
 */
export const MAX_ORIGINAL = 25 * 1024 * 1024;

/**
 * Desde este peso, se avisa que la foto venía pesada y se optimizó. Por debajo
 * el aviso sería ruido: la optimización pasa siempre, pero solo se cuenta
 * cuando el ahorro es algo que la persona notaría.
 */
export const AVISAR_DESDE = 1.5 * 1024 * 1024;

/**
 * Máximo de un GIF. Es el único formato que NO se redimensiona: pasarlo por un
 * canvas lo dejaría en un solo cuadro y perdería la animación, que es
 * justamente para lo que se sube. Como no se puede achicar, se acota.
 */
export const MAX_GIF = 1024 * 1024;

/**
 * Lo máximo que acepta el server por subida. Cubre un GIF al tope y cualquier
 * foto ya optimizada, con aire. Se valida igual del lado del server: la action
 * es un POST que se puede llamar sin pasar por la UI que optimiza.
 */
export const MAX_SUBIDA = 2 * 1024 * 1024;

/**
 * Peso legible en castellano: "8,4 MB", "2 MB", "28 KB", "612 bytes".
 *
 * Coma decimal y un solo decimal — "8,43 MB" no le dice nada a nadie más que
 * "8,4 MB", y los KB van redondeados a entero por el mismo motivo. Un valor
 * redondo se escribe sin decimal: "2 MB", no "2,0 MB".
 */
export function formatearPeso(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${Math.round(bytes)} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  const conUnDecimal = mb.toFixed(1);
  const texto = conUnDecimal.endsWith('.0') ? conUnDecimal.slice(0, -2) : conUnDecimal;
  return `${texto.replace('.', ',')} MB`;
}
