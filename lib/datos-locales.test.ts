// Overlays locales. Cada test corre contra un tmpdir propio
// apuntado con CURSADA_DATOS_DIR, así no toca los datos reales de datos/.

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  actualizarBloqueLocal,
  borrarAvatarLocal,
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
  leerAvatarLocal,
  leerPerfilLocal,
  reordenarBloquesLocales,
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

const escribir = async (cual: Parameters<typeof rutaDatos>[0], datos: unknown) =>
  fs.writeFile(rutaDatos(cual), JSON.stringify(datos), 'utf8');

describe('esManual', () => {
  it('distingue las filas del aula virtual de las manuales', () => {
    expect(esManual('manual:2f1a-...')).toBe(true);
    // uuid pelado, sin prefijo de Moodle
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

describe('avisos nacidos de una nota', () => {
  it('guarda notaId y lo devuelve en el merge', async () => {
    const id = await crearAvisoLocal({
      materiaId: 'curso:2756',
      titulo: 'Terminar el TP',
      fecha: '2026-08-25',
      notaId: 'manual:bloque-1',
    });

    const { avisos } = await getDatosLocales();
    expect(avisos.find((a) => a.id === id)).toMatchObject({ notaId: 'manual:bloque-1' });
  });

  it('un aviso sin nota queda con notaId null', async () => {
    const id = await crearAvisoLocal({
      materiaId: null,
      titulo: 'Suelto',
      fecha: '2026-08-25',
    });

    const { avisos } = await getDatosLocales();
    expect(avisos.find((a) => a.id === id)!.notaId).toBeNull();
  });

  it('marcarlo hecho no pierde el vínculo con la nota', async () => {
    const id = await crearAvisoLocal({
      materiaId: 'curso:2756',
      titulo: 'Con nota',
      fecha: '2026-08-25',
      notaId: 'manual:bloque-1',
    });
    await escribirEstadoAviso(id, true);

    const { avisos } = await getDatosLocales();
    expect(avisos.find((a) => a.id === id)).toMatchObject({
      hecho: true,
      notaId: 'manual:bloque-1',
    });
  });
});

describe('bloques.json', () => {
  it('crea bloques con orden en huecos de 1000 y los mergea en la materia', async () => {
    const uno = await crearBloqueLocal('curso:2756', { tipo: 'titulo', texto: 'Unidad 1' });
    const dos = await crearBloqueLocal('curso:2756', { tipo: 'tarea', texto: 'Leer capítulo 3' });
    expect(uno.startsWith('manual:')).toBe(true);

    const guardados = await leer('bloques');
    expect(guardados['curso:2756'].map((b: { orden: number }) => b.orden)).toEqual([1000, 2000]);

    const { materias } = await getDatosLocales();
    expect(materias[0]!.bloques.map((b) => b.id)).toEqual([uno, dos]);
    expect(materias[0]!.bloques[0]).toMatchObject({
      materiaId: 'curso:2756',
      tipo: 'titulo',
      texto: 'Unidad 1',
      estado: 'pendiente',
      hecho: false,
      url: '',
    });
  });

  it('actualiza texto, url, estado y hecho', async () => {
    const id = await crearBloqueLocal('curso:2756', { tipo: 'tarea' });
    expect(await actualizarBloqueLocal(id, { texto: 'Entregar TP', hecho: true, estado: 'listo' }))
      .toBe(true);

    const { materias } = await getDatosLocales();
    expect(materias[0]!.bloques[0]).toMatchObject({
      texto: 'Entregar TP',
      hecho: true,
      estado: 'listo',
    });
  });

  it('devuelve false si el bloque no existe', async () => {
    expect(await actualizarBloqueLocal('manual:no-existe', { texto: 'x' })).toBe(false);
    expect(await eliminarBloqueLocal('manual:no-existe')).toBe(false);
  });

  it('elimina un bloque y limpia la clave de la materia cuando queda vacía', async () => {
    const id = await crearBloqueLocal('curso:2756', { tipo: 'texto', texto: 'Nota' });
    expect(await eliminarBloqueLocal(id)).toBe(true);
    expect(await leer('bloques')).toEqual({});
    expect((await getDatosLocales()).materias[0]!.bloques).toHaveLength(0);
  });

  // El overlay es irrecuperable y el schema descarta lo que no declara: si `fmt`
  // o `ref` no sobreviven a un guardado posterior, se pierden sin aviso.
  it('conserva fmt y ref al releer y al guardar de nuevo', async () => {
    const id = await crearBloqueLocal('curso:2756', {
      tipo: 'texto',
      texto: 'Con cita',
      ref: { tipo: 'materia', id: 'curso:2775' },
    });
    await actualizarBloqueLocal(id, { fmt: { b: true, hl: true } });

    const { materias } = await getDatosLocales();
    expect(materias[0]!.bloques[0]).toMatchObject({
      fmt: { b: true, hl: true },
      ref: { tipo: 'materia', id: 'curso:2775' },
    });

    // Un guardado que no menciona los campos nuevos no los puede borrar.
    await actualizarBloqueLocal(id, { texto: 'Editado' });
    const guardados = await leer('bloques');
    expect(guardados['curso:2756'][0]).toMatchObject({
      texto: 'Editado',
      fmt: { b: true, hl: true },
      ref: { tipo: 'materia', id: 'curso:2775' },
    });
  });

  it('quita la referencia con ref: null', async () => {
    const id = await crearBloqueLocal('curso:2756', {
      tipo: 'texto',
      ref: { tipo: 'modulo', id: 'mod:146532' },
    });
    await actualizarBloqueLocal(id, { ref: null });

    const { materias } = await getDatosLocales();
    expect(materias[0]!.bloques[0]!.ref).toBeNull();
  });

  it('convierte el tipo de un bloque ya escrito sin tocar el texto', async () => {
    const id = await crearBloqueLocal('curso:2756', { tipo: 'texto', texto: 'Leer el TP' });
    expect(await actualizarBloqueLocal(id, { tipo: 'tarea' })).toBe(true);

    const { materias } = await getDatosLocales();
    expect(materias[0]!.bloques[0]).toMatchObject({ tipo: 'tarea', texto: 'Leer el TP' });
  });

  it('un bloque viejo sin fmt ni ref sigue leyéndose', async () => {
    await escribir('bloques', {
      'curso:2756': [
        {
          id: 'manual:viejo',
          materiaId: 'curso:2756',
          tipo: 'texto',
          texto: 'De antes',
          url: '',
          estado: 'pendiente',
          hecho: false,
          orden: 1000,
          createdAt: '2026-08-17T02:18:48.719Z',
        },
      ],
    });

    const { materias } = await getDatosLocales();
    expect(materias[0]!.bloques[0]).toMatchObject({ texto: 'De antes' });
    expect(materias[0]!.bloques[0]!.fmt).toBeUndefined();
  });

  it('reordena por orden', async () => {
    const uno = await crearBloqueLocal('curso:2756', { tipo: 'texto', texto: 'A' });
    const dos = await crearBloqueLocal('curso:2756', { tipo: 'texto', texto: 'B' });

    await reordenarBloquesLocales([
      { id: dos, orden: 1000 },
      { id: uno, orden: 2000 },
    ]);

    const { materias } = await getDatosLocales();
    expect(materias[0]!.bloques.map((b) => b.texto)).toEqual(['B', 'A']);
  });
});

describe('perfil.json', () => {
  it('null mientras no exista el archivo', async () => {
    expect(await leerPerfilLocal()).toBeNull();
  });

  it('escribe y relee el perfil (instituto vacío → null)', async () => {
    await escribirPerfilLocal({ nombre: 'Facundo Costas', instituto: '' });
    expect(await leerPerfilLocal()).toEqual({
      nombre: 'Facundo Costas',
      carrera: null,
      instituto: null,
      avatarUrl: null,
      sede: null,
      consentimientoEn: null,
      onboardingEn: null,
    });

    await escribirPerfilLocal({ nombre: 'Facu', instituto: 'ORT' });
    expect(await leerPerfilLocal()).toMatchObject({ nombre: 'Facu', instituto: 'ORT' });
  });

  it('sin avatarUrl conserva la foto guardada', async () => {
    await escribirPerfilLocal({
      nombre: 'Facu',
      instituto: 'ORT',
      avatarUrl: '/api/avatar?v=1',
    });
    await escribirPerfilLocal({ nombre: 'Facu Costas', instituto: 'ORT' });
    expect(await leerPerfilLocal()).toEqual({
      nombre: 'Facu Costas',
      carrera: null,
      instituto: 'ORT',
      avatarUrl: '/api/avatar?v=1',
      sede: null,
      consentimientoEn: null,
      onboardingEn: null,
    });
  });
});

describe('avatar en disco', () => {
  it('mapea el mime a extensión y rechaza lo que no es imagen conocida', () => {
    expect(extensionAvatar('image/jpeg')).toBe('jpg');
    expect(extensionAvatar('image/png')).toBe('png');
    expect(extensionAvatar('application/pdf')).toBeNull();
  });

  it('escribe, sirve y reemplaza la foto aunque cambie la extensión', async () => {
    expect(await leerAvatarLocal()).toBeNull();

    await escribirAvatarLocal(new Uint8Array([1, 2, 3]), 'png');
    const png = await leerAvatarLocal();
    expect(png!.contentType).toBe('image/png');
    expect([...png!.datos]).toEqual([1, 2, 3]);

    // La foto nueva borra la anterior: nunca queda más de un avatar.*
    await escribirAvatarLocal(new Uint8Array([9]), 'jpg');
    expect((await fs.readdir(dir)).filter((f) => f.startsWith('avatar.'))).toEqual(['avatar.jpg']);
    expect((await leerAvatarLocal())!.contentType).toBe('image/jpeg');

    await borrarAvatarLocal();
    expect(await leerAvatarLocal()).toBeNull();
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

describe('finalización: del snapshot a la app', () => {
  // Este bug ya pasó una vez: `hecho` y `requisitos` se agregaron al snapshot y
  // al tipo de dominio, pero NO al schema de lectura ni al mapeo de módulos.
  // Zod descarta lo que no declara y el mapeo copia campo por campo, así que el
  // dato se perdía DOS veces, en silencio y sin romper ningún test.
  const conFinalizacion = {
    ...SNAPSHOT,
    materias: [
      {
        ...SNAPSHOT.materias[0],
        secciones: [
          {
            nombre: 'Unidad 1',
            modulos: [
              {
                id: 'mod:1',
                nombre: 'Visto',
                tipo: 'resource',
                url: 'https://aula/mod/resource/view.php?id=1',
                hecho: true,
                requisitos: [{ texto: 'Ver', cumplido: true }],
              },
              {
                id: 'mod:2',
                nombre: 'Pendiente',
                tipo: 'assign',
                url: 'https://aula/mod/assign/view.php?id=2',
                hecho: false,
                requisitos: [{ texto: 'Hacer un envío', cumplido: false }],
              },
              {
                id: 'mod:3',
                nombre: 'Sin seguimiento',
                tipo: 'url',
                url: 'https://aula/mod/url/view.php?id=3',
              },
            ],
          },
        ],
      },
    ],
  };

  it('conserva hecho=true, hecho=false y la ausencia de seguimiento', async () => {
    await fs.writeFile(rutaDatos('snapshot'), JSON.stringify(conFinalizacion), 'utf8');

    const { materias } = await getDatosLocales();
    const modulos = materias[0]?.secciones?.[0]?.modulos ?? [];

    // `false` es el que se perdía con el patrón truthy del resto del mapeo.
    expect(modulos.map((m) => m.hecho)).toEqual([true, false, undefined]);
  });

  it('conserva las condiciones de finalización con su estado', async () => {
    await fs.writeFile(rutaDatos('snapshot'), JSON.stringify(conFinalizacion), 'utf8');

    const { materias } = await getDatosLocales();
    const modulos = materias[0]?.secciones?.[0]?.modulos ?? [];

    expect(modulos[0]?.requisitos).toEqual([{ texto: 'Ver', cumplido: true }]);
    expect(modulos[1]?.requisitos).toEqual([{ texto: 'Hacer un envío', cumplido: false }]);
    expect(modulos[2]?.requisitos).toBeUndefined();
  });
});
