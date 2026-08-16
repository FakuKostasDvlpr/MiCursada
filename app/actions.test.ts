// Ruta local de las Server Actions (sin Supabase configurado): que persistan de
// verdad en datos/ y devuelvan el copy exacto. Cada test usa su propio tmpdir.

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import {
  actualizarMateria,
  crearArchivo,
  crearAviso,
  eliminarArchivo,
  eliminarAviso,
  toggleAviso,
} from '@/app/actions';
import { getDatosLocales, rutaDatos } from '@/lib/datos-locales';

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
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  await fs.writeFile(rutaDatos('snapshot'), JSON.stringify(SNAPSHOT), 'utf8');
});

afterEach(async () => {
  delete process.env.CURSADA_DATOS_DIR;
  await fs.rm(dir, { recursive: true, force: true });
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
