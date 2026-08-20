// Onboarding de 3 pasos + loader de anillos (spec `specs/onboarding-y-salida`,
// handoff `design_handoff_onboarding_sesion`).
//
// Acá vive solo el contenido y la timeline: el copy exacto de los tres pasos,
// los textos del checklist del loader y en qué milisegundo cambia cada cosa.
// El componente (`components/onboarding.tsx`) no decide nada de esto, así que
// se puede testear sin navegador.
//
// El copy es EXACTO el del prototipo (`Mi Cursada.dc.html:1908-1919`): no se
// parafrasea ni se "corrige" a tuteo.

/** Ícono del tile de cada paso; el componente lo mapea a Lucide. */
export type IconoPaso = 'calendario' | 'documento' | 'grafo';

export type FeaturePaso = {
  /** Texto de la fila. */
  texto: string;
  /** Color del dot de 7px. */
  color: string;
  /** Tag mono de la derecha, en mayúsculas. */
  tag: string;
};

export type PasoOnboarding = {
  /** Fondo del tile de 58×58. */
  tile: string;
  icono: IconoPaso;
  titulo: string;
  descripcion: string;
  /** Siempre tres: el diseño de la card cuenta con ese alto. */
  features: [FeaturePaso, FeaturePaso, FeaturePaso];
};

export const PASOS_ONBOARDING: readonly [PasoOnboarding, PasoOnboarding, PasoOnboarding] = [
  {
    tile: '#fbbf24',
    icono: 'calendario',
    titulo: 'Tu semana, de un vistazo',
    descripcion:
      'En Hoy ves tu próxima clase con cuenta regresiva, las clases del día y los avisos que vencen. En Semana, tu grilla de lunes a sábado.',
    features: [
      { texto: 'Próxima clase con estado en vivo', color: '#fbbf24', tag: 'HOY' },
      { texto: 'Día actual resaltado en la semana', color: '#38bdf8', tag: 'SEMANA' },
      { texto: 'Avisos: hoy en ámbar, vencidos en rojo', color: '#fb7185', tag: 'AVISOS' },
    ],
  },
  {
    tile: '#38bdf8',
    icono: 'documento',
    titulo: 'Notas como en Notion',
    descripcion:
      'Cada materia tiene su documento: escribí con /comandos (títulos, to-dos, links, páginas), referenciá archivos y materias con @, y organizá las cards en un tablero kanban.',
    features: [
      { texto: '/todo crea checkboxes · Enter encadena', color: '#34d399', tag: '/ COMANDO' },
      { texto: '@Guía 5 (PDF) referencia archivos', color: '#a78bfa', tag: '@ REF' },
      { texto: 'Por hacer · En proceso · Listo', color: '#38bdf8', tag: 'TABLERO' },
    ],
  },
  {
    tile: '#a78bfa',
    icono: 'grafo',
    titulo: 'Todo conectado',
    descripcion:
      'Los avisos se vinculan a tus notas, el Grafo muestra toda tu cursada como red interactiva, y el scraper del aula virtual trae datos solo.',
    features: [
      { texto: 'Crear aviso desde una nota', color: '#fb7185', tag: 'AVISO' },
      { texto: 'Grafo estilo red: hover y click', color: '#a78bfa', tag: 'GRAFO' },
      { texto: 'Sincronizado con el aula virtual', color: '#34d399', tag: 'SYNC' },
    ],
  },
] as const;

/** Los tres ítems del checklist del loader, en orden. */
export const TAREAS_ONBOARDING = [
  'Sincronizando con el aula virtual',
  'Cargando materias y horarios',
  'Preparando notas y tablero',
] as const;

/**
 * Timeline del loader en ms desde que se toca `Empezar`/`Saltar`
 * (`Mi Cursada.dc.html:1398-1403`). El índice es "qué tarea está activa":
 * `MS_TAREA[0]` la primera, y `MS_TAREA[3]` es cuando ya están las tres hechas.
 */
export const MS_TAREA = [0, 950, 1850, 2700] as const;

/** Cuándo se cierra el overlay y entra la app. */
export const MS_CIERRE_ONBOARDING = 3400;

export type EstadoTarea = 'hecha' | 'activa' | 'pendiente';

/**
 * Estado de la tarea `indice` cuando la tarea en curso es `actual`.
 *
 * `actual` es el índice de la que está corriendo; `TAREAS_ONBOARDING.length`
 * (3) significa "ya terminaron todas". Un `actual` negativo es "el loader
 * todavía no arrancó": todo pendiente.
 */
export function estadoTarea(indice: number, actual: number): EstadoTarea {
  if (actual > indice) return 'hecha';
  if (actual === indice) return 'activa';
  return 'pendiente';
}

/** Opacidad de la fila: la pendiente se atenúa, la activa y la hecha no. */
export const opacidadTarea = (estado: EstadoTarea): number =>
  estado === 'pendiente' ? 0.45 : 1;

/** Label del botón primario: `Siguiente` salvo en el último paso. */
export const labelBotonOnboarding = (paso: number): string =>
  paso >= PASOS_ONBOARDING.length - 1 ? 'Empezar' : 'Siguiente';

/** Kicker de la fila de arriba: `Paso 1 de 3`. */
export const kickerOnboarding = (paso: number): string =>
  `Paso ${paso + 1} de ${PASOS_ONBOARDING.length}`;

// ---------------------------------------------------------------------------
// Qué capa se muestra al entrar
// ---------------------------------------------------------------------------

/**
 * `onboarding` = la presentación con su loader. `onboarding-sin-loader` = la
 * presentación pero saliendo derecho, sin el checklist. `consentimiento` = el
 * aviso bloqueante. `null` = se entra directo a la app.
 */
export type CapaDeEntrada = 'onboarding' | 'onboarding-sin-loader' | 'consentimiento' | null;

export type EstadoDeEntrada = {
  /** Si existe la fila de `perfiles` (se crea al entrar, antes de consentir). */
  tienePerfil: boolean;
  onboardingEn: string | null;
  consentimientoEn: string | null;
  /** En modo local no hay consentimiento que pedir. */
  conSupabase: boolean;
};

/**
 * Cuál de las dos capas va arriba, y nunca las dos a la vez: dos overlays con
 * blur uno encima del otro no se leen.
 *
 * **El onboarding va PRIMERO, antes del consentimiento** (pedido del 19/08):
 * tiene más sentido contar qué hace la app y después pedir permiso que al
 * revés. Pero en ese caso el loader se saltea: su checklist dice
 * "Sincronizando con el aula virtual" y `sincronizarAhora` exige consentimiento
 * (`app/actions-moodle.ts`), así que ahí todavía no sincronizó nada. El sync
 * real lo dispara `aceptarConsentimiento`, que tiene su propio feedback.
 *
 * Sin fila de perfil el onboarding no se muestra: no habría dónde escribir el
 * flag y volvería a salir en cada request.
 */
export function capaDeEntrada(e: EstadoDeEntrada): CapaDeEntrada {
  const faltaConsentir = e.conSupabase && !e.consentimientoEn;
  const faltaOnboarding = e.tienePerfil && !e.onboardingEn;

  if (faltaOnboarding) return faltaConsentir ? 'onboarding-sin-loader' : 'onboarding';
  if (faltaConsentir) return 'consentimiento';
  return null;
}
