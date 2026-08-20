'use server';

// Fase 3 — Server Actions de Mi Cursada.
// Todas devuelven { ok: true } | { ok: false, error } con errores cortos en castellano.
// Todas arrancan con `hayAcceso()`: una Server Action es un POST que se puede
// llamar sin pasar por la página, así que el layout de (app) no alcanza como
// única puerta — cada action revisa la sesión por su cuenta.
// Estrategia de revalidación consistente: revalidatePath('/', 'layout') — cubre
// '/', '/semana', '/materias', '/materias/[id]' y '/avisos' de una.

import { randomUUID } from 'node:crypto';
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
import { MAX_FOTOS_BIBLIOTECA, MAX_SUBIDA, formatearPeso } from '@/lib/avatares';
import { tituloDesdeNota } from '@/lib/aviso-nota';
import { registrarEvento } from '@/lib/eventos';
import { textoPlano } from '@/lib/referencias';
import { hayAcceso } from '@/lib/sesion-actual';
import { adminClient } from '@/lib/supabase/admin';
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
// Alta manual de materias
// ---------------------------------------------------------------------------
//
// El aula virtual no siempre trae todo: hay materias que no figuran en Moodle,
// que no se recuperaron en el sync, o que la persona cursa por fuera. Sin un
// alta manual, esa materia no existe para la app y no se le puede colgar ni un
// horario ni una nota.
//
// La fila va a `cursos` (la tabla compartida) porque todo lo demás —horarios,
// notas, archivos— cuelga de un `curso_id` con foreign key. No se "filtra" a
// nadie: la policy de `cursos` exige estar inscripto, y la única inscripción
// que se crea es la de quien la dio de alta. El id lleva el prefijo
// `manual:` (misma convención que archivos y avisos, ver `esManual`), que es
// lo que la distingue del sync.

const materiaNuevaSchema = z.object({ nombre: z.string().trim().min(1).max(140) });

/**
 * Da de alta una materia propia y te inscribe a ella.
 *
 * Escribe con service role porque `cursos` no tiene policy de insert para
 * usuarios (la escribe únicamente el sync compartido). La autorización la hace
 * esta action: sesión + consentimiento, igual que cualquier otra.
 */
export async function crearMateriaManual(
  nombre: string
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!(await hayAcceso())) return { ok: false, error: ERROR_SESION };
  if (!supabaseConfigurado()) return { ok: false, error: ERROR_SIN_CONFIG };

  const parsed = materiaNuevaSchema.safeParse({ nombre });
  if (!parsed.success) return { ok: false, error: 'Poné un nombre para la materia.' };

  const sesion = await conUsuario();
  if (!sesion.user) return { ok: false, error: sesion.error };

  const id = `manual:${randomUUID()}`;
  const admin = adminClient();

  const { error: eCurso } = await admin.from('cursos').insert({
    id,
    nombre: parsed.data.nombre,
    datos: { id, nombre: parsed.data.nombre, source: 'manual' },
    sincronizado: new Date().toISOString(),
  });
  if (eCurso) {
    console.error('crearMateriaManual (curso):', eCurso);
    return { ok: false, error: ERROR_GUARDAR };
  }

  const { error: eIns } = await admin
    .from('inscripciones')
    .insert({ user_id: sesion.user.id, curso_id: id });
  if (eIns) {
    // Sin inscripción la materia queda huérfana y encima invisible (la policy
    // de `cursos` la esconde), así que se limpia en vez de dejar basura.
    await admin.from('cursos').delete().eq('id', id);
    console.error('crearMateriaManual (inscripcion):', eIns);
    return { ok: false, error: ERROR_GUARDAR };
  }

  revalidarTodo();
  return { ok: true, id };
}

/** Borra una materia cargada a mano. Las del aula virtual no se tocan. */
export async function eliminarMateriaManual(id: string): Promise<ResultadoAction> {
  if (!(await hayAcceso())) return { ok: false, error: ERROR_SESION };
  if (!supabaseConfigurado()) return { ok: false, error: ERROR_SIN_CONFIG };
  if (!id.startsWith('manual:')) return { ok: false, error: 'Esa materia viene del aula virtual.' };

  const sesion = await conUsuario();
  if (!sesion.user) return { ok: false, error: sesion.error };

  const admin = adminClient();
  // Chequeo de pertenencia explícito: `admin` saltea RLS, así que sin esto
  // cualquiera podría borrar la materia manual de otra persona pasando su id.
  const { data: inscripto } = await admin
    .from('inscripciones')
    .select('curso_id')
    .eq('user_id', sesion.user.id)
    .eq('curso_id', id)
    .maybeSingle();
  if (!inscripto) return { ok: false, error: ERROR_NO_EXISTE };

  // El resto (inscripciones, horarios, bloques…) se va en cascada por las FK.
  const { error } = await admin.from('cursos').delete().eq('id', id);
  if (error) {
    console.error('eliminarMateriaManual:', error);
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

/**
 * Máximo por subida. Bajó de 5 MB a `MAX_SUBIDA` (2 MB) cuando la UI pasó a
 * optimizar la foto en el cliente: lo que llega ahora son ~25 KB, o hasta 1 MB
 * si es un GIF (el único que no se puede achicar sin perder la animación).
 *
 * Se valida igual acá: la action es un POST que se puede llamar sin pasar por
 * el picker, y este límite es lo único que protege el bucket de una subida
 * armada a mano.
 */
const MAX_AVATAR = MAX_SUBIDA;

const ERROR_FOTO = 'No se pudo subir la foto. Probá de nuevo.';
const ERROR_FOTO_TIPO = 'Elegí una imagen.';
const ERROR_FOTO_PESO = `La foto pesa demasiado (máximo ${formatearPeso(MAX_SUBIDA)}).`;

export type ResultadoFoto = { ok: true; url: string } | { ok: false; error: string };

/** Bucket público donde viven los avatares subidos. */
const BUCKET_AVATARES = 'avatares';

const ERROR_LIMITE_FOTOS = `Llegaste al máximo de ${MAX_FOTOS_BIBLIOTECA} fotos. Borrá una para subir otra.`;

/** Los nombres de archivo de la biblioteca de este usuario, más reciente primero. */
async function nombresBiblioteca(
  admin: ReturnType<typeof adminClient>,
  userId: string
): Promise<string[]> {
  const { data, error } = await admin.storage.from(BUCKET_AVATARES).list('', {
    limit: 200,
    search: `${userId}.`,
    sortBy: { column: 'created_at', order: 'desc' },
  });
  if (error) throw error;
  // `search` de Storage es un "contiene", no un "empieza con": el prefijo se
  // vuelve a chequear acá para que nadie entre por un nombre armado. Y fuera
  // los PNG generados de un predefinido (ver el `gen-` en guardarAvatarLocal).
  // Filtro y proyección en una sola pasada.
  return (data ?? []).flatMap((o) =>
    o.name.startsWith(`${userId}.`) && !o.name.startsWith(`${userId}.gen-`) ? [o.name] : []
  );
}

/**
 * Tu biblioteca de avatares: todas las imágenes que subiste alguna vez, la más
 * reciente primero.
 *
 * El listado va con service role a propósito. `storage.objects` tiene un SELECT
 * abierto a `authenticated` para todo el bucket, así que listar desde el
 * cliente devolvería también los archivos de los demás; filtrando acá, cada uno
 * solo ve lo suyo. El filtro es por el prefijo `{userId}.`, que es unívoco: el
 * id es un UUID de largo fijo y el punto no aparece adentro.
 */
export async function listarBibliotecaAvatares(): Promise<
  { ok: true; urls: string[] } | { ok: false; error: string }
> {
  if (!(await hayAcceso())) return { ok: false, error: ERROR_SESION };
  if (!supabaseConfigurado()) return { ok: true, urls: [] };

  const sesion = await conUsuario();
  if (!sesion.user) return { ok: false, error: sesion.error };
  const { user } = sesion;

  const admin = adminClient();
  try {
    const urls = (await nombresBiblioteca(admin, user.id)).map(
      (n) => admin.storage.from(BUCKET_AVATARES).getPublicUrl(n).data.publicUrl
    );
    return { ok: true, urls };
  } catch (e) {
    console.error('listarBibliotecaAvatares:', e);
    return { ok: false, error: ERROR_FOTO };
  }
}

/**
 * Borra una foto de tu biblioteca.
 *
 * Si era la que estabas usando, el perfil queda sin avatar (vuelven las
 * iniciales) en vez de quedar apuntando a un archivo que ya no existe, que se
 * vería como una imagen rota en toda la app.
 */
export async function borrarAvatarDeBiblioteca(url: string): Promise<ResultadoAction> {
  if (!(await hayAcceso())) return { ok: false, error: ERROR_SESION };
  if (!supabaseConfigurado()) return { ok: false, error: ERROR_SIN_CONFIG };

  const sesion = await conUsuario();
  if (!sesion.user) return { ok: false, error: sesion.error };
  const { supabase, user } = sesion;

  const admin = adminClient();
  const nombre = nombreDesdeUrl(admin, url, user.id);
  if (!nombre) return { ok: false, error: ERROR_NO_EXISTE };

  const { error: eBorrar } = await admin.storage.from(BUCKET_AVATARES).remove([nombre]);
  if (eBorrar) {
    console.error('borrarAvatarDeBiblioteca:', eBorrar);
    return { ok: false, error: ERROR_FOTO };
  }

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('avatar_url')
    .eq('user_id', user.id)
    .maybeSingle();
  const actual = String(perfil?.avatar_url ?? '').split('?')[0] ?? '';
  const borrada = admin.storage.from(BUCKET_AVATARES).getPublicUrl(nombre).data.publicUrl;
  if (actual && actual === borrada) {
    await supabase.from('perfiles').update({ avatar_url: null }).eq('user_id', user.id);
  }

  revalidarTodo();
  return { ok: true };
}

/**
 * El nombre del archivo dentro del bucket, o null si la URL no es de una foto
 * de este usuario. La URL llega del cliente: sin este chequeo, alguien podría
 * borrar (o apropiarse de) el avatar de otra persona pasando su URL.
 */
function nombreDesdeUrl(
  admin: ReturnType<typeof adminClient>,
  url: string,
  userId: string
): string | null {
  const base = admin.storage.from(BUCKET_AVATARES).getPublicUrl('').data.publicUrl;
  const sinQuery = url.split('?')[0] ?? '';
  if (!sinQuery.startsWith(base)) return null;
  const nombre = decodeURIComponent(sinQuery.slice(base.length));
  if (!nombre || !nombre.startsWith(`${userId}.`) || nombre.includes('/')) return null;
  return nombre;
}

/**
 * Sube una imagen a tu biblioteca SIN ponerla todavía como tu avatar.
 *
 * Separar subir de aplicar es lo que permite el flujo del picker: agregás la
 * imagen con el `+`, queda marcada en la grilla, y recién al confirmar pasa a
 * ser tu avatar. Si cerrás el modal sin confirmar, la imagen igual te quedó en
 * la biblioteca (ese es el punto: no volver a subirla nunca más), pero tu
 * perfil sigue con el avatar de antes.
 */
export async function subirAvatarABiblioteca(formData: FormData): Promise<ResultadoFoto> {
  if (!(await hayAcceso())) return { ok: false, error: ERROR_SESION };
  if (!supabaseConfigurado()) return { ok: false, error: ERROR_SIN_CONFIG };

  const file = formData.get('foto');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: ERROR_FOTO_TIPO };

  const ext = extensionAvatar(file.type || '');
  if (!file.type.startsWith('image/') || !ext) return { ok: false, error: ERROR_FOTO_TIPO };
  if (file.size > MAX_AVATAR) return { ok: false, error: ERROR_FOTO_PESO };

  const sesion = await conUsuario();
  if (!sesion.user) return { ok: false, error: sesion.error };
  const { supabase, user } = sesion;

  // El tope se chequea en el server y no solo en la UI: la action es un POST
  // que se puede llamar sin pasar por el picker.
  const admin = adminClient();
  try {
    if ((await nombresBiblioteca(admin, user.id)).length >= MAX_FOTOS_BIBLIOTECA) {
      return { ok: false, error: ERROR_LIMITE_FOTOS };
    }
  } catch (e) {
    console.error('subirAvatarABiblioteca (conteo):', e);
    return { ok: false, error: ERROR_FOTO };
  }

  const ruta = `${user.id}.${randomUUID()}.${ext}`;
  const { error: errorSubida } = await supabase.storage
    .from(BUCKET_AVATARES)
    .upload(ruta, await file.arrayBuffer(), { contentType: file.type, upsert: false });
  if (errorSubida) {
    console.error('subirAvatarABiblioteca:', errorSubida);
    return { ok: false, error: ERROR_FOTO };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET_AVATARES).getPublicUrl(ruta);
  return { ok: true, url: publicUrl };
}

/**
 * Marca como tuya una imagen que ya está en tu biblioteca, sin volver a subirla.
 *
 * La URL llega del cliente, así que no se confía: se exige que el archivo esté
 * en el bucket y que su nombre arranque con `{userId}.`. Sin ese chequeo,
 * cualquiera podría apuntar su perfil al avatar de otra persona pasando su URL.
 */
export async function usarAvatarDeBiblioteca(url: string): Promise<ResultadoFoto> {
  if (!(await hayAcceso())) return { ok: false, error: ERROR_SESION };
  if (!supabaseConfigurado()) return { ok: false, error: ERROR_SIN_CONFIG };

  const sesion = await conUsuario();
  if (!sesion.user) return { ok: false, error: sesion.error };
  const { supabase, user } = sesion;

  const admin = adminClient();
  const nombre = nombreDesdeUrl(admin, url, user.id);
  if (!nombre) return { ok: false, error: ERROR_NO_EXISTE };

  const conBust = `${admin.storage.from(BUCKET_AVATARES).getPublicUrl(nombre).data.publicUrl}?v=${Date.now()}`;
  const { error } = await supabase
    .from('perfiles')
    .update({ avatar_url: conBust })
    .eq('user_id', user.id);
  if (error) {
    console.error('usarAvatarDeBiblioteca:', error);
    return { ok: false, error: ERROR_FOTO };
  }

  await registrarEvento('avatar_cambiado', user.id);
  revalidarTodo();
  return { ok: true, url: conBust };
}

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

  // Nombre único por subida: `{userId}.{uuid}.{ext}`. Antes era `{userId}.{ext}`,
  // que pisaba la imagen anterior — por eso cambiar de avatar y volver al de
  // antes obligaba a subirlo de nuevo. Con un nombre por archivo, cada imagen
  // que subiste queda y se puede volver a elegir desde tu biblioteca.
  //
  // El punto como separador NO es cosmético: la policy de Storage autoriza con
  // `split_part(name, '.', 1) = auth.uid()`, así que todo lo que va antes del
  // primer punto tiene que ser tu id. Una subcarpeta (`{userId}/…`) no pasaría
  // esa policy y obligaría a migrar. De paso, los avatares viejos
  // (`{userId}.{ext}`) comparten el mismo prefijo y entran solos en la
  // biblioteca, sin backfill.
  // El `gen-` marca que el PNG salió de un avatar predefinido, no de una
  // imagen tuya. La biblioteca los filtra: los predefinidos ya están siempre
  // en la grilla, y sin esto probar tres se te llenaba de duplicados.
  const ruta = `${user.id}.gen-${randomUUID()}.${ext}`;

  const { error: errorSubida } = await supabase.storage
    .from('avatares')
    .upload(ruta, await file.arrayBuffer(), { contentType: file.type, upsert: false });

  if (errorSubida) {
    console.error('guardarAvatarLocal:', errorSubida);
    return { ok: false, error: ERROR_FOTO };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('avatares').getPublicUrl(ruta);
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
  // Métrica para el panel admin: metadata (el curso), jamás el contenido.
  // Los divisores no son notas.
  if (parsed.data.tipo !== 'divisor') {
    await registrarEvento('nota_creada', sesion.user.id, { curso_id: materiaId });
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
