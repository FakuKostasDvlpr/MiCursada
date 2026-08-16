'use server';

// Fase 3 — Server Actions de Mi Cursada.
// Todas devuelven { ok: true } | { ok: false, error } con errores cortos en castellano.
// Estrategia de revalidación consistente: revalidatePath('/', 'layout') — cubre
// '/', '/semana', '/materias', '/materias/[id]' y '/avisos' de una.

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { normalizarUrl } from '@/lib/urls';
import { COLORES_MATERIA, ESTADOS_BLOQUE, TIPOS_BLOQUE } from '@/lib/types';

export type ResultadoAction = { ok: true } | { ok: false; error: string };

const ERROR_SESION = 'No pudimos verificar tu sesión. Entrá de nuevo.';
const ERROR_GUARDAR = 'No se pudo guardar. Probá de nuevo.';

function revalidarTodo() {
  revalidatePath('/', 'layout');
}

/** Crea el server client y verifica que haya usuario autenticado. */
async function conUsuario() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// ---------------------------------------------------------------------------
// Materias
// ---------------------------------------------------------------------------

const horarioSchema = z.object({
  dia: z.number().int().min(1).max(6),
  inicio: z.string().regex(/^\d{2}:\d{2}$/),
  fin: z.string().regex(/^\d{2}:\d{2}$/),
});

const materiaSchema = z.object({
  nombre: z.string().trim().min(1),
  profe: z.string().trim(),
  aula: z.string().trim(),
  color: z.enum(COLORES_MATERIA),
  horarios: z.array(horarioSchema).min(1),
});

export type MateriaInput = z.input<typeof materiaSchema>;

function validarMateria(
  input: MateriaInput
): { ok: true; datos: z.output<typeof materiaSchema> } | { ok: false; error: string } {
  const parsed = materiaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Poné un nombre y agregá al menos un horario.' };
  }
  // 'HH:MM' compara bien lexicográficamente.
  if (parsed.data.horarios.some((h) => h.fin <= h.inicio)) {
    return { ok: false, error: 'El fin tiene que ser después del inicio.' };
  }
  return { ok: true, datos: parsed.data };
}

export async function crearMateria(input: MateriaInput): Promise<ResultadoAction> {
  const { supabase, user } = await conUsuario();
  if (!user) return { ok: false, error: ERROR_SESION };

  const validacion = validarMateria(input);
  if (!validacion.ok) return validacion;
  const { datos } = validacion;

  const { error } = await supabase.rpc('crear_materia_con_horarios', {
    p_nombre: datos.nombre,
    p_profe: datos.profe,
    p_aula: datos.aula,
    p_color: datos.color,
    p_horarios: datos.horarios,
  });

  if (error) {
    console.error('crearMateria:', error);
    return { ok: false, error: ERROR_GUARDAR };
  }
  revalidarTodo();
  return { ok: true };
}

export async function actualizarMateria(
  id: string,
  input: MateriaInput
): Promise<ResultadoAction> {
  const { supabase, user } = await conUsuario();
  if (!user) return { ok: false, error: ERROR_SESION };

  const validacion = validarMateria(input);
  if (!validacion.ok) return validacion;
  const { datos } = validacion;

  const { error } = await supabase.rpc('actualizar_materia_con_horarios', {
    p_materia_id: id,
    p_nombre: datos.nombre,
    p_profe: datos.profe,
    p_aula: datos.aula,
    p_color: datos.color,
    p_horarios: datos.horarios,
  });

  if (error) {
    console.error('actualizarMateria:', error);
    return { ok: false, error: ERROR_GUARDAR };
  }
  revalidarTodo();
  return { ok: true };
}

export async function eliminarMateria(id: string): Promise<ResultadoAction> {
  const { supabase, user } = await conUsuario();
  if (!user) return { ok: false, error: ERROR_SESION };

  // Cascade se lleva horarios/bloques/archivos; avisos quedan como "General".
  const { error } = await supabase.from('materias').delete().eq('id', id);

  if (error) {
    console.error('eliminarMateria:', error);
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
  const { supabase, user } = await conUsuario();
  if (!user) return { ok: false, error: ERROR_SESION };

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
  const { supabase, user } = await conUsuario();
  if (!user) return { ok: false, error: ERROR_SESION };

  const { error } = await supabase.from('archivos').delete().eq('id', id);

  if (error) {
    console.error('eliminarArchivo:', error);
    return { ok: false, error: ERROR_GUARDAR };
  }
  revalidarTodo();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------

const avisoSchema = z.object({
  titulo: z.string().trim().min(1),
  materiaId: z.string().uuid().nullable(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function crearAviso(input: {
  titulo: string;
  materiaId: string | null;
  fecha: string;
}): Promise<ResultadoAction> {
  const { supabase, user } = await conUsuario();
  if (!user) return { ok: false, error: ERROR_SESION };

  const parsed = avisoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Poné un título y una fecha.' };
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
  const { supabase, user } = await conUsuario();
  if (!user) return { ok: false, error: ERROR_SESION };

  const { error } = await supabase.from('avisos').update({ hecho }).eq('id', id);

  if (error) {
    console.error('toggleAviso:', error);
    return { ok: false, error: ERROR_GUARDAR };
  }
  revalidarTodo();
  return { ok: true };
}

export async function eliminarAviso(id: string): Promise<ResultadoAction> {
  const { supabase, user } = await conUsuario();
  if (!user) return { ok: false, error: ERROR_SESION };

  const { error } = await supabase.from('avisos').delete().eq('id', id);

  if (error) {
    console.error('eliminarAviso:', error);
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
});

export async function guardarPerfil(input: {
  nombre: string;
  instituto: string;
}): Promise<ResultadoAction> {
  const { supabase, user } = await conUsuario();
  if (!user) return { ok: false, error: ERROR_SESION };

  const parsed = perfilSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Poné tu nombre así te saludamos.' };
  }

  const { error } = await supabase.from('perfil').upsert(
    {
      user_id: user.id,
      nombre: parsed.data.nombre,
      instituto: parsed.data.instituto || null,
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
  const { supabase, user } = await conUsuario();
  if (!user) return { ok: false, error: ERROR_SESION };

  const parsed = bloqueNuevoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: ERROR_GUARDAR };
  }

  // orden = max(orden) + 1000 (huecos para reordenar sin reescribir todo)
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
  const { supabase, user } = await conUsuario();
  if (!user) return { ok: false, error: ERROR_SESION };

  const parsed = bloquePatchSchema.safeParse(patch);
  if (!parsed.success) {
    return { ok: false, error: ERROR_GUARDAR };
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
  const { supabase, user } = await conUsuario();
  if (!user) return { ok: false, error: ERROR_SESION };

  const { error } = await supabase.from('bloques').delete().eq('id', id);

  if (error) {
    console.error('eliminarBloque:', error);
    return { ok: false, error: ERROR_GUARDAR };
  }
  revalidarTodo();
  return { ok: true };
}

export async function reordenarBloques(
  items: { id: string; orden: number }[]
): Promise<ResultadoAction> {
  const { supabase, user } = await conUsuario();
  if (!user) return { ok: false, error: ERROR_SESION };

  if (items.length === 0) return { ok: true };

  const resultados = await Promise.all(
    items.map((item) =>
      supabase.from('bloques').update({ orden: item.orden }).eq('id', item.id)
    )
  );

  const conError = resultados.find((r) => r.error);
  if (conError?.error) {
    console.error('reordenarBloques:', conError.error);
    return { ok: false, error: ERROR_GUARDAR };
  }
  revalidarTodo();
  return { ok: true };
}
