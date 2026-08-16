/**
 * Datos fijos del instituto y la carrera. Son constantes de la app (un solo
 * usuario), no vienen de la base ni del perfil editable.
 *
 * (El *nombre* del instituto que se muestra en el perfil no sale de acá: lo
 * trae el aula virtual en el `sitename` del site info. `INSTITUTO.nombre` es
 * solo el respaldo para cuando todavía no se verificó el token.)
 */
export const INSTITUTO = {
  /** Nombre completo del instituto. */
  nombre: 'Instituto de Tecnología ORT',
  /** Nombre corto para chips y kickers. */
  nombreCorto: 'ORT',
  carrera: 'Analista de Sistemas',
  sede: 'Almagro',
  turno: 'Turno noche',
  /**
   * Logo oficial, bajado de https://www.ort.edu.ar/img/LogoOrtArgWeb2017.jpg
   * (206×121). Es un JPG: viene con fondo blanco, no transparente, así que
   * SIEMPRE va sobre el chip blanco — sin eso, en tema oscuro se ve el recuadro.
   */
  logo: '/logo-ort.jpg',
  /** Medidas reales del archivo: next/image las usa para el aspect ratio. */
  logoAncho: 206,
  logoAlto: 121,
  /** Texto alternativo del logo. */
  logoAlt: 'ORT Argentina',
} as const;

/** "Almagro · Turno noche" — la clase `.kicker` lo pasa a mayúsculas. */
export const SEDE_Y_TURNO = `${INSTITUTO.sede} · ${INSTITUTO.turno}`;
