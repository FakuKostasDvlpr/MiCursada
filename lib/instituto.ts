/**
 * Datos fijos del instituto y la carrera. Son constantes de la app (un solo
 * usuario), no vienen de la base ni del perfil editable.
 *
 * NOTA: `components/hoy-live.tsx` todavía tiene el nombre de la carrera y la
 * ruta del logo hardcodeados; puede migrarse a estas constantes más adelante.
 */
export const INSTITUTO = {
  /** Nombre completo del instituto. */
  nombre: 'Instituto de Tecnología ORT',
  /** Nombre corto para chips y kickers. */
  nombreCorto: 'ORT',
  carrera: 'Analista de Sistemas',
  sede: 'Almagro',
  turno: 'Turno noche',
  /** Logo oficial del aula virtual: azul ORT sobre transparente. */
  logo: '/logo-ort.png',
  /** Texto alternativo del logo. */
  logoAlt: 'Aula Virtual ORT',
} as const;

/** "Almagro · Turno noche" — la clase `.kicker` lo pasa a mayúsculas. */
export const SEDE_Y_TURNO = `${INSTITUTO.sede} · ${INSTITUTO.turno}`;
