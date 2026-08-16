// Overlays locales (modo sin Supabase). Cada test corre contra un tmpdir propio
// apuntado con CURSADA_DATOS_DIR, así no toca los datos reales de datos/.

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  crearArchivoLocal,
  crearAvisoLocal,
  eliminarArchivoLocal,
  eliminarAvisoLocal,
  escribirEstadoAviso,
  escribirHorariosLocales,
  escribirMateriaExtra,
  getDatosLocales,
  rutaDatos,
} from '@/lib/datos-locales';
import { esManual } from '@/lib/types';

const SNAPSHOT = {
  generado: '2026-08-16T20:00:00.000Z',
  materias: [
    {
      id: 'curso:2756',
      nombre: 'Base de Datos',
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
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cursada-'));
  process.env.CURSADA_DATOS_DIR = dir;
  await fs.writeFile(rutaDatos('snapshot'), JSON.stringify(SNAPSHOT), 'utf8');
});

afterEach(async () => {
  delete process.env.CURSADA_DATOS_DIR;
  await fs.rm(dir, { recursive: true, force: true });
});

const leer = async (cual: Parameters<typeof rutaDatos>[0]) =>
  JSON.parse(await fs.readFile(rutaDatos(cual), 'utf8'));

describe('esManual', () => {
  it('distingue las filas del aula virtual de las manuales', () => {
    expect(esManual('manual:2f1a-...')).toBe(true);
    // uuid pelado = fila de Supabase
    expect(esManual('7b7b1f8e-0f6a-4a1f-9f0e-1f2a3b4c5d6e')).toBe(true);
    expect(esManual('mod:9001')).toBe(false);
    expect(esManual('assign:14782')).toBe(false);
    expect(esManual('curso:2756')).toBe(false);
  });
});

describe('materias-extra.json', () => {
  it('mergea profe/aula/color sobre la materia del snapshot', async () => {
    const antes = await getDatosLocales();
    expect(antes.materias[0]).toMatchObject({ profe: '', aula: '', color: '#38bdf8' });

    await escribirMateriaExtra('curso:2756', {
      profe: 'Pérez',
      aula: 'Aula 12',
      color: '#a78bfa',
    });

    expect(await leer('materiasExtra')).toEqual({
      'curso:2756': { profe: 'Pérez', aula: 'Aula 12', color: '#a78bfa' },
    });

    const despues = await getDatosLocales();
    expect(despues.materias[0]).toMatchObject({
      nombre: 'Base de Datos',
      profe: 'Pérez',
      aula: 'Aula 12',
      color: '#a78bfa',
    });
  });

  it('sin color propio se queda con el del snapshot', async () => {
    await escribirMateriaExtra('curso:2756', { profe: 'Solo profe' });
    const { materias } = await getDatosLocales();
    expect(materias[0]!.color).toBe('#38bdf8');
    expect(materias[0]!.profe).toBe('Solo profe');
  });
});

describe('horarios.json', () => {
  it('escribe y borra los horarios de una materia', async () => {
    await escribirHorariosLocales('curso:2756', [{ dia: 4, inicio: '19:50', fin: '21:30' }]);
    let { materias } = await getDatosLocales();
    expect(materias[0]!.horarios).toHaveLength(1);
    expect(materias[0]!.horarios[0]).toMatchObject({ dia: 4, inicio: '19:50', fin: '21:30' });

    await escribirHorariosLocales('curso:2756', []);
    ({ materias } = await getDatosLocales());
    expect(materias[0]!.horarios).toHaveLength(0);
    expect(await leer('horarios')).toEqual({});
  });
});

describe('archivos-manuales.json', () => {
  it('crea, lista junto a los de Moodle y elimina', async () => {
    const id = await crearArchivoLocal('curso:2756', {
      nombre: 'Resumen propio',
      url: 'https://drive/x',
    });
    expect(id.startsWith('manual:')).toBe(true);
    expect(esManual(id)).toBe(true);

    const { materias } = await getDatosLocales();
    expect(materias[0]!.archivos.map((a) => a.id)).toEqual(['mod:9001', id]);
    expect(materias[0]!.archivos[1]).toMatchObject({
      materiaId: 'curso:2756',
      nombre: 'Resumen propio',
      url: 'https://drive/x',
    });

    expect(await eliminarArchivoLocal(id)).toBe(true);
    // La clave de la materia se limpia cuando queda vacía.
    expect(await leer('archivosManuales')).toEqual({});
    const despues = await getDatosLocales();
    expect(despues.materias[0]!.archivos.map((a) => a.id)).toEqual(['mod:9001']);
  });

  it('no borra los archivos del snapshot', async () => {
    expect(await eliminarArchivoLocal('mod:9001')).toBe(false);
    const { materias } = await getDatosLocales();
    expect(materias[0]!.archivos.map((a) => a.id)).toEqual(['mod:9001']);
  });
});

describe('avisos-manuales.json', () => {
  it('crea un aviso manual y lo ordena junto a los del snapshot', async () => {
    const id = await crearAvisoLocal({
      materiaId: 'curso:2756',
      titulo: 'Parcial',
      fecha: '2026-08-18',
    });
    expect(id.startsWith('manual:')).toBe(true);

    const { avisos } = await getDatosLocales();
    // 18/08 antes que 20/08
    expect(avisos.map((a) => a.titulo)).toEqual(['Parcial', 'TP1']);
    expect(avisos[0]).toMatchObject({ id, materiaId: 'curso:2756', hecho: false });
  });

  it('acepta materiaId null (aviso General)', async () => {
    await crearAvisoLocal({ materiaId: null, titulo: 'Feriado', fecha: '2026-08-17' });
    const { avisos } = await getDatosLocales();
    expect(avisos[0]).toMatchObject({ titulo: 'Feriado', materiaId: null });
  });

  it('el toggle "hecho" funciona igual para manuales y de snapshot', async () => {
    const id = await crearAvisoLocal({
      materiaId: null,
      titulo: 'Manual',
      fecha: '2026-08-19',
    });
    await escribirEstadoAviso(id, true);
    await escribirEstadoAviso('assign:14782', true);

    const { avisos } = await getDatosLocales();
    expect(avisos.find((a) => a.id === id)!.hecho).toBe(true);
    expect(avisos.find((a) => a.id === 'assign:14782')!.hecho).toBe(true);
    expect(await leer('avisosEstado')).toEqual({ [id]: true, 'assign:14782': true });
  });

  it('elimina el aviso manual y su estado; no toca los del snapshot', async () => {
    const id = await crearAvisoLocal({ materiaId: null, titulo: 'X', fecha: '2026-08-19' });
    await escribirEstadoAviso(id, true);

    expect(await eliminarAvisoLocal(id)).toBe(true);
    expect(await leer('avisosManuales')).toEqual([]);
    expect(await leer('avisosEstado')).toEqual({});

    expect(await eliminarAvisoLocal('assign:14782')).toBe(false);
    const { avisos } = await getDatosLocales();
    expect(avisos.map((a) => a.id)).toEqual(['assign:14782']);
  });
});

describe('caché', () => {
  it('refleja escrituras sucesivas sin quedarse con datos viejos', async () => {
    await getDatosLocales();
    await escribirMateriaExtra('curso:2756', { profe: 'Uno' });
    expect((await getDatosLocales()).materias[0]!.profe).toBe('Uno');
    await escribirMateriaExtra('curso:2756', { profe: 'Dos' });
    expect((await getDatosLocales()).materias[0]!.profe).toBe('Dos');
  });

  it('sin overlays no crea archivos de más', async () => {
    await getDatosLocales();
    expect(await fs.readdir(dir)).toEqual(['aula-virtual.json']);
  });
});
