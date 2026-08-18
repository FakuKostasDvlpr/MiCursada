// Trasvasa los overlays de datos/ al esquema multiusuario de Supabase, para UNA
// persona (Task 15 del plan multiusuario).
//
//   node scripts/importar-datos-locales.mjs <moodle_id>
//
// Qué importa: horarios, materias-extra (profe/aula/color), bloques (las notas,
// con ids uuid nuevos pero conservando orden y createdAt), avisos manuales y
// archivos manuales, y el "hecho" de los avisos del aula que existan en
// avisos_curso. El snapshot NO se importa: lo regenera el sync.
//
// Idempotente: las tablas con PK natural van por upsert; los bloques ya
// importados se saltean comparando (curso_id, orden, texto). Correrlo dos veces
// no duplica nada. Los overlays de datos/ NO se tocan.

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const raiz = path.resolve(import.meta.dirname, '..');

// .env.local a mano: no hay dotenv en las deps y no hace falta.
for (const linea of fs.readFileSync(path.join(raiz, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z_]+)=(.*)$/.exec(linea);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const moodleId = Number(process.argv[2]);

if (!url || !service) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}
if (!Number.isInteger(moodleId)) {
  console.error('Uso: node scripts/importar-datos-locales.mjs <moodle_id>');
  process.exit(1);
}

const db = createClient(url, service, { auth: { persistSession: false } });

const leer = (nombre, fallback) => {
  const ruta = path.join(raiz, 'datos', nombre);
  if (!fs.existsSync(ruta)) return fallback;
  return JSON.parse(fs.readFileSync(ruta, 'utf8'));
};

const morir = (paso, error) => {
  console.error(`${paso}:`, error.message ?? error);
  process.exit(1);
};

// --- La persona destino (tiene que haber entrado al menos una vez) ---

const { data: perfil, error: errorPerfil } = await db
  .from('perfiles')
  .select('user_id, nombre')
  .eq('moodle_id', moodleId)
  .maybeSingle();
if (errorPerfil) morir('perfiles', errorPerfil);
if (!perfil) {
  console.error(`No hay perfil con moodle_id ${moodleId}: esa persona tiene que entrar una vez.`);
  process.exit(1);
}
const userId = perfil.user_id;
console.log(`Importando datos/ para ${perfil.nombre} (moodle ${moodleId})`);

// Solo se puede referenciar cursos que existen (fk): los demás se saltean avisando.
const { data: cursosRows, error: errorCursos } = await db.from('cursos').select('id');
if (errorCursos) morir('cursos', errorCursos);
const cursos = new Set((cursosRows ?? []).map((c) => c.id));
const saltear = (tabla, cursoId) => {
  console.warn(`  ~ ${tabla}: ${cursoId} no está en cursos, salteado`);
};

// --- horarios.json → horarios (upsert artesanal: se compara la fila entera) ---

const horarios = leer('horarios.json', {});
let nHorarios = 0;
for (const [cursoId, lista] of Object.entries(horarios)) {
  if (!cursos.has(cursoId)) {
    saltear('horarios', cursoId);
    continue;
  }
  const { data: existentes } = await db
    .from('horarios')
    .select('dia, inicio, fin')
    .eq('user_id', userId)
    .eq('curso_id', cursoId);
  const ya = new Set((existentes ?? []).map((h) => `${h.dia}|${h.inicio.slice(0, 5)}|${h.fin.slice(0, 5)}`));
  for (const h of lista) {
    if (ya.has(`${h.dia}|${h.inicio}|${h.fin}`)) continue;
    const { error } = await db
      .from('horarios')
      .insert({ user_id: userId, curso_id: cursoId, dia: h.dia, inicio: h.inicio, fin: h.fin });
    if (error) morir('horarios', error);
    nHorarios += 1;
  }
}
console.log(`  horarios: +${nHorarios}`);

// --- materias-extra.json → materias_extra (PK natural → upsert) ---

const extras = leer('materias-extra.json', {});
let nExtras = 0;
for (const [cursoId, e] of Object.entries(extras)) {
  if (!cursos.has(cursoId)) {
    saltear('materias_extra', cursoId);
    continue;
  }
  const { error } = await db.from('materias_extra').upsert({
    user_id: userId,
    curso_id: cursoId,
    profe: e.profe ?? '',
    aula: e.aula ?? '',
    color: e.color ?? '#38bdf8',
  });
  if (error) morir('materias_extra', error);
  nExtras += 1;
}
console.log(`  materias_extra: ${nExtras} upsert`);

// --- bloques.json → bloques (ids nuevos; dedup por curso+orden+texto) ---
//
// El id local ("manual:<uuid>") no entra en la columna uuid, así que el vínculo
// notaId de un aviso local se re-resuelve después por (curso, orden, texto).

const bloquesLocales = leer('bloques.json', {});
const idNuevoPorViejo = new Map();
let nBloques = 0;
for (const [cursoId, lista] of Object.entries(bloquesLocales)) {
  if (!cursos.has(cursoId)) {
    saltear('bloques', cursoId);
    continue;
  }
  const { data: existentes } = await db
    .from('bloques')
    .select('id, orden, texto')
    .eq('user_id', userId)
    .eq('curso_id', cursoId);
  const ya = new Map((existentes ?? []).map((b) => [`${b.orden}|${b.texto}`, b.id]));
  for (const b of lista) {
    const clave = `${b.orden}|${b.texto ?? ''}`;
    const repetido = ya.get(clave);
    if (repetido) {
      idNuevoPorViejo.set(b.id, repetido);
      continue;
    }
    const { data: creado, error } = await db
      .from('bloques')
      .insert({
        user_id: userId,
        curso_id: cursoId,
        tipo: b.tipo,
        texto: b.texto ?? '',
        url: b.url ?? '',
        estado: b.estado ?? 'pendiente',
        hecho: b.hecho ?? false,
        orden: b.orden,
        created_at: b.createdAt,
        ...(b.fmt ? { fmt: b.fmt } : {}),
        ...(b.ref ? { ref: b.ref } : {}),
      })
      .select('id')
      .single();
    if (error) morir('bloques', error);
    idNuevoPorViejo.set(b.id, creado.id);
    nBloques += 1;
  }
}
console.log(`  bloques: +${nBloques}`);

// --- avisos-manuales.json → avisos_manuales (dedup por titulo+fecha) ---

const avisosManuales = leer('avisos-manuales.json', []);
let nAvisos = 0;
if (avisosManuales.length > 0) {
  const { data: existentes } = await db
    .from('avisos_manuales')
    .select('titulo, fecha')
    .eq('user_id', userId);
  const ya = new Set((existentes ?? []).map((a) => `${a.titulo}|${a.fecha}`));
  for (const a of avisosManuales) {
    if (ya.has(`${a.titulo}|${a.fecha}`)) continue;
    if (a.materiaId && !cursos.has(a.materiaId)) {
      saltear('avisos_manuales', a.materiaId);
      continue;
    }
    const { error } = await db.from('avisos_manuales').insert({
      user_id: userId,
      curso_id: a.materiaId ?? null,
      titulo: a.titulo,
      fecha: a.fecha,
      hecho: a.hecho ?? false,
      // El vínculo con la nota se re-resuelve al id uuid nuevo del bloque.
      nota_id: a.notaId ? (idNuevoPorViejo.get(a.notaId) ?? null) : null,
    });
    if (error) morir('avisos_manuales', error);
    nAvisos += 1;
  }
}
console.log(`  avisos_manuales: +${nAvisos}`);

// --- archivos-manuales.json → archivos_manuales (dedup por nombre+url) ---

const archivosManuales = leer('archivos-manuales.json', {});
let nArchivos = 0;
for (const [cursoId, lista] of Object.entries(archivosManuales)) {
  if (!cursos.has(cursoId)) {
    saltear('archivos_manuales', cursoId);
    continue;
  }
  const { data: existentes } = await db
    .from('archivos_manuales')
    .select('nombre, url')
    .eq('user_id', userId)
    .eq('curso_id', cursoId);
  const ya = new Set((existentes ?? []).map((a) => `${a.nombre}|${a.url}`));
  for (const a of lista) {
    if (ya.has(`${a.nombre}|${a.url}`)) continue;
    const { error } = await db
      .from('archivos_manuales')
      .insert({ user_id: userId, curso_id: cursoId, nombre: a.nombre, url: a.url });
    if (error) morir('archivos_manuales', error);
    nArchivos += 1;
  }
}
console.log(`  archivos_manuales: +${nArchivos}`);

// --- avisos-estado.json → avisos_estado (solo ids que existan en avisos_curso) ---

const estados = leer('avisos-estado.json', {});
const { data: avisosCurso, error: errorAvisos } = await db.from('avisos_curso').select('id');
if (errorAvisos) morir('avisos_curso', errorAvisos);
const avisosDelAula = new Set((avisosCurso ?? []).map((a) => a.id));
let nEstados = 0;
for (const [avisoId, hecho] of Object.entries(estados)) {
  if (!avisosDelAula.has(avisoId)) continue;
  const { error } = await db
    .from('avisos_estado')
    .upsert({ user_id: userId, aviso_id: avisoId, hecho: Boolean(hecho) });
  if (error) morir('avisos_estado', error);
  nEstados += 1;
}
console.log(`  avisos_estado: ${nEstados} upsert`);

console.log('Listo. Los overlays de datos/ quedaron intactos.');
