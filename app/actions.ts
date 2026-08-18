'use server';

// Fase 3 — Server Actions de Mi Cursada.
// Todas devuelven { ok: true } | { ok: false, error } con errores cortos en castellano.
// Todas arrancan con `hayAcceso()`: una Server Action es un POST que se puede
// llamar sin pasar por la página, así que el layout de (app) no alcanza como
// única puerta — cada action revisa la sesión por su cuenta.
// Estrategia de revalidación consistente: revalidatePath('/', 'layout') — cubre
// '/', '/semana', '/materias', '/materias/[id]' y '/avisos' de una.

import type { User } from '@supabase/supabase-js';
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
import { supabaseConfigurado } from '@/lib/supabase/configurado';
import { createClient } from '@/lib/supabase/server';
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
const ERROR_SIN_CONFIG = 'Falta configurar Supabase (.env.local).';
const ERROR_CONSENTIMIENTO = 'Primero tenés que aceptar cómo se guardan tus datos.';
const ERROR_GUARDAR = 'No se pudo guardar. Probá de nuevo.';
const ERROR_NO_EXISTE = 'Eso ya no existe.';
const ERROR_DATOS = 'Datos inválidos.';
const ERROR_ARCHIVO_MOODLE = 'Ese archivo viene del aula virtual.';
const ERROR_AVISO_MOODLE = 'Ese aviso viene del aula virtual.';

function revalidarTodo() {
  revalidatePath('/', 'layout');
}

type ConUsuario =
  | { supabase: Awaited<ReturnType<typeof createClient>>; user: User; error?: undefined }
  | { supabase: null; user: null; error: string };

/**
 * Crea el server client y verifica que haya usuario autenticado con el
 * consentimiento del primer ingreso ya aceptado (una Server Action es un
 * POST que no pasa por el layout de (app), así que su redirect no alcanza
 * para cerrar esta puerta — hay que chequearla acá).
 * Si Supabase no está configurado (sin .env.local), corta antes del auth check.
 */
async function conUsuario(): Promise<ConUsuario> {
  if (!supabaseConfigurado()) return { supabase: null, user: null, error: ERROR_SIN_CONFIG };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase: null, user: null, error: ERROR_SESION };
  const { data: perfil } = await supabase
    .from('perfiles')
    .select('consentimiento_en')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!perfil?.consentimiento_en) {
    return { supabase: null, user: null, error: ERROR_CONSENTIMIENTO };
  }
  return { supabase, user };
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

/**
 * Modo sin Supabase: guarda los horarios de una materia en datos/horarios.json.
 */
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
 * Modo sin Supabase: profe/aula/color van a datos/materias-extra.json y los
 * horarios a datos/horarios.json. El nombre sigue siendo del snapshot.
 */
async function actualizarMateriaLocal(
  id: string,
  input: MateriaInput
): Promise<ResultadoAction> {
  const parsed = materiaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: ERROR_DATOS };
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
    console.error('actualizarMateria (local):', e);
    return { ok: false, error: ERROR_GUARDAR };
  }
  revalidarTodo();
  return { ok: true };
}

export async function actualizarMateria(
  id: string,
  input: MateriaInput
): Promise<ResultadoAction> {
  if (!(await hayAcceso())) return { ok: false, error: ERROR_SESION };

  if (!supabaseConfigurado()) return actualizarMateriaLocal(id, input);

  const sesion = await conUsuario();
  if (!sesion.user) return { ok: false, error: sesion.error };
  const { supabase } = sesion;

  const parsed = materiaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: ERROR_DATOS };
  }
  // 'HH:MM' compara bien lexicográficamente.
  if (parsed.data.horarios.some((h) => h.fin <= h.inicio)) {
    return { ok: false, error: 'El fin tiene que ser después del inicio.' };
  }
  const { data: datos } = parsed;

  const { error } = await supabase.rpc('editar_materia', {
    p_curso_id: id,
    p_profe: datos.profe,
    p_aula: datos.aula,
    p_color: datos.color,
    p_horarios: datos.horarios,
  });

  if (error) {
    console.error('actualizarMateria:', error);
    if (error.code === 'P0002') {
      return { ok: false, error: 'Esa materia ya no existe.' };
    }
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

  if (!supabaseConfigurado()) {
    const parsedLocal = archivoSchema.safeParse(input);
    if (!parsedLocal.success) return { ok: false, error: 'Poné un nombre y un link.' };
    try {
      await crearArchivoLocal(materiaId, {
        nombre: parsedLocal.data.nombre,
        url: normalizarUrl(parsedLocal.data.url),
      });
    } catch (e) {
      console.error('crearArchivo (local):', e);
      return { ok: false, error: ERROR_GUARDAR };
    }
    revalidarTodo();
    return { ok: true };
  }

  const sesion = await conUsuario();
  if (!sesion.user) return { ok: false, error: sesion.error };
  const { supabase } = sesion;

  const parsed = archivoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Poné un nombre y un link.' };
  }

  const { error } = await supabase.from('archivos_manuales').insert({
    curso_id: materiaId,
    nombre: parsed.data.nombre,
    url: normalizarUrl(parsed.data.url),
  });

  if (error) {
    console.error('crearArchivo:', error);
    return { ok: false, error: ERROR_GUARDAR };
  }
  revalidarTodo();
  return { ok: true };
}

export async function eliminarArchivo(id: string): Promise<ResultadoAction> {
  if (!(await hayAcceso())) return { ok: false, error: ERROR_SESION };

  if (!supabaseConfigurado()) {
    if (!esManual(id)) return { ok: false, error: ERROR_ARCHIVO_MOODLE };
    try {
      const borrado = await eliminarArchivoLocal(id);
      if (!borrado) return { ok: false, error: ERROR_NO_EXISTE };
    } catch (e) {
      console.error('eliminarArchivo (local):', e);
      return { ok: false, error: ERROR_GUARDAR };
    }
    revalidarTodo();
    return { ok: true };
  }

  if (!esManual(id)) return { ok: false, error: ERROR_ARCHIVO_MOODLE };

  const sesion = await conUsuario();
  if (!sesion.user) return { ok: false, error: sesion.error };
  const { supabase } = sesion;

  const { data, error } = await supabase
    .from('archivos_manuales')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) {
    console.error('eliminarArchivo:', error);
    return { ok: false, error: ERROR_GUARDAR };
  }
  if (!data || data.length === 0) return { ok: false, error: ERROR_NO_EXISTE };
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
  // Un solo schema para los dos modos: cualquier string no vacío. En Supabase el
  // id es uuid y en local es "curso:2756"; si viene basura la rechaza la FK de
  // la base (modo Supabase) o simplemente no matchea ninguna materia (local).
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

  if (!supabaseConfigurado()) {
    const parsedLocal = avisoSchema.safeParse(input);
    if (!parsedLocal.success) return { ok: false, error: 'Poné un título y una fecha.' };
    try {
      await crearAvisoLocal({
        titulo: parsedLocal.data.titulo,
        materiaId: parsedLocal.data.materiaId,
        fecha: parsedLocal.data.fecha,
      });
    } catch (e) {
      console.error('crearAviso (local):', e);
      return { ok: false, error: ERROR_GUARDAR };
    }
    revalidarTodo();
    return { ok: true };
  }

  const sesion = await conUsuario();
  if (!sesion.user) return { ok: false, error: sesion.error };
  const { supabase } = sesion;

  const parsed = avisoSchema.safeParse(input);
  if (!parsed.success) {
    const esDeTituloOFecha = parsed.error.issues.every(
      (issue) => issue.path[0] === 'titulo' || issue.path[0] === 'fecha'
    );
    return {
      ok: false,
      error: esDeTituloOFecha ? 'Poné un título y una fecha.' : ERROR_GUARDAR,
    };
  }

  const { error } = await supabase.from('avisos_manuales').insert({
    titulo: parsed.data.titulo,
    curso_id: parsed.data.materiaId,
    fecha: parsed.data.fecha,
  });

  if (error) {
    console.error('crearAviso:', error);
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

  if (!supabaseConfigurado()) {
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
      console.error('crearAvisoDesdeNota (local):', e);
      return { ok: false, error: ERROR_GUARDAR };
    }
    revalidarTodo();
    return { ok: true };
  }

  const sesion = await conUsuario();
  if (!sesion.user) return { ok: false, error: sesion.error };
  const { supabase } = sesion;

  // Ya existe un aviso para esta nota: no se duplica.
  const { data: existente, error: errorBusqueda } = await supabase
    .from('avisos_manuales')
    .select('id')
    .eq('nota_id', parsed.data.bloqueId)
    .maybeSingle();
  if (errorBusqueda) {
    console.error('crearAvisoDesdeNota (buscar):', errorBusqueda);
    return { ok: false, error: ERROR_GUARDAR };
  }
  if (existente) return { ok: true };

  // El título sale del texto del bloque (RLS garantiza que es de esta persona).
  const { data: bloque, error: errorBloque } = await supabase
    .from('bloques')
    .select('texto')
    .eq('id', parsed.data.bloqueId)
    .maybeSingle();
  if (errorBloque) {
    console.error('crearAvisoDesdeNota (bloque):', errorBloque);
    return { ok: false, error: ERROR_GUARDAR };
  }
  if (!bloque) return { ok: false, error: ERROR_NO_EXISTE };

  const { error } = await supabase.from('avisos_manuales').insert({
    titulo: tituloDesdeNota(textoPlano((bloque as { texto: string }).texto)),
    curso_id: parsed.data.materiaId,
    fecha: parsed.data.fecha,
    nota_id: parsed.data.bloqueId,
  });
  if (error) {
    console.error('crearAvisoDesdeNota:', error);
    return { ok: false, error: ERROR_GUARDAR };
  }
  revalidarTodo();
  return { ok: true };
}

export async function toggleAviso(id: string, hecho: boolean): Promise<ResultadoAction> {
  if (!(await hayAcceso())) return { ok: false, error: ERROR_SESION };

  // Sin Supabase: el "hecho" vive en datos/avisos-estado.json y sobrevive al reload.
  if (!supabaseConfigurado()) {
    try {
      await escribirEstadoAviso(id, hecho);
    } catch (e) {
      console.error('toggleAviso (local):', e);
      return { ok: false, error: ERROR_GUARDAR };
    }
    revalidarTodo();
    return { ok: true };
  }

  const sesion = await conUsuario();
  if (!sesion.user) return { ok: false, error: sesion.error };
  const { supabase } = sesion;

  if (esManual(id)) {
    const { error } = await supabase
      .from('avisos_manuales')
      .update({ hecho })
      .eq('id', id);
    if (error) {
      console.error('toggleAviso:', error);
      return { ok: false, error: ERROR_GUARDAR };
    }
  } else {
    const { error } = await supabase
      .from('avisos_estado')
      .upsert({ aviso_id: id, hecho }, { onConflict: 'user_id,aviso_id' });
    if (error) {
      console.error('toggleAviso:', error);
      return { ok: false, error: ERROR_GUARDAR };
    }
  }
  revalidarTodo();
  return { ok: true };
}

export async function eliminarAviso(id: string): Promise<ResultadoAction> {
  if (!(await hayAcceso())) return { ok: false, error: ERROR_SESION };

  if (!supabaseConfigurado()) {
    if (!esManual(id)) return { ok: false, error: ERROR_AVISO_MOODLE };
    try {
      const borrado = await eliminarAvisoLocal(id);
      if (!borrado) return { ok: false, error: ERROR_NO_EXISTE };
    } catch (e) {
      console.error('eliminarAviso (local):', e);
      return { ok: false, error: ERROR_GUARDAR };
    }
    revalidarTodo();
    return { ok: true };
  }

  if (!esManual(id)) return { ok: false, error: ERROR_AVISO_MOODLE };

  const sesion = await conUsuario();
  if (!sesion.user) return { ok: false, error: sesion.error };
  const { supabase } = sesion;

  const { data, error } = await supabase
    .from('avisos_manuales')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) {
    console.error('eliminarAviso:', error);
    return { ok: false, error: ERROR_GUARDAR };
  }
  if (!data || data.length === 0) return { ok: false, error: ERROR_NO_EXISTE };
  revalidarTodo();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------------

const perfilSchema = z.object({
  nombre: z.string().trim().min(1),
  instituto: z.string().trim(),
  // undefined = no tocar la foto; string = nueva URL del avatar en Storage.
  avatarUrl: z.string().trim().min(1).optional(),
  // undefined = no tocar la carrera (constante para el modo local; editable en Supabase).
  carrera: z.string().trim().max(80).optional(),
});

/** Máximo de la foto de perfil en modo local (sin Storage, va al disco). */
const MAX_AVATAR = 5 * 1024 * 1024;

const ERROR_FOTO = 'No se pudo subir la foto. Probá de nuevo.';
const ERROR_FOTO_TIPO = 'Elegí una imagen.';
const ERROR_FOTO_PESO = 'La foto pesa demasiado (máx 5 MB).';

export type ResultadoFoto = { ok: true; url: string } | { ok: false; error: string };

/**
 * Modo sin Supabase: guarda la foto de perfil en datos/avatar.<ext> y devuelve
 * la URL que la sirve (app/api/avatar/route.ts), con ?v= para bustear la caché.
 */
export async function guardarAvatarLocal(formData: FormData): Promise<ResultadoFoto> {
  if (!(await hayAcceso())) return { ok: false, error: ERROR_SESION };

  const file = formData.get('foto');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: ERROR_FOTO_TIPO };

  const ext = extensionAvatar(file.type || '');
  if (!file.type.startsWith('image/') || !ext) return { ok: false, error: ERROR_FOTO_TIPO };
  if (file.size > MAX_AVATAR) return { ok: false, error: ERROR_FOTO_PESO };

  if (!supabaseConfigurado()) {
    try {
      await escribirAvatarLocal(new Uint8Array(await file.arrayBuffer()), ext);
    } catch (e) {
      console.error('guardarAvatarLocal:', e);
      return { ok: false, error: ERROR_FOTO };
    }
    revalidarTodo();
    return { ok: true, url: `/api/avatar?v=${Date.now()}` };
  }

  const sesion = await conUsuario();
  if (!sesion.user) return { ok: false, error: sesion.error };
  const { supabase, user } = sesion;

  const { error: errorSubida } = await supabase.storage
    .from('avatares')
    .upload(`${user.id}.${ext}`, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: true,
    });

  if (errorSubida) {
    console.error('guardarAvatarLocal:', errorSubida);
    return { ok: false, error: ERROR_FOTO };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('avatares').getPublicUrl(`${user.id}.${ext}`);
  const url = `${publicUrl}?v=${Date.now()}`;

  const { error } = await supabase
    .from('perfiles')
    .update({ avatar_url: url })
    .eq('user_id', user.id);

  if (error) {
    console.error('guardarAvatarLocal:', error);
    return { ok: false, error: ERROR_FOTO };
  }

  revalidarTodo();
  return { ok: true, url };
}

export async function guardarPerfil(input: {
  nombre: string;
  instituto: string;
  avatarUrl?: string;
  carrera?: string;
}): Promise<ResultadoAction> {
  if (!(await hayAcceso())) return { ok: false, error: ERROR_SESION };

  if (!supabaseConfigurado()) {
    const parsedLocal = perfilSchema.safeParse(input);
    if (!parsedLocal.success) {
      return { ok: false, error: 'Poné tu nombre así te saludamos.' };
    }
    try {
      await escribirPerfilLocal({
        nombre: parsedLocal.data.nombre,
        instituto: parsedLocal.data.instituto,
        avatarUrl: parsedLocal.data.avatarUrl,
      });
    } catch (e) {
      console.error('guardarPerfil (local):', e);
      return { ok: false, error: ERROR_GUARDAR };
    }
    revalidarTodo();
    return { ok: true };
  }

  const sesion = await conUsuario();
  if (!sesion.user) return { ok: false, error: sesion.error };
  const { supabase } = sesion;

  const parsed = perfilSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Poné tu nombre así te saludamos.' };
  }

  const { error } = await supabase
    .from('perfiles')
    .update({
      nombre: parsed.data.nombre,
      ...(parsed.data.carrera !== undefined ? { carrera: parsed.data.carrera } : {}),
    })
    .eq('user_id', sesion.user.id);

  if (error) {
    console.error('guardarPerfil:', error);
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

  if (!supabaseConfigurado()) {
    const parsedLocal = bloqueNuevoSchema.safeParse(input);
    if (!parsedLocal.success) return { ok: false, error: ERROR_DATOS };
    try {
      await crearBloqueLocal(materiaId, {
        tipo: parsedLocal.data.tipo,
        texto: parsedLocal.data.texto ?? '',
        url: parsedLocal.data.url ? normalizarUrl(parsedLocal.data.url) : '',
        ...(parsedLocal.data.estado ? { estado: parsedLocal.data.estado } : {}),
        ...(parsedLocal.data.ref ? { ref: parsedLocal.data.ref } : {}),
      });
    } catch (e) {
      console.error('crearBloque (local):', e);
      return { ok: false, error: ERROR_GUARDAR };
    }
    revalidarTodo();
    return { ok: true };
  }

  const sesion = await conUsuario();
  if (!sesion.user) return { ok: false, error: sesion.error };
  const { supabase } = sesion;

  const parsed = bloqueNuevoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: ERROR_DATOS };
  }

  // orden = max(orden) + 1000 (huecos para reordenar sin reescribir todo).
  // Hay una race si se crean dos bloques a la vez; riesgo aceptado (app de un usuario).
  const { data: ultimo, error: errorOrden } = await supabase
    .from('bloques')
    .select('orden')
    .eq('curso_id', materiaId)
    .order('orden', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (errorOrden) {
    console.error('crearBloque (orden):', errorOrden);
    return { ok: false, error: ERROR_GUARDAR };
  }

  const orden = ((ultimo as { orden: number } | null)?.orden ?? 0) + 1000;

  const { error } = await supabase.from('bloques').insert({
    curso_id: materiaId,
    tipo: parsed.data.tipo,
    texto: parsed.data.texto ?? '',
    url: parsed.data.url ? normalizarUrl(parsed.data.url) : '',
    ...(parsed.data.estado
      ? { estado: parsed.data.estado, hecho: parsed.data.estado === 'listo' }
      : {}),
    ...(parsed.data.ref ? { ref: parsed.data.ref } : {}),
    orden,
  });

  if (error) {
    console.error('crearBloque:', error);
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

  if (!supabaseConfigurado()) {
    const parsedLocal = bloquePatchSchema.safeParse(patch);
    if (!parsedLocal.success) return { ok: false, error: ERROR_DATOS };

    const cambiosLocal: {
      tipo?: (typeof TIPOS_BLOQUE)[number];
      texto?: string;
      url?: string;
      estado?: (typeof ESTADOS_BLOQUE)[number];
      hecho?: boolean;
      fmt?: FormatoBloque;
      ref?: RefBloque | null;
    } = {};
    if (parsedLocal.data.tipo !== undefined) cambiosLocal.tipo = parsedLocal.data.tipo;
    if (parsedLocal.data.texto !== undefined) cambiosLocal.texto = parsedLocal.data.texto;
    if (parsedLocal.data.url !== undefined)
      cambiosLocal.url = parsedLocal.data.url ? normalizarUrl(parsedLocal.data.url) : '';
    if (parsedLocal.data.estado !== undefined) cambiosLocal.estado = parsedLocal.data.estado;
    if (parsedLocal.data.hecho !== undefined) cambiosLocal.hecho = parsedLocal.data.hecho;
    if (parsedLocal.data.fmt !== undefined) cambiosLocal.fmt = parsedLocal.data.fmt;
    // `null` es un valor válido acá: significa "quitá la referencia".
    if (parsedLocal.data.ref !== undefined) cambiosLocal.ref = parsedLocal.data.ref;
    if (Object.keys(cambiosLocal).length === 0) return { ok: true };

    try {
      const actualizado = await actualizarBloqueLocal(id, cambiosLocal);
      if (!actualizado) return { ok: false, error: ERROR_NO_EXISTE };
    } catch (e) {
      console.error('actualizarBloque (local):', e);
      return { ok: false, error: ERROR_GUARDAR };
    }
    revalidarTodo();
    return { ok: true };
  }

  const sesion = await conUsuario();
  if (!sesion.user) return { ok: false, error: sesion.error };
  const { supabase } = sesion;

  const parsed = bloquePatchSchema.safeParse(patch);
  if (!parsed.success) {
    return { ok: false, error: ERROR_DATOS };
  }

  const cambios: Record<string, string | boolean | FormatoBloque | RefBloque | null> = {};
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

  const { error } = await supabase.from('bloques').update(cambios).eq('id', id);

  if (error) {
    console.error('actualizarBloque:', error);
    return { ok: false, error: ERROR_GUARDAR };
  }
  revalidarTodo();
  return { ok: true };
}

export async function eliminarBloque(id: string): Promise<ResultadoAction> {
  if (!(await hayAcceso())) return { ok: false, error: ERROR_SESION };

  if (!supabaseConfigurado()) {
    try {
      const borrado = await eliminarBloqueLocal(id);
      if (!borrado) return { ok: false, error: ERROR_NO_EXISTE };
    } catch (e) {
      console.error('eliminarBloque (local):', e);
      return { ok: false, error: ERROR_GUARDAR };
    }
    revalidarTodo();
    return { ok: true };
  }

  const sesion = await conUsuario();
  if (!sesion.user) return { ok: false, error: sesion.error };
  const { supabase } = sesion;

  const { data, error } = await supabase.from('bloques').delete().eq('id', id).select('id');

  if (error) {
    console.error('eliminarBloque:', error);
    return { ok: false, error: ERROR_GUARDAR };
  }
  if (!data || data.length === 0) return { ok: false, error: ERROR_NO_EXISTE };
  revalidarTodo();
  return { ok: true };
}

const reordenarSchema = z.array(
  z.object({
    id: z.uuid(),
    orden: z.number().int(),
  })
);

/** En local los ids son "manual:<uuid>", no uuids pelados. */
const reordenarLocalSchema = z.array(
  z.object({
    id: z.string().min(1),
    orden: z.number().int(),
  })
);

export async function reordenarBloques(
  items: { id: string; orden: number }[]
): Promise<ResultadoAction> {
  if (!(await hayAcceso())) return { ok: false, error: ERROR_SESION };

  if (!supabaseConfigurado()) {
    const parsedLocal = reordenarLocalSchema.safeParse(items);
    if (!parsedLocal.success) return { ok: false, error: ERROR_DATOS };
    if (parsedLocal.data.length === 0) return { ok: true };
    try {
      await reordenarBloquesLocales(parsedLocal.data);
    } catch (e) {
      console.error('reordenarBloques (local):', e);
      return { ok: false, error: ERROR_GUARDAR };
    }
    revalidarTodo();
    return { ok: true };
  }

  const sesion = await conUsuario();
  if (!sesion.user) return { ok: false, error: sesion.error };
  const { supabase } = sesion;

  const parsed = reordenarSchema.safeParse(items);
  if (!parsed.success) {
    return { ok: false, error: ERROR_DATOS };
  }
  if (parsed.data.length === 0) return { ok: true };

  // RPC transaccional: o se reordena todo o nada.
  const { error } = await supabase.rpc('reordenar_bloques', {
    p_items: parsed.data,
  });

  if (error) {
    console.error('reordenarBloques:', error);
    return { ok: false, error: ERROR_GUARDAR };
  }
  revalidarTodo();
  return { ok: true };
}
