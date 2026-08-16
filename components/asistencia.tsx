'use client';

import { ArrowUpRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { clasesDeHoy, estadoAsistencia, type EstadoAsistencia } from '@/lib/cursada';
import type { Materia } from '@/lib/types';

/**
 * El aula virtual de este instituto NO expone attendance por web service: la app
 * solo RECUERDA y REDIRIGE. Nada de acá marca el presente por su cuenta.
 */

/** Hint del pie del tile: la app no marca nada, solo abre el aula virtual. */
export const HINT_ASISTENCIA = 'Se abre en el aula virtual';

type LinkProps = {
  url: string;
  /** Estilo ámbar cuando la ventana está activa. */
  destacado: boolean;
  /** Nombre de la materia, para el aria-label. */
  materia: string;
};

/** Link "Dar el presente": abre el módulo de asistencia en una pestaña nueva. */
export function LinkPresente({ url, destacado, materia }: LinkProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      aria-label={`Dar el presente en ${materia} (abre el aula virtual)`}
      className={`tactil flex min-h-[38px] shrink-0 items-center gap-[5px] rounded-xl px-[10px] text-[12.5px] font-bold whitespace-nowrap ${
        destacado
          ? 'bg-acc-bg !text-acc-fg'
          : 'border border-bor2 bg-transparent !text-tx2'
      }`}
    >
      Dar el presente
      <ArrowUpRight size={13} strokeWidth={2.5} aria-hidden className="shrink-0" />
    </a>
  );
}

type FilaProps = {
  materia: Materia;
  horario: { inicio: string; fin: string };
  estado: EstadoAsistencia;
};

/** Una clase de hoy dentro del tile de asistencia. */
export function FilaAsistencia({ materia, horario, estado }: FilaProps) {
  return (
    <div
      className={`flex min-h-[54px] items-center gap-3 rounded-xl border bg-bg px-3 py-[10px] ${
        estado.activa ? 'border-acc' : 'border-bor'
      } ${estado.fase === 'terminada' ? 'opacity-40' : ''}`}
    >
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: materia.color }}
      />
      <span className="block min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{materia.nombre}</span>
        <span className="mt-[3px] block truncate font-mono text-[11.5px] whitespace-nowrap text-tx3">
          {horario.inicio}–{horario.fin}
        </span>
        <span
          className={`mt-[2px] block truncate font-mono text-[11.5px] whitespace-nowrap ${
            estado.activa ? 'text-acc' : 'text-tx4'
          }`}
        >
          {estado.texto}
        </span>
      </span>
      {materia.asistenciaUrl && (
        <LinkPresente
          url={materia.asistenciaUrl}
          destacado={estado.activa}
          materia={materia.nombre}
        />
      )}
    </div>
  );
}

/**
 * Tile ancho de la pantalla Hoy. Solo aparece los días que cursás: si no hay
 * clases hoy, no se renderiza nada. `ahora` viene del tick de 30s de HoyLive.
 */
export function TileAsistencia({ materias, ahora }: { materias: Materia[]; ahora: Date }) {
  const clases = clasesDeHoy(materias, ahora).filter((c) => c.materia.asistenciaUrl);
  if (clases.length === 0) return null;

  return (
    <div
      data-test="tile-asistencia"
      className="col-span-full rounded-2xl border border-bor bg-sup p-[14px] min-[641px]:col-[1/-1]"
    >
      <div className="kicker mb-[10px] tracking-[0.16em]">Asistencia</div>
      <div className="flex flex-col gap-[6px]">
        {clases.map((c) => (
          <FilaAsistencia
            key={c.horario.id}
            materia={c.materia}
            horario={c.horario}
            estado={estadoAsistencia(c.horario, ahora)}
          />
        ))}
      </div>
      <div className="mt-[10px] font-mono text-[11px] text-tx3">{HINT_ASISTENCIA}</div>
    </div>
  );
}

/**
 * Fila "Dar el presente" del detalle de materia. Se destaca en ámbar si hoy hay
 * clase de esta materia y estamos en la ventana activa. Sin asistenciaUrl no
 * muestra nada.
 */
export function AsistenciaMateria({ materia }: { materia: Materia }) {
  // Arranca en null para que el primer render del cliente sea igual al del
  // server (no hay reloj en el HTML); el tick de 30s lo mantiene al día.
  const [ahora, setAhora] = useState<Date | null>(null);

  useEffect(() => {
    setAhora(new Date());
    const id = setInterval(() => setAhora(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!materia.asistenciaUrl) return null;

  const claseHoy = ahora
    ? (clasesDeHoy([materia], ahora).find((c) => c.materia.id === materia.id) ?? null)
    : null;
  const estado = claseHoy && ahora ? estadoAsistencia(claseHoy.horario, ahora) : null;

  return (
    <div
      data-test="asistencia-materia"
      className={`mt-4 flex min-h-[54px] items-center gap-3 rounded-xl border bg-sup px-3 py-[10px] ${
        estado?.activa ? 'border-acc' : 'border-bor'
      }`}
    >
      <span className="block min-w-0 flex-1">
        <span className="block text-sm font-semibold">Asistencia</span>
        <span className="mt-[3px] block font-mono text-[11px] text-tx3">
          {estado ? `${claseHoy?.horario.inicio}–${claseHoy?.horario.fin} · ${estado.texto}` : HINT_ASISTENCIA}
        </span>
      </span>
      <LinkPresente
        url={materia.asistenciaUrl}
        destacado={estado?.activa ?? false}
        materia={materia.nombre}
      />
    </div>
  );
}
