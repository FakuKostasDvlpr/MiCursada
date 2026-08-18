'use client';

import { Check, Trash2 } from 'lucide-react';
import { useOptimistic, useState, useTransition } from 'react';
import { eliminarAviso, toggleAviso } from '@/app/actions';
import { NotaAviso } from '@/components/nota-aviso';
import type { ResumenNota } from '@/lib/aviso-nota';
import { estadoAviso } from '@/lib/cursada';
import { esManual, type Aviso } from '@/lib/types';

/** 'YYYY-MM-DD' → 'dd/mm'. */
const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

export type MateriaChip = { id: string; nombre: string; color: string };

type Props = {
  /** Avisos ordenados por fecha ascendente (como los devuelve la query). */
  avisos: Aviso[];
  materias: MateriaChip[];
  /** Resumen de la nota que originó cada aviso, por id de aviso. */
  notas?: Record<string, ResumenNota>;
  /** Instante del render en el server (evita desajuste de hidratación). */
  ahoraIso: string;
};

/** Lista de avisos con toggle optimista: pendientes por fecha asc + sección Hechos. */
export function AvisosLista({ avisos, materias, notas = {}, ahoraIso }: Props) {
  const [error, setError] = useState('');
  const [, startTransition] = useTransition();
  const [optimistas, aplicar] = useOptimistic(
    avisos,
    (prev, cambio: { id: string; hecho: boolean }) =>
      prev.map((a) => (a.id === cambio.id ? { ...a, hecho: cambio.hecho } : a))
  );

  const ahora = new Date(ahoraIso);
  const pendientes = optimistas.filter((a) => !a.hecho);
  const hechos = optimistas
    .filter((a) => a.hecho)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

  const alternar = (aviso: Aviso) => {
    startTransition(async () => {
      aplicar({ id: aviso.id, hecho: !aviso.hecho });
      await toggleAviso(aviso.id, !aviso.hecho);
    });
  };

  const borrar = async (a: Aviso) => {
    setError('');
    const resultado = await eliminarAviso(a.id);
    if (!resultado.ok) setError(resultado.error);
  };

  /* Los avisos del aula virtual los regenera el sync: no se borran. */
  const botonBorrar = (a: Aviso) =>
    esManual(a.id) ? (
      <button
        type="button"
        onClick={() => borrar(a)}
        aria-label={`Eliminar ${a.titulo}`}
        className="tactil mr-[6px] grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-xl text-tx3"
      >
        <Trash2 size={15} strokeWidth={2} aria-hidden />
      </button>
    ) : null;

  /**
   * El snippet de la nota vinculada. Va FUERA del botón de la fila: el
   * prototipo lo mete adentro y eso es un interactivo dentro de otro.
   */
  const snippet = (a: Aviso) => {
    const nota = notas[a.id];
    if (!nota) return null;
    const materia = materias.find((m) => m.id === a.materiaId) ?? null;
    return (
      <div className="px-[14px] pb-[10px]">
        <NotaAviso {...nota} color={materia?.color ?? '#64748b'} />
      </div>
    );
  };

  const subfila = (a: Aviso) => {
    const materia = materias.find((m) => m.id === a.materiaId) ?? null;
    return (
      <span className="mt-[3px] flex items-center gap-[6px]">
        <span
          aria-hidden
          className="h-[6px] w-[6px] rounded-full"
          style={{ background: materia?.color ?? '#64748b' }}
        />
        <span className="text-xs text-tx3">{materia?.nombre ?? 'General'}</span>
      </span>
    );
  };

  return (
    <>
      {pendientes.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-bor px-5 py-7 text-center text-[13.5px] text-tx3">
          Nada pendiente. Tranquilo.
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-2">
          {pendientes.map((a) => {
            const estado = estadoAviso(a, ahora);
            return (
              <div key={a.id} className="rounded-[13px] border border-bor bg-sup">
              <div className="flex min-h-[58px] items-center">
              <button
                type="button"
                onClick={() => alternar(a)}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-[14px] py-[10px] text-left text-tx"
              >
                <span
                  aria-hidden
                  className="h-5 w-5 shrink-0 rounded-full border-2 border-bor2"
                />
                <span className="block min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-semibold">{a.titulo}</span>
                  {subfila(a)}
                </span>
                <span
                  className={`font-mono text-xs whitespace-nowrap ${
                    estado === 'vencido'
                      ? 'text-vencido'
                      : estado === 'hoy'
                        ? 'text-acc'
                        : 'text-tx3'
                  }`}
                >
                  {ddmm(a.fecha)}
                  {estado === 'vencido' ? ' · vencido' : estado === 'hoy' ? ' · hoy' : ''}
                </span>
              </button>
                {botonBorrar(a)}
              </div>
                {snippet(a)}
              </div>
            );
          })}
        </div>
      )}

      {hechos.length > 0 && (
        <div className="mt-7">
          <div className="kicker mb-[10px] tracking-[0.16em]">Hechos</div>
          <div className="flex flex-col gap-2">
            {hechos.map((a) => (
              <div key={a.id} className="rounded-[13px] border border-bor bg-sup opacity-50">
              <div className="flex min-h-[54px] items-center">
              <button
                type="button"
                onClick={() => alternar(a)}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-[14px] py-[10px] text-left text-tx"
              >
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-bor2 bg-bor2">
                  <Check size={11} strokeWidth={3.5} aria-hidden className="text-sup" />
                </span>
                <span className="block min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-semibold line-through">
                    {a.titulo}
                  </span>
                  {subfila(a)}
                </span>
                <span className="font-mono text-xs whitespace-nowrap text-tx3">
                  {ddmm(a.fecha)}
                </span>
              </button>
                {botonBorrar(a)}
              </div>
                {snippet(a)}
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <div className="mt-4 text-[13px] text-vencido">{error}</div>}
    </>
  );
}
