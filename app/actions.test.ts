// Server Actions contra los overlays de datos/: que persistan de
// verdad en datos/ y devuelvan el copy exacto. Cada test usa su propio tmpdir.

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// Las actions ahora exigen sesión (lib/sesion-actual). Fuera de un request no
// hay cookies(), así que se mockea el store: `cookie.token` decide si el test
// corre "adentro" o "sin sesión".
const cookie = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nombre: string) => (cookie.token ? { name: nombre, value: cookie.token } : undefined),
    set: vi.fn(),
    delete: vi.fn(),
  }),
  headers: async () => new Headers(),
}));

import {
  actualizarBloque,
  actualizarMateria,
  crearArchivo,
  crearAviso,
  crearBloque,
  eliminarArchivo,
  eliminarAviso,
  eliminarBloque,
  guardarAvatarLocal,
  guardarPerfil,
  reordenarBloques,
  toggleAviso,
} from '@/app/actions';
import { getDatosLocales, leerAvatarLocal, leerPerfilLocal, rutaDatos } from '@/lib/datos-locales';
import { crearSesion } from '@/lib/sesion';

const SNAPSHOT = {
  generado: '2026-08-16T20:00:00.000Z',
  materias: [
    {
      id: 'curso:2756',
      nombre: 'Fundamentos de Programación',
      color: '#38bdf8',
      source: 'moodle',
      archivos: [{ id: 'mod:9001', nombre: 'Guía Moodle', url: 'https://aula/1' }],
      bloques: [],
    },
  ],
  avisos: [
    { id: 'assign:14782', materiaId: 'curso:2756', titulo: 'TP1', fecha: '2026-08-20' },
  ],
};

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cursada-actions-'));
  process.env.CURSADA_DATOS_DIR = dir;
  await fs.writeFile(rutaDatos('snapshot'), JSON.stringify(SNAPSHOT), 'utf8');
  cookie.token = await crearSesion('Test');
});

afterEach(async () => {
  delete process.env.CURSADA_DATOS_DIR;
  cookie.token = undefined;
  await fs.rm(dir, { recursive: true, force: true });
});

describe('sin sesión', () => {
  it('las actions no tocan nada y piden entrar de nuevo', async () => {
    cookie.token = undefined;

    const r = await actualizarMateria('curso:2756', {
      profe: 'Intruso',
      aula: 'Aula 1',
      color: '#a78bfa',
      horarios: [{ dia: 4, inicio: '19:50', fin: '21:30' }],
    });

    expect(r).toEqual({ ok: false, error: 'No pudimos verificar tu sesión. Entrá de nuevo.' });
    const { materias } = await getDatosLocales();
    expect(materias[0]?.profe).not.toBe('Intruso');
  });

  it('un token que no existe tampoco entra', async () => {
    cookie.token = 'inventado';
    const r = await toggleAviso('assign:14782', true);
    expect(r).toEqual({ ok: false, error: 'No pudimos verificar tu sesión. Entrá de nuevo.' });
  });
});

describe('actualizarMateria (local)', () => {
  it('persiste profe, aula, color y horarios', async () => {
    const r = await actualizarMateria('curso:2756', {
      profe: 'Pérez',
      aula: 'Aula 12',
      color: '#a78bfa',
      horarios: [{ dia: 4, inicio: '19:50', fin: '21:30' }],
    });
    expect(r).toEqual({ ok: true });

    const { materias } = await getDatosLocales();
    expect(materias[0]).toMatchObject({ profe: 'Pérez', aula: 'Aula 12', color: '#a78bfa' });
    expect(materias[0]!.horarios[0]).toMatchObject({ dia: 4, inicio: '19:50', fin: '21:30' });
  });

  it('rechaza un horario invertido con el copy exacto', async () => {
    const r = await actualizarMateria('curso:2756', {
      profe: '',
      aula: '',
      color: '#38bdf8',
      horarios: [{ dia: 4, inicio: '21:30', fin: '19:50' }],
    });
    expect(r).toEqual({ ok: false, error: 'El fin tiene que ser después del inicio.' });
  });
});

describe('archivos (local)', () => {
  it('crea un archivo manual y lo puede borrar', async () => {
    expect(await crearArchivo('curso:2756', { nombre: 'Resumen', url: 'drive.com/x' })).toEqual({
      ok: true,
    });

    const { materias } = await getDatosLocales();
    const manual = materias[0]!.archivos.find((a) => a.nombre === 'Resumen')!;
    expect(manual.url).toBe('https://drive.com/x'); // normalizarUrl
    expect(manual.id.startsWith('manual:')).toBe(true);

    expect(await eliminarArchivo(manual.id)).toEqual({ ok: true });
    expect((await getDatosLocales()).materias[0]!.archivos).toHaveLength(1);
  });

  it('no deja borrar un archivo del aula virtual', async () => {
    expect(await eliminarArchivo('mod:9001')).toEqual({
      ok: false,
      error: 'Ese archivo viene del aula virtual.',
    });
  });

  it('pide nombre y link', async () => {
    expect(await crearArchivo('curso:2756', { nombre: '', url: '' })).toEqual({
      ok: false,
      error: 'Poné un nombre y un link.',
    });
  });
});

describe('avisos (local)', () => {
  it('crea un aviso con un materiaId local (no uuid)', async () => {
    expect(
      await crearAviso({ titulo: 'Parcial', materiaId: 'curso:2756', fecha: '2026-08-18' })
    ).toEqual({ ok: true });

    const { avisos } = await getDatosLocales();
    const manual = avisos.find((a) => a.titulo === 'Parcial')!;
    expect(manual.materiaId).toBe('curso:2756');
    expect(manual.hecho).toBe(false);
  });

  it('acepta el aviso General (materiaId vacío)', async () => {
    expect(await crearAviso({ titulo: 'Feriado', materiaId: '', fecha: '2026-08-17' })).toEqual({
      ok: true,
    });
    const { avisos } = await getDatosLocales();
    expect(avisos.find((a) => a.titulo === 'Feriado')!.materiaId).toBeNull();
  });

  it('pide título y fecha', async () => {
    expect(await crearAviso({ titulo: '  ', materiaId: null, fecha: 'nope' })).toEqual({
      ok: false,
      error: 'Poné un título y una fecha.',
    });
  });

  it('togglea el hecho de un aviso manual y de uno del snapshot', async () => {
    await crearAviso({ titulo: 'Parcial', materiaId: null, fecha: '2026-08-18' });
    const id = (await getDatosLocales()).avisos.find((a) => a.titulo === 'Parcial')!.id;

    expect(await toggleAviso(id, true)).toEqual({ ok: true });
    expect(await toggleAviso('assign:14782', true)).toEqual({ ok: true });

    const { avisos } = await getDatosLocales();
    expect(avisos.find((a) => a.id === id)!.hecho).toBe(true);
    expect(avisos.find((a) => a.id === 'assign:14782')!.hecho).toBe(true);
  });

  it('borra el manual pero no el del aula virtual', async () => {
    await crearAviso({ titulo: 'Parcial', materiaId: null, fecha: '2026-08-18' });
    const id = (await getDatosLocales()).avisos.find((a) => a.titulo === 'Parcial')!.id;

    expect(await eliminarAviso(id)).toEqual({ ok: true });
    expect(await eliminarAviso('assign:14782')).toEqual({
      ok: false,
      error: 'Ese aviso viene del aula virtual.',
    });

    const { avisos } = await getDatosLocales();
    expect(avisos.map((a) => a.id)).toEqual(['assign:14782']);
  });
});

describe('bloques (local)', () => {
  /** Bloques de la materia del snapshot, ya ordenados. */
  const bloques = async () => (await getDatosLocales()).materias[0]!.bloques;

  it('crea bloques de cada tipo y normaliza la URL de los links', async () => {
    expect(await crearBloque('curso:2756', { tipo: 'titulo', texto: 'Unidad 1' })).toEqual({
      ok: true,
    });
    expect(await crearBloque('curso:2756', { tipo: 'link', texto: 'Apunte', url: 'drive.com/x' }))
      .toEqual({ ok: true });

    const lista = await bloques();
    expect(lista.map((b) => b.tipo)).toEqual(['titulo', 'link']);
    expect(lista[1]!.url).toBe('https://drive.com/x'); // normalizarUrl
    expect(lista[0]!.id.startsWith('manual:')).toBe(true);
  });

  it('rechaza un tipo que no existe', async () => {
    expect(
      await crearBloque('curso:2756', {
        tipo: 'kanban' as 'texto',
      })
    ).toEqual({ ok: false, error: 'Datos inválidos.' });
  });

  it('actualiza el texto y el estado de un bloque', async () => {
    await crearBloque('curso:2756', { tipo: 'tarea', texto: 'Leer' });
    const id = (await bloques())[0]!.id;

    expect(await actualizarBloque(id, { texto: 'Leer capítulo 3' })).toEqual({ ok: true });
    expect(await actualizarBloque(id, { estado: 'listo', hecho: true })).toEqual({ ok: true });

    expect((await bloques())[0]).toMatchObject({
      texto: 'Leer capítulo 3',
      estado: 'listo',
      hecho: true,
    });
  });

  it('un patch vacío no falla y uno inválido devuelve el error de datos', async () => {
    await crearBloque('curso:2756', { tipo: 'texto', texto: 'Nota' });
    const id = (await bloques())[0]!.id;
    expect(await actualizarBloque(id, {})).toEqual({ ok: true });
    expect(await actualizarBloque(id, { estado: 'archivado' as 'listo' })).toEqual({
      ok: false,
      error: 'Datos inválidos.',
    });
  });

  it('convierte el tipo de un bloque conservando el texto', async () => {
    // El "Convertir en" del modal de card: cambiar de tipo no vacía lo escrito
    // (el prototipo sí lo vacía, ver spec modal-de-card §2).
    await crearBloque('curso:2756', { tipo: 'texto', texto: 'Apunte del parcial' });
    const id = (await bloques())[0]!.id;

    expect(await actualizarBloque(id, { tipo: 'tarea' })).toEqual({ ok: true });
    expect((await bloques())[0]).toMatchObject({ tipo: 'tarea', texto: 'Apunte del parcial' });

    expect(await actualizarBloque(id, { tipo: 'pagina' as 'texto' })).toEqual({
      ok: false,
      error: 'Datos inválidos.',
    });
    expect((await bloques())[0]).toMatchObject({ tipo: 'tarea' });
  });

  it('avisa cuando el bloque ya no existe', async () => {
    expect(await actualizarBloque('manual:fantasma', { texto: 'x' })).toEqual({
      ok: false,
      error: 'Eso ya no existe.',
    });
    expect(await eliminarBloque('manual:fantasma')).toEqual({
      ok: false,
      error: 'Eso ya no existe.',
    });
  });

  it('elimina un bloque', async () => {
    await crearBloque('curso:2756', { tipo: 'texto', texto: 'Nota' });
    const id = (await bloques())[0]!.id;
    expect(await eliminarBloque(id)).toEqual({ ok: true });
    expect(await bloques()).toHaveLength(0);
  });

  it('reordena con ids locales (no uuid) y acepta la lista vacía', async () => {
    await crearBloque('curso:2756', { tipo: 'texto', texto: 'A' });
    await crearBloque('curso:2756', { tipo: 'texto', texto: 'B' });
    const [a, b] = await bloques();

    expect(await reordenarBloques([])).toEqual({ ok: true });
    expect(
      await reordenarBloques([
        { id: b!.id, orden: 1000 },
        { id: a!.id, orden: 2000 },
      ])
    ).toEqual({ ok: true });

    expect((await bloques()).map((x) => x.texto)).toEqual(['B', 'A']);
  });
});

describe('perfil (local)', () => {
  it('persiste nombre e instituto en datos/perfil.json', async () => {
    expect(await guardarPerfil({ nombre: '  Facundo Costas ', instituto: 'ORT' })).toEqual({
      ok: true,
    });
    expect(await leerPerfilLocal()).toEqual({
      nombre: 'Facundo Costas',
      carrera: null,
      instituto: 'ORT',
      avatarUrl: null,
      sede: null,
      consentimientoEn: null,
    });
  });

  it('pide el nombre con el copy exacto', async () => {
    expect(await guardarPerfil({ nombre: '   ', instituto: '' })).toEqual({
      ok: false,
      error: 'Poné tu nombre así te saludamos.',
    });
    expect(await leerPerfilLocal()).toBeNull();
  });

  it('guardar sin avatarUrl no borra la foto ya guardada', async () => {
    await guardarPerfil({ nombre: 'Facu', instituto: '', avatarUrl: '/api/avatar?v=1' });
    await guardarPerfil({ nombre: 'Facu Costas', instituto: 'ORT' });
    expect(await leerPerfilLocal()).toEqual({
      nombre: 'Facu Costas',
      carrera: null,
      instituto: 'ORT',
      avatarUrl: '/api/avatar?v=1',
      sede: null,
      consentimientoEn: null,
    });
  });
});

describe('foto de perfil (local)', () => {
  const conFoto = (file: File) => {
    const fd = new FormData();
    fd.append('foto', file);
    return fd;
  };

  it('guarda la imagen en disco y devuelve una URL con bust de caché', async () => {
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'yo.png', { type: 'image/png' });
    const r = await guardarAvatarLocal(conFoto(file));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.url).toMatch(/^\/api\/avatar\?v=\d+$/);

    const avatar = await leerAvatarLocal();
    expect(avatar!.contentType).toBe('image/png');
    expect([...avatar!.datos]).toEqual([137, 80, 78, 71]);
  });

  it('rechaza lo que no es una imagen', async () => {
    const pdf = new File([new Uint8Array([1])], 'x.pdf', { type: 'application/pdf' });
    expect(await guardarAvatarLocal(conFoto(pdf))).toEqual({
      ok: false,
      error: 'Elegí una imagen.',
    });
    expect(await guardarAvatarLocal(new FormData())).toEqual({
      ok: false,
      error: 'Elegí una imagen.',
    });
    expect(await leerAvatarLocal()).toBeNull();
  });

  it('rechaza una foto de más de 5 MB', async () => {
    const gorda = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'g.jpg', { type: 'image/jpeg' });
    expect(await guardarAvatarLocal(conFoto(gorda))).toEqual({
      ok: false,
      error: 'La foto pesa demasiado (máx 5 MB).',
    });
    expect(await leerAvatarLocal()).toBeNull();
  });
});
