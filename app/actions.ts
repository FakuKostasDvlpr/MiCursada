'use server';

// Fase 3 — Server Actions de Mi Cursada.
// Todas devuelven { ok: true } | { ok: false, error } con errores cortos en castellano.
// Estrategia de revalidación consistente: revalidatePath('/', 'layout') — cubre
// '/', '/semana', '/materias', '/materias/[id]' y '/avisos' de una.

import type { User } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { escribirEstadoAviso, escribirHorariosLocales } from '@/lib/datos-locales';
import { supabaseConfigurado } from '@/lib/supabase/configurado';
import { createClient } from '@/lib/supabase/server';
import { normalizarUrl } from '@/lib/urls';
import { COLORES_MATERIA, ESTADOS_BLOQUE, TIPOS_BLOQUE } from '@/lib/types';

export type ResultadoAction = { ok: true } | { ok: false; error: string };

const ERROR_SESION = 'No pudimos verificar tu sesión. Entrá de nuevo.';
const ERROR_SIN_CONFIG = 'Falta configurar Supabase (.env.local).';
const ERROR_GUARDAR = 'No se pudo guardar. Probá de nuevo.';
const ERROR_NO_EXISTE = 'Eso ya no existe.';
const ERROR_DATOS = 'Datos inválidos.';

function revalidarTodo() {
  revalidatePath('/', 'layout');
}

type ConUsuario =
  | { supabase: Awaited<ReturnType<typeof createClient>>; user: User; error?: undefined }
  | { supabase: null; user: null; error: string };

/**
 * Crea el server client y verifica que haya usuario autenticado.
 * Si Supabase no está configurado (sin .env.local), corta antes del auth check.
 */
async function conUsuario(): Promise<ConUsuario> {
  if (!supabaseConfigurado()) return { supabase: null, user: null, error: ERROR_SIN_CONFIG };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase: null, user: null, error: ERROR_SESION };
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
 * Es lo único de la edición de materia que podemos persistir sin base
 * (profe/aula/color no tienen dónde vivir todavía).
 */
export async function guardarHorariosLocales(
  materiaId: string,
  horarios: MateriaInput['horarios']
): Promise<ResultadoAction> {
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

export async function actualizarMateria(
  id: string,
  input: MateriaInput
): Promise<ResultadoAction> {
  if (!supabaseConfigurado()) {
    const parsedLocal = materiaSchema.safeParse(input);
    if (!parsedLocal.success) return { ok: false, error: ERROR_DATOS };
    return guardarHorariosLocales(id, parsedLocal.data.horarios);
  }

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
    p_materia_id: id,
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
  const sesion = await conUsuario();
  if (!sesion.user) return { ok: false, error: sesion.error };
  const { supabase } = sesion;

  const parsed = archivoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Poné un nombre y un link.' };
  }

  const { error } = await supabase.from('archivos').insert({
    materia_id: materiaId,
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
  const sesion = await conUsuario();
  if (!sesion.user) return { ok: false, error: sesion.error };
  const { supabase } = sesion;

  const { data, error } = await supabase.from('archivos').delete().eq('id', id).select('id');

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
  materiaId: z
    .union([z.uuid(), z.literal(''), z.null()])
    .transform((v) => v || null),
  fecha: fechaSchema,
});

export async function crearAviso(input: {
  titulo: string;
  materiaId: string | null;
  fecha: string;
}): Promise<ResultadoAction> {
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

  const { error } = await supabase.from('avisos').insert({
    titulo: parsed.data.titulo,
    materia_id: parsed.data.materiaId,
    fecha: parsed.data.fecha,
  });

  if (error) {
    console.error('crearAviso:', error);
    return { ok: false, error: ERROR_GUARDAR };
  }
  revalidarTodo();
  return { ok: true };
}

export async function toggleAviso(id: string, hecho: boolean): Promise<ResultadoAction> {
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

  const { data, error } = await supabase
    .from('avisos')
    .update({ hecho })
    .eq('id', id)
    .select('id');

  if (error) {
    console.error('toggleAviso:', error);
    return { ok: false, error: ERROR_GUARDAR };
  }
  if (!data || data.length === 0) return { ok: false, error: ERROR_NO_EXISTE };
  revalidarTodo();
  return { ok: true };
}

export async function eliminarAviso(id: string): Promise<ResultadoAction> {
  const sesion = await conUsuario();
  if (!sesion.user) return { ok: false, error: sesion.error };
  const { supabase } = sesion;

  const { data, error } = await supabase.from('avisos').delete().eq('id', id).select('id');

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
});

export async function guardarPerfil(input: {
  nombre: string;
  instituto: string;
  avatarUrl?: string;
}): Promise<ResultadoAction> {
  const sesion = await conUsuario();
  if (!sesion.user) return { ok: false, error: sesion.error };
  const { supabase } = sesion;

  const parsed = perfilSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Poné tu nombre así te saludamos.' };
  }

  const { error } = await supabase.from('perfil').upsert(
    {
      user_id: sesion.user.id,
      nombre: parsed.data.nombre,
      instituto: parsed.data.instituto || null,
      ...(parsed.data.avatarUrl !== undefined ? { avatar_url: parsed.data.avatarUrl } : {}),
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    console.error('guardarPerfil:', error);
    return { ok: false, error: ERROR_GUARDAR };
  }
  revalidarTodo();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Bloques (API lista para la Fase 6)
// ---------------------------------------------------------------------------

const bloqueNuevoSchema = z.object({
  tipo: z.enum(TIPOS_BLOQUE),
  texto: z.string().optional(),
  url: z.string().optional(),
});

export async function crearBloque(
  materiaId: string,
  input: { tipo: (typeof TIPOS_BLOQUE)[number]; texto?: string; url?: string }
): Promise<ResultadoAction> {
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
    .eq('materia_id', materiaId)
    .order('orden', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (errorOrden) {
    console.error('crearBloque (orden):', errorOrden);
    return { ok: false, error: ERROR_GUARDAR };
  }

  const orden = ((ultimo as { orden: number } | null)?.orden ?? 0) + 1000;

  const { error } = await supabase.from('bloques').insert({
    materia_id: materiaId,
    tipo: parsed.data.tipo,
    texto: parsed.data.texto ?? '',
    url: parsed.data.url ? normalizarUrl(parsed.data.url) : '',
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
  texto: z.string().optional(),
  url: z.string().optional(),
  estado: z.enum(ESTADOS_BLOQUE).optional(),
  hecho: z.boolean().optional(),
});

export type BloquePatch = z.input<typeof bloquePatchSchema>;

export async function actualizarBloque(id: string, patch: BloquePatch): Promise<ResultadoAction> {
  const sesion = await conUsuario();
  if (!sesion.user) return { ok: false, error: sesion.error };
  const { supabase } = sesion;

  const parsed = bloquePatchSchema.safeParse(patch);
  if (!parsed.success) {
    return { ok: false, error: ERROR_DATOS };
  }

  const cambios: Record<string, string | boolean> = {};
  if (parsed.data.texto !== undefined) cambios.texto = parsed.data.texto;
  if (parsed.data.url !== undefined)
    cambios.url = parsed.data.url ? normalizarUrl(parsed.data.url) : '';
  if (parsed.data.estado !== undefined) cambios.estado = parsed.data.estado;
  if (parsed.data.hecho !== undefined) cambios.hecho = parsed.data.hecho;
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

export async function reordenarBloques(
  items: { id: string; orden: number }[]
): Promise<ResultadoAction> {
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
