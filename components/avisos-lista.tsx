'use client';

import { Check } from 'lucide-react';
import { useOptimistic, useTransition } from 'react';
import { toggleAviso } from '@/app/actions';
import { estadoAviso } from '@/lib/cursada';
import type { Aviso } from '@/lib/types';

/** 'YYYY-MM-DD' → 'dd/mm'. */
const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

export type MateriaChip = { id: string; nombre: string; color: string };

type Props = {
  /** Avisos ordenados por fecha ascendente (como los devuelve la query). */
  avisos: Aviso[];
  materias: MateriaChip[];
  /** Instante del render en el server (evita desajuste de hidratación). */
  ahoraIso: string;
};

/** Lista de avisos con toggle optimista: pendientes por fecha asc + sección Hechos. */
export function AvisosLista({ avisos, materias, ahoraIso }: Props) {
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
              <button
                key={a.id}
                type="button"
                onClick={() => alternar(a)}
                className="flex min-h-[58px] w-full cursor-pointer items-center gap-3 rounded-[13px] border border-bor bg-sup px-[14px] py-[10px] text-left text-tx"
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
            );
          })}
        </div>
      )}

      {hechos.length > 0 && (
        <div className="mt-7">
          <div className="kicker mb-[10px] tracking-[0.16em]">Hechos</div>
          <div className="flex flex-col gap-2">
            {hechos.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => alternar(a)}
                className="flex min-h-[54px] w-full cursor-pointer items-center gap-3 rounded-[13px] border border-bor bg-sup px-[14px] py-[10px] text-left text-tx opacity-50"
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
            ))}
          </div>
        </div>
      )}
    </>
  );
}
