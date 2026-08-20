import { describe, expect, it } from 'vitest';
import {
  LARGO_TITULO,
  badgeAviso,
  fechaLargaAviso,
  resumenNota,
  tituloDesdeNota,
} from './aviso-nota';

describe('tituloDesdeNota', () => {
  it('usa el texto de la nota tal cual cuando entra', () => {
    expect(tituloDesdeNota('Terminar el TP de integrales')).toBe('Terminar el TP de integrales');
  });

  it('recorta a 60 con puntos suspensivos', () => {
    const largo = 'a'.repeat(80);
    const t = tituloDesdeNota(largo);
    expect(t).toHaveLength(LARGO_TITULO);
    expect(t.endsWith('…')).toBe(true);
  });

  it('un texto de exactamente 60 no se toca', () => {
    const justo = 'a'.repeat(60);
    expect(tituloDesdeNota(justo)).toBe(justo);
  });

  it('una nota vacía o de puros espacios cae al default', () => {
    expect(tituloDesdeNota('')).toBe('Nota sin título');
    expect(tituloDesdeNota('   \n  ')).toBe('Nota sin título');
  });
});

describe('resumenNota', () => {
  const base = {
    id: 'manual:1',
    materiaId: 'curso:1',
    texto: 'Hacer los 5 ejercicios de la guía',
    url: '',
    orden: 1000,
    createdAt: '2026-08-17T02:00:00.000Z',
  };

  it('traduce tipo y estado a lo que muestra el snippet', () => {
    const r = resumenNota({ ...base, tipo: 'tarea', estado: 'proceso', hecho: false });
    expect(r).toEqual({
      texto: 'Hacer los 5 ejercicios de la guía',
      tipo: 'to-do',
      estadoNombre: 'en proceso',
      estadoColor: '#38bdf8',
    });
  });

  it('un bloque hecho se lee como listo aunque su estado diga otra cosa', () => {
    const r = resumenNota({ ...base, tipo: 'texto', estado: 'pendiente', hecho: true });
    expect(r).toMatchObject({ estadoNombre: 'listo', estadoColor: '#34d399' });
  });

  it('una nota sin texto muestra "Sin título"', () => {
    const r = resumenNota({ ...base, texto: '   ', tipo: 'texto', estado: 'pendiente', hecho: false });
    expect(r.texto).toBe('Sin título');
  });
});

describe('badgeAviso', () => {
  it('nombra y pinta cada estado como el handoff', () => {
    expect(badgeAviso('hecho')).toEqual({ texto: 'Hecho', color: '#34d399' });
    expect(badgeAviso('vencido')).toEqual({ texto: 'Vencido', color: 'var(--vencido)' });
    expect(badgeAviso('hoy')).toEqual({ texto: 'Vence hoy', color: 'var(--acc)' });
    expect(badgeAviso('pendiente')).toEqual({ texto: 'Pendiente', color: 'var(--tx2)' });
  });
});

describe('fechaLargaAviso', () => {
  it('pasa el ISO a dd/mm/yyyy', () => {
    expect(fechaLargaAviso('2026-08-19')).toBe('19/08/2026');
  });

  it('lo que no es un ISO vuelve tal cual, sin romperse', () => {
    expect(fechaLargaAviso('')).toBe('');
    expect(fechaLargaAviso('mañana')).toBe('mañana');
  });
});
