// Seed sintético del panel admin — SOLO para dev sin Supabase (specs/panel-admin
// R2). Ningún dato es real; los nombres son inventados. En producción sin
// Supabase la página devuelve 404 y esto no se importa nunca desde el cliente.

import { armarStats, armarUsuario, type UsuarioCrudo } from '@/lib/admin-calculos';
import type { PanelAdmin } from '@/lib/admin-metricas';

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

export function panelDemo(ahora: Date): PanelAdmin {
  const t = ahora.getTime();
  const iso = (hace: number) => new Date(t - hace).toISOString();

  const base: Omit<UsuarioCrudo, 'id' | 'nombre' | 'usuario' | 'ultimaVisita'> = {
    carrera: 'Analista de Sistemas',
    avatarUrl: null,
    materias: 5,
    notas: 48,
    notasHoy: 6,
    tareasHechas: 12,
    tareasTotal: 19,
    archivos: 14,
    avisosPend: 3,
    avisosVencidos: 0,
    porMateria: [
      { nombre: 'Programación II', notas: 18 },
      { nombre: 'Análisis Matemático', notas: 14 },
      { nombre: 'Base de Datos', notas: 9 },
      { nombre: 'Inglés Técnico', notas: 4 },
      { nombre: 'Práctica Profesional', notas: 3 },
    ],
    eventos: [],
    sync: { ok: true, cuando: iso(2 * HORA) },
    sesionIniciadaHoy: null,
  };

  const crudos: UsuarioCrudo[] = [
    {
      ...base,
      id: 'demo-1',
      nombre: 'Federica Álvarez',
      usuario: 'falvarez',
      ultimaVisita: iso(5 * MIN),
      sesionIniciadaHoy: iso(42 * MIN),
      eventos: [
        { ts: iso(4 * MIN), evento: 'nota_creada', datos: { curso: 'Análisis Matemático' } },
        { ts: iso(31 * MIN), evento: 'sync_ok', datos: { cursos: 5 } },
        { ts: iso(42 * MIN), evento: 'sesion_iniciada', datos: {} },
      ],
    },
    {
      ...base,
      id: 'demo-2',
      nombre: 'Sofía Benítez',
      usuario: 'sbenitez',
      ultimaVisita: iso(17 * MIN),
      notas: 31,
      notasHoy: 3,
      tareasHechas: 8,
      tareasTotal: 10,
      avisosPend: 1,
      sesionIniciadaHoy: iso(17 * MIN),
      eventos: [
        { ts: iso(2 * MIN), evento: 'sync_ok', datos: { cursos: 6 } },
        { ts: iso(17 * MIN), evento: 'sesion_iniciada', datos: {} },
      ],
      sync: { ok: true, cuando: iso(40 * MIN) },
    },
    {
      ...base,
      id: 'demo-3',
      nombre: 'Martín Correa',
      usuario: 'mcorrea',
      carrera: 'Desarrollo de Software',
      ultimaVisita: iso(2 * HORA),
      notas: 12,
      notasHoy: 1,
      tareasHechas: 2,
      tareasTotal: 9,
      avisosPend: 5,
      avisosVencidos: 2,
      eventos: [{ ts: iso(2 * HORA), evento: 'sesion_iniciada', datos: {} }],
      sync: { ok: false, cuando: iso(6 * HORA) },
    },
    {
      ...base,
      id: 'demo-4',
      nombre: 'Joaquín Herrera',
      usuario: 'jherrera',
      carrera: 'Desarrollo de Software',
      ultimaVisita: iso(3 * DIA),
      notas: 7,
      notasHoy: 0,
      tareasHechas: 1,
      tareasTotal: 4,
      avisosPend: 2,
      avisosVencidos: 5,
      eventos: [{ ts: iso(3 * DIA), evento: 'sesion_iniciada', datos: {} }],
      sync: null,
    },
  ];

  return {
    generado: ahora.toISOString(),
    stats: armarStats(crudos, ahora),
    usuarios: crudos.map((u) => armarUsuario(u, ahora)),
  };
}
