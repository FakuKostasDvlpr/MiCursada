'use client';

import { ArrowUpRight, Check, FileText, Trash2 } from 'lucide-react';
import { useOptimistic, useState, useTransition } from 'react';
import {
  crearArchivo,
  crearAviso,
  eliminarArchivo,
  eliminarAviso,
  toggleAviso,
} from '@/app/actions';
import { NotasEditor } from '@/components/notas-editor';
import { estadoAviso, hoyISO } from '@/lib/cursada';
import { esManual, type Aviso, type Materia } from '@/lib/types';

/** 'YYYY-MM-DD' → 'dd/mm'. */
const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

type Tab = 'notas' | 'archivos' | 'avisos';

type Props = {
  materia: Materia;
  /** Avisos de esta materia, ordenados por fecha ascendente. */
  avisos: Aviso[];
};

const claseInput =
  'w-full min-h-[46px] rounded-xl border border-bor bg-sup px-[14px] text-[14.5px] text-tx';

const claseVacio =
  'mt-[14px] rounded-[14px] border border-dashed border-bor p-5 text-center text-[13.5px] text-tx3';

/** Tabs del detalle de materia: Notas (editor de bloques con menú de comandos),
 *  Archivos (alta inline + lista) y Avisos (alta inline + lista con toggle). */
export function MateriaDetalle({ materia, avisos }: Props) {
  const [tab, setTab] = useState<Tab>('notas');

  const notas = materia.bloques.filter((b) => b.tipo !== 'divisor').length;
  const pendientes = avisos.filter((a) => !a.hecho).length;

  const tabs: { id: Tab; label: string; n: number }[] = [
    { id: 'notas', label: 'Notas', n: notas },
    { id: 'archivos', label: 'Archivos', n: materia.archivos.length },
    { id: 'avisos', label: 'Avisos', n: pendientes },
  ];

  return (
    <>
      <div className="mt-6 flex border-b border-bor">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={`-mb-px min-h-12 flex-1 cursor-pointer border-b-2 px-1 py-3 text-[13.5px] font-bold ${
              tab === t.id ? 'border-acc text-acc' : 'border-transparent text-tx3'
            }`}
          >
            {t.label} <span className="font-mono text-[11px] opacity-85">{t.n}</span>
          </button>
        ))}
      </div>

      {tab === 'notas' && <NotasEditor materiaId={materia.id} bloques={materia.bloques} />}
      {tab === 'archivos' && <TabArchivos materia={materia} />}
      {tab === 'avisos' && <TabAvisos materiaId={materia.id} avisos={avisos} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Archivos — alta inline + lista de links
// ---------------------------------------------------------------------------

function TabArchivos({ materia }: { materia: Materia }) {
  const [nombre, setNombre] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const agregar = async () => {
    setGuardando(true);
    setError('');
    const resultado = await crearArchivo(materia.id, { nombre: nombre.trim(), url: url.trim() });
    setGuardando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setNombre('');
    setUrl('');
  };

  const borrar = async (id: string) => {
    setError('');
    const resultado = await eliminarArchivo(id);
    if (!resultado.ok) setError(resultado.error);
  };

  return (
    <div className="mt-4">
      <div className="flex flex-col gap-2">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre (ej: Guía 5 PDF)"
          className={claseInput}
        />
        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Pegá el link acá"
            className={`${claseInput} min-w-0 flex-1`}
          />
          <button
            type="button"
            onClick={agregar}
            disabled={guardando}
            className="min-h-[46px] shrink-0 cursor-pointer rounded-xl bg-acc-bg px-4 text-sm font-bold text-acc-fg disabled:opacity-60"
          >
            Agregar
          </button>
        </div>
        {error && <div className="text-[13px] text-vencido">{error}</div>}
      </div>

      {materia.archivos.length === 0 ? (
        <div className={claseVacio}>
          Sin archivos todavía. Guardá los PDFs y links de la materia acá.
        </div>
      ) : (
        <div className="mt-[14px] flex flex-col gap-2">
          {materia.archivos.map((f) => (
            <div
              key={f.id}
              className="flex min-h-[54px] items-center rounded-xl border border-bor bg-sup"
            >
              <a
                href={f.url}
                target="_blank"
                rel="noopener"
                className="flex min-w-0 flex-1 items-center gap-3 px-[14px] py-3"
              >
                <FileText size={16} strokeWidth={2} aria-hidden className="shrink-0 text-tx3" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-acc">{f.nombre}</span>
                  <span className="mt-[2px] block truncate font-mono text-[11px] text-tx3">
                    {f.url}
                  </span>
                </span>
                <ArrowUpRight size={15} strokeWidth={2} aria-hidden className="shrink-0 text-tx3" />
              </a>
              {/* Los archivos del aula virtual los regenera el sync: no se borran. */}
              {esManual(f.id) && (
                <button
                  type="button"
                  onClick={() => borrar(f.id)}
                  aria-label={`Eliminar ${f.nombre}`}
                  className="tactil mr-[6px] grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-xl text-tx3"
                >
                  <Trash2 size={15} strokeWidth={2} aria-hidden />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Avisos — alta inline + lista (sin subfila de materia), hechos al final
// ---------------------------------------------------------------------------

function TabAvisos({ materiaId, avisos }: { materiaId: string; avisos: Aviso[] }) {
  const [titulo, setTitulo] = useState('');
  const [fecha, setFecha] = useState(() => hoyISO(new Date()));
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const [, startTransition] = useTransition();
  const [optimistas, aplicar] = useOptimistic(
    avisos,
    (prev, cambio: { id: string; hecho: boolean }) =>
      prev.map((a) => (a.id === cambio.id ? { ...a, hecho: cambio.hecho } : a))
  );

  const ahora = new Date();
  const pendientes = optimistas.filter((a) => !a.hecho);
  const hechos = optimistas.filter((a) => a.hecho).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

  const alternar = (aviso: Aviso) => {
    startTransition(async () => {
      aplicar({ id: aviso.id, hecho: !aviso.hecho });
      await toggleAviso(aviso.id, !aviso.hecho);
    });
  };

  const agregar = async () => {
    if (!titulo.trim() || !fecha) {
      setError('Poné un título y una fecha.');
      return;
    }
    setGuardando(true);
    setError('');
    const resultado = await crearAviso({ titulo: titulo.trim(), materiaId, fecha });
    setGuardando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setTitulo('');
    setFecha(hoyISO(new Date()));
  };

  const borrar = async (id: string) => {
    setError('');
    const resultado = await eliminarAviso(id);
    if (!resultado.ok) setError(resultado.error);
  };

  const fila = (a: Aviso, hecho: boolean) => {
    const estado = estadoAviso(a, ahora);
    return (
      <div
        key={a.id}
        className={`flex min-h-[54px] items-center rounded-[13px] border border-bor bg-sup ${
          hecho ? 'opacity-50' : ''
        }`}
      >
      <button
        type="button"
        onClick={() => alternar(a)}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-[14px] py-[10px] text-left text-tx"
      >
        {hecho ? (
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-bor2 bg-bor2">
            <Check size={11} strokeWidth={3.5} aria-hidden className="text-sup" />
          </span>
        ) : (
          <span aria-hidden className="h-5 w-5 shrink-0 rounded-full border-2 border-bor2" />
        )}
        <span
          className={`min-w-0 flex-1 truncate text-[14.5px] font-semibold ${
            hecho ? 'line-through' : ''
          }`}
        >
          {a.titulo}
        </span>
        <span
          className={`font-mono text-xs whitespace-nowrap ${
            !hecho && estado === 'vencido'
              ? 'text-vencido'
              : !hecho && estado === 'hoy'
                ? 'text-acc'
                : 'text-tx3'
          }`}
        >
          {ddmm(a.fecha)}
          {!hecho && (estado === 'vencido' ? ' · vencido' : estado === 'hoy' ? ' · hoy' : '')}
        </span>
      </button>
        {/* Los avisos del aula virtual los regenera el sync: no se borran. */}
        {esManual(a.id) && (
          <button
            type="button"
            onClick={() => borrar(a.id)}
            aria-label={`Eliminar ${a.titulo}`}
            className="tactil mr-[6px] grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-xl text-tx3"
          >
            <Trash2 size={15} strokeWidth={2} aria-hidden />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="mt-4">
      <div className="flex flex-col gap-2">
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Título (ej: Entrega del TP)"
          className={claseInput}
        />
        <div className="flex gap-2">
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            aria-label="Fecha"
            className="min-h-[46px] min-w-0 flex-1 rounded-xl border border-bor bg-sup px-[14px] font-mono text-sm text-tx"
          />
          <button
            type="button"
            onClick={agregar}
            disabled={guardando}
            className="min-h-[46px] shrink-0 cursor-pointer rounded-xl bg-acc-bg px-4 text-sm font-bold text-acc-fg disabled:opacity-60"
          >
            Agregar
          </button>
        </div>
        {error && <div className="text-[13px] text-vencido">{error}</div>}
      </div>

      {pendientes.length === 0 ? (
        <div className={claseVacio}>Nada pendiente para esta materia.</div>
      ) : (
        <div className="mt-[14px] flex flex-col gap-2">{pendientes.map((a) => fila(a, false))}</div>
      )}

      {hechos.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">{hechos.map((a) => fila(a, true))}</div>
      )}
    </div>
  );
}
