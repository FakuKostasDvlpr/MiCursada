'use server';

// Server Actions de Mi Cursada.
// Todas devuelven { ok: true } | { ok: false, error } con errores cortos en castellano.
// Todas arrancan con `hayAcceso()`: una Server Action es un POST que se puede
// llamar sin pasar por la página, así que el layout de (app) no alcanza como
// única puerta — cada action revisa la sesión por su cuenta.
// Estrategia de revalidación consistente: revalidatePath('/', 'layout') — cubre
// '/', '/semana', '/materias', '/materias/[id]' y '/avisos' de una.
//
// PERSISTENCIA: los datos del aula virtual salen de la API de Moodle y viven en
// el snapshot (datos/aula-virtual.json, que el sync regenera). Lo que edita el
// usuario —y que la API NO expone: horarios, profe/aula/color, notas, avisos
// propios, perfil— va a overlays JSON aparte que el sync nunca pisa.
// Ver lib/datos-locales.ts.

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  actualizarBloqueLocal,
  crearArchivoLocal,
  crearAvisoLocal,
  crearBloqueLocal,
  eliminarArchivoLocal,
  eliminarAvisoLocal,
  eliminarBloqueLocal,
  escribirAvatarLocal,
  escribirEstadoAviso,
  escribirHorariosLocales,
  escribirMateriaExtra,
  escribirPerfilLocal,
  extensionAvatar,
  getDatosLocales,
  reordenarBloquesLocales,
} from '@/lib/datos-locales';
import { tituloDesdeNota } from '@/lib/aviso-nota';
import { textoPlano } from '@/lib/referencias';
import { hayAcceso } from '@/lib/sesion-actual';
import { normalizarUrl } from '@/lib/urls';
import {
  COLORES_MATERIA,
  ESTADOS_BLOQUE,
  TIPOS_BLOQUE,
  TIPOS_REF,
  esManual,
  type FormatoBloque,
  type RefBloque,
} from '@/lib/types';

export type ResultadoAction = { ok: true } | { ok: false; error: string };

const ERROR_SESION = 'No pudimos verificar tu sesión. Entrá de nuevo.';
const ERROR_GUARDAR = 'No se pudo guardar. Probá de nuevo.';
const ERROR_NO_EXISTE = 'Eso ya no existe.';
const ERROR_DATOS = 'Datos inválidos.';
const ERROR_ARCHIVO_MOODLE = 'Ese archivo viene del aula virtual.';
const ERROR_AVISO_MOODLE = 'Ese aviso viene del aula virtual.';

function revalidarTodo() {
  revalidatePath('/', 'layout');
}

// ---------------------------------------------------------------------------
// Materias
// Las materias llegan del sync con el aula virtual (Moodle) — no se crean ni
// se eliminan desde acá. Lo único editable es lo que Moodle no trae:
// profe, aula, color y horarios (0 o más). El nombre queda readonly.
// ---------------------------------------------------------------------------

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const horarioSchema = z.object({
  dia: z.number().int().min(1).max(6),
  inicio: z.string().regex(HHMM),
  fin: z.string().regex(HHMM),
});

const materiaSchema = z.object({
  profe: z.string().trim(),
  aula: z.string().trim(),
  color: z.enum(COLORES_MATERIA),
  // Una materia recién sincronizada puede no tener horarios todavía: 0 es válido.
  horarios: z.array(horarioSchema),
});

export type MateriaInput = z.input<typeof materiaSchema>;

/** Valida horarios y devuelve el error de copy exacto si algo no cierra. */
function validarHorarios(
  horarios: unknown
): { ok: true; horarios: z.infer<typeof horarioSchema>[] } | { ok: false; error: string } {
  const parsed = z.array(horarioSchema).safeParse(horarios);
  if (!parsed.success) return { ok: false, error: ERROR_DATOS };
  if (parsed.data.some((h) => h.fin <= h.inicio)) {
    return { ok: false, error: 'El fin tiene que ser después del inicio.' };
  }
  return { ok: true, horarios: parsed.data };
}

/** Guarda los horarios de una materia en datos/horarios.json. */
export async function guardarHorariosLocales(
  materiaId: string,
  horarios: MateriaInput['horarios']
): Promise<ResultadoAction> {
  if (!(await hayAcceso())) return { ok: false, error: ERROR_SESION };

  const validado = validarHorarios(horarios);
  if (!validado.ok) return { ok: false, error: validado.error };

  try {
    await escribirHorariosLocales(materiaId, validado.horarios);
  } catch (e) {
    console.error('guardarHorariosLocales:', e);
    return { ok: false, error: ERROR_GUARDAR };
  }
  revalidarTodo();
  return { ok: true };
}

/**
 * Profe/aula/color van a datos/materias-extra.json y los horarios a
 * datos/horarios.json. El nombre sigue siendo del snapshot del aula virtual.
 */
export async function actualizarMateria(
  id: string,
  input: MateriaInput
): Promise<ResultadoAction> {
  if (!(await hayAcceso())) return { ok: false, error: ERROR_SESION };

  const parsed = materiaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: ERROR_DATOS };
  // 'HH:MM' compara bien lexicográficamente.
  if (parsed.data.horarios.some((h) => h.fin <= h.inicio)) {
    return { ok: false, error: 'El fin tiene que ser después del inicio.' };
  }

  try {
    await escribirMateriaExtra(id, {
      profe: parsed.data.profe,
      aula: parsed.data.aula,
      color: parsed.data.color,
    });
    await escribirHorariosLocales(id, parsed.data.horarios);
  } catch (e) {
    console.error('actualizarMateria:', e);
    return { ok: false, error: ERROR_GUARDAR };
  }
  revalidarTodo();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Archivos
// ---------------------------------------------------------------------------

const archivoSchema = z.object({
  nombre: z.string().trim().min(1),
  url: z.string().trim().min(1),
});

export async function crearArchivo(
  materiaId: string,
  input: { nombre: string; url: string }
): Promise<ResultadoAction> {
  if (!(await hayAcceso())) return { ok: false, error: ERROR_SESION };

  const parsed = archivoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Poné un nombre y un link.' };

  try {
    await crearArchivoLocal(materiaId, {
      nombre: parsed.data.nombre,
      url: normalizarUrl(parsed.data.url),
    });
  } catch (e) {
    console.error('crearArchivo:', e);
    return { ok: false, error: ERROR_GUARDAR };
  }
  revalidarTodo();
  return { ok: true };
}

export async function eliminarArchivo(id: string): Promise<ResultadoAction> {
  if (!(await hayAcceso())) return { ok: false, error: ERROR_SESION };

  if (!esManual(id)) return { ok: false, error: ERROR_ARCHIVO_MOODLE };

  try {
    const borrado = await eliminarArchivoLocal(id);
    if (!borrado) return { ok: false, error: ERROR_NO_EXISTE };
  } catch (e) {
    console.error('eliminarArchivo:', e);
    return { ok: false, error: ERROR_GUARDAR };
  }
  revalidarTodo();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------

/** 'YYYY-MM-DD' que además es una fecha real (round-trip por Date UTC). */
const fechaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((f) => {
    const d = new Date(`${f}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f;
  });

const avisoSchema = z.object({
  titulo: z.string().trim().min(1),
  // El select de "General" manda '' → lo tratamos como null.
  // Cualquier string no vacío: los ids de materia son del aula virtual
  // ("curso:2756"); si viene basura simplemente no matchea ninguna materia.
  materiaId: z
    .union([z.string().trim().min(1), z.literal(''), z.null()])
    .transform((v) => v || null),
  fecha: fechaSchema,
});

export async function crearAviso(input: {
  titulo: string;
  materiaId: string | null;
  fecha: string;
}): Promise<ResultadoAction> {
  if (!(await hayAcceso())) return { ok: false, error: ERROR_SESION };

  const parsed = avisoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Poné un título y una fecha.' };

  try {
    await crearAvisoLocal({
      titulo: parsed.data.titulo,
      materiaId: parsed.data.materiaId,
      fecha: parsed.data.fecha,
    });
  } catch (e) {
    console.error('crearAviso:', e);
    return { ok: false, error: ERROR_GUARDAR };
  }
  revalidarTodo();
  return { ok: true };
}

const avisoDesdeNotaSchema = z.object({
  materiaId: z.string().trim().min(1),
  bloqueId: z.string().trim().min(1),
  fecha: fechaSchema,
});

/**
 * Crea un aviso ligado a una nota (el botón "Crear aviso" del modal de card).
 * El título sale del texto del bloque; si ya hay un aviso para esa nota no
 * crea otro (el prototipo permite duplicados invisibles con el doble tap).
 */
export async function crearAvisoDesdeNota(input: {
  materiaId: string;
  bloqueId: string;
  fecha: string;
}): Promise<ResultadoAction> {
  if (!(await hayAcceso())) return { ok: false, error: ERROR_SESION };

  const parsed = avisoDesdeNotaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Poné una fecha para el aviso.' };

  try {
    const { materias, avisos } = await getDatosLocales();

    // Ya existe: no se duplica y no es un error para quien lo tocó.
    if (avisos.some((a) => a.notaId === parsed.data.bloqueId)) return { ok: true };

    const materia = materias.find((m) => m.id === parsed.data.materiaId);
    const bloque = materia?.bloques.find((b) => b.id === parsed.data.bloqueId);
    if (!bloque) return { ok: false, error: ERROR_NO_EXISTE };

    await crearAvisoLocal({
      titulo: tituloDesdeNota(textoPlano(bloque.texto)),
      materiaId: parsed.data.materiaId,
      fecha: parsed.data.fecha,
      notaId: bloque.id,
    });
  } catch (e) {
    console.error('crearAvisoDesdeNota:', e);
    return { ok: false, error: ERROR_GUARDAR };
  }
  revalidarTodo();
  return { ok: true };
}

/** El "hecho" vive en datos/avisos-estado.json y sobrevive al reload. */
export async function toggleAviso(id: string, hecho: boolean): Promise<ResultadoAction> {
  if (!(await hayAcceso())) return { ok: false, error: ERROR_SESION };

  try {
    await escribirEstadoAviso(id, hecho);
  } catch (e) {
    console.error('toggleAviso:', e);
    return { ok: false, error: ERROR_GUARDAR };
  }
  revalidarTodo();
  return { ok: true };
}

export async function eliminarAviso(id: string): Promise<ResultadoAction> {
  if (!(await hayAcceso())) return { ok: false, error: ERROR_SESION };

  if (!esManual(id)) return { ok: false, error: ERROR_AVISO_MOODLE };

  try {
    const borrado = await eliminarAvisoLocal(id);
    if (!borrado) return { ok: false, error: ERROR_NO_EXISTE };
  } catch (e) {
    console.error('eliminarAviso:', e);
    return { ok: false, error: ERROR_GUARDAR };
  }
  revalidarTodo();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------------

const perfilSchema = z.object({
  nombre: z.string().trim().min(1),
  instituto: z.string().trim(),
  // undefined = no tocar la foto; string = nueva URL del avatar.
  avatarUrl: z.string().trim().min(1).optional(),
});

/** Máximo de la foto de perfil: va al disco, en datos/avatar.<ext>. */
const MAX_AVATAR = 5 * 1024 * 1024;

const ERROR_FOTO = 'No se pudo subir la foto. Probá de nuevo.';
const ERROR_FOTO_TIPO = 'Elegí una imagen.';
const ERROR_FOTO_PESO = 'La foto pesa demasiado (máx 5 MB).';

export type ResultadoFoto = { ok: true; url: string } | { ok: false; error: string };

/**
 * Guarda la foto de perfil en datos/avatar.<ext> y devuelve la URL que la
 * sirve (app/api/avatar/route.ts), con ?v= para bustear la caché.
 */
export async function guardarAvatarLocal(formData: FormData): Promise<ResultadoFoto> {
  if (!(await hayAcceso())) return { ok: false, error: ERROR_SESION };

  const file = formData.get('foto');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: ERROR_FOTO_TIPO };

  const ext = extensionAvatar(file.type || '');
  if (!file.type.startsWith('image/') || !ext) return { ok: false, error: ERROR_FOTO_TIPO };
  if (file.size > MAX_AVATAR) return { ok: false, error: ERROR_FOTO_PESO };

  try {
    await escribirAvatarLocal(new Uint8Array(await file.arrayBuffer()), ext);
  } catch (e) {
    console.error('guardarAvatarLocal:', e);
    return { ok: false, error: ERROR_FOTO };
  }
  revalidarTodo();
  return { ok: true, url: `/api/avatar?v=${Date.now()}` };
}

export async function guardarPerfil(input: {
  nombre: string;
  instituto: string;
  avatarUrl?: string;
}): Promise<ResultadoAction> {
  if (!(await hayAcceso())) return { ok: false, error: ERROR_SESION };

  const parsed = perfilSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Poné tu nombre así te saludamos.' };

  try {
    await escribirPerfilLocal({
      nombre: parsed.data.nombre,
      instituto: parsed.data.instituto,
      avatarUrl: parsed.data.avatarUrl,
    });
  } catch (e) {
    console.error('guardarPerfil:', e);
    return { ok: false, error: ERROR_GUARDAR };
  }
  revalidarTodo();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Bloques (editor de notas)
// ---------------------------------------------------------------------------

const refBloqueInputSchema = z.object({
  tipo: z.enum(TIPOS_REF),
  id: z.string().min(1),
});

const formatoInputSchema = z.object({
  b: z.boolean().optional(),
  i: z.boolean().optional(),
  u: z.boolean().optional(),
  hl: z.boolean().optional(),
});

const bloqueNuevoSchema = z.object({
  tipo: z.enum(TIPOS_BLOQUE),
  texto: z.string().optional(),
  url: z.string().optional(),
  /** Columna del tablero en la que nace (el "+ Nueva card" de una columna). */
  estado: z.enum(ESTADOS_BLOQUE).optional(),
  /** Cita adjuntada con `@` en el composer. */
  ref: refBloqueInputSchema.nullable().optional(),
});

export async function crearBloque(
  materiaId: string,
  input: {
    tipo: (typeof TIPOS_BLOQUE)[number];
    texto?: string;
    url?: string;
    estado?: (typeof ESTADOS_BLOQUE)[number];
    ref?: RefBloque | null;
  }
): Promise<ResultadoAction> {
  if (!(await hayAcceso())) return { ok: false, error: ERROR_SESION };

  const parsed = bloqueNuevoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: ERROR_DATOS };

  try {
    await crearBloqueLocal(materiaId, {
      tipo: parsed.data.tipo,
      texto: parsed.data.texto ?? '',
      url: parsed.data.url ? normalizarUrl(parsed.data.url) : '',
      ...(parsed.data.estado ? { estado: parsed.data.estado } : {}),
      ...(parsed.data.ref ? { ref: parsed.data.ref } : {}),
    });
  } catch (e) {
    console.error('crearBloque:', e);
    return { ok: false, error: ERROR_GUARDAR };
  }
  revalidarTodo();
  return { ok: true };
}

const bloquePatchSchema = z.object({
  /** El menú "Convertir en" del modal de card cambia el tipo de un bloque ya escrito. */
  tipo: z.enum(TIPOS_BLOQUE).optional(),
  texto: z.string().optional(),
  url: z.string().optional(),
  estado: z.enum(ESTADOS_BLOQUE).optional(),
  hecho: z.boolean().optional(),
  fmt: formatoInputSchema.optional(),
  /** `null` explícito = quitar la referencia. */
  ref: refBloqueInputSchema.nullable().optional(),
});

export type BloquePatch = z.input<typeof bloquePatchSchema>;

export async function actualizarBloque(id: string, patch: BloquePatch): Promise<ResultadoAction> {
  if (!(await hayAcceso())) return { ok: false, error: ERROR_SESION };

  const parsed = bloquePatchSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: ERROR_DATOS };

  const cambios: {
    tipo?: (typeof TIPOS_BLOQUE)[number];
    texto?: string;
    url?: string;
    estado?: (typeof ESTADOS_BLOQUE)[number];
    hecho?: boolean;
    fmt?: FormatoBloque;
    ref?: RefBloque | null;
  } = {};
  if (parsed.data.tipo !== undefined) cambios.tipo = parsed.data.tipo;
  if (parsed.data.texto !== undefined) cambios.texto = parsed.data.texto;
  if (parsed.data.url !== undefined)
    cambios.url = parsed.data.url ? normalizarUrl(parsed.data.url) : '';
  if (parsed.data.estado !== undefined) cambios.estado = parsed.data.estado;
  if (parsed.data.hecho !== undefined) cambios.hecho = parsed.data.hecho;
  if (parsed.data.fmt !== undefined) cambios.fmt = parsed.data.fmt;
  // `null` es un valor válido acá: significa "quitá la referencia".
  if (parsed.data.ref !== undefined) cambios.ref = parsed.data.ref;
  if (Object.keys(cambios).length === 0) return { ok: true };

  try {
    const actualizado = await actualizarBloqueLocal(id, cambios);
    if (!actualizado) return { ok: false, error: ERROR_NO_EXISTE };
  } catch (e) {
    console.error('actualizarBloque:', e);
    return { ok: false, error: ERROR_GUARDAR };
  }
  revalidarTodo();
  return { ok: true };
}

export async function eliminarBloque(id: string): Promise<ResultadoAction> {
  if (!(await hayAcceso())) return { ok: false, error: ERROR_SESION };

  try {
    const borrado = await eliminarBloqueLocal(id);
    if (!borrado) return { ok: false, error: ERROR_NO_EXISTE };
  } catch (e) {
    console.error('eliminarBloque:', e);
    return { ok: false, error: ERROR_GUARDAR };
  }
  revalidarTodo();
  return { ok: true };
}

/** Los ids de los bloques propios son "manual:<uuid>", no uuids pelados. */
const reordenarSchema = z.array(
  z.object({
    id: z.string().min(1),
    orden: z.number().int(),
  })
);

export async function reordenarBloques(
  items: { id: string; orden: number }[]
): Promise<ResultadoAction> {
  if (!(await hayAcceso())) return { ok: false, error: ERROR_SESION };

  const parsed = reordenarSchema.safeParse(items);
  if (!parsed.success) return { ok: false, error: ERROR_DATOS };
  if (parsed.data.length === 0) return { ok: true };

  try {
    await reordenarBloquesLocales(parsed.data);
  } catch (e) {
    console.error('reordenarBloques:', e);
    return { ok: false, error: ERROR_GUARDAR };
  }
  revalidarTodo();
  return { ok: true };
}
