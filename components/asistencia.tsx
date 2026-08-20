'use client';

import { ArrowUpRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BotonAvisoPresente } from '@/components/aviso-presente';
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

/**
 * Link "Entrar a la clase": abre la sala de Zoom de la comisión en una pestaña
 * nueva. SIEMPRE secundario — el primario ámbar es el de asistencia. Cuando la
 * clase está en la ventana activa se acentúa el borde/texto, sin fondo.
 */
export function LinkClase({ url, destacado, materia }: LinkProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      aria-label={`Entrar a la clase de ${materia} (abre el aula virtual)`}
      className={`tactil flex min-h-[38px] shrink-0 items-center gap-[5px] rounded-xl border bg-transparent px-[10px] text-[12.5px] font-bold whitespace-nowrap ${
        destacado ? 'border-acc !text-acc' : 'border-bor2 !text-tx2'
      }`}
    >
      Entrar a la clase
      <ArrowUpRight size={13} strokeWidth={2.5} aria-hidden className="shrink-0" />
    </a>
  );
}

type FilaProps = {
  materia: Materia;
  horario: { inicio: string; fin: string };
  estado: EstadoAsistencia;
};

/**
 * Una clase de hoy dentro del tile de asistencia.
 *
 * A 390px los dos botones no entran en la misma línea que el nombre y el
 * horario: cuando hay clase virtual, los datos van arriba y los botones abajo.
 * Con un solo botón se mantiene la fila de una línea.
 */
export function FilaAsistencia({ materia, horario, estado }: FilaProps) {
  const dosBotones = Boolean(materia.asistenciaUrl && materia.claseUrl);
  return (
    <div
      className={`flex min-h-[54px] gap-3 rounded-xl border bg-bg px-3 py-[10px] ${
        dosBotones ? 'flex-col' : 'items-center'
      } ${estado.activa ? 'border-acc' : 'border-bor'} ${
        estado.fase === 'terminada' ? 'opacity-40' : ''
      }`}
    >
      <span className={`flex min-w-0 items-center gap-3 ${dosBotones ? '' : 'flex-1'}`}>
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
      </span>
      <span className={`flex min-w-0 items-center gap-2 ${dosBotones ? 'flex-wrap' : ''}`}>
        {materia.asistenciaUrl && (
          <LinkPresente
            url={materia.asistenciaUrl}
            destacado={estado.activa}
            materia={materia.nombre}
          />
        )}
        {materia.claseUrl && (
          <LinkClase url={materia.claseUrl} destacado={estado.activa} materia={materia.nombre} />
        )}
      </span>
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
      <div className="mb-[10px] flex items-center justify-between gap-3">
        <div className="kicker tracking-[0.16em]">Asistencia</div>
        <BotonAvisoPresente />
      </div>
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

  if (!materia.asistenciaUrl && !materia.claseUrl) return null;

  const claseHoy = ahora
    ? (clasesDeHoy([materia], ahora).find((c) => c.materia.id === materia.id) ?? null)
    : null;
  const estado = claseHoy && ahora ? estadoAsistencia(claseHoy.horario, ahora) : null;

  return (
    <div
      data-test="asistencia-materia"
      className={`mt-4 flex min-h-[54px] flex-col gap-3 rounded-xl border bg-sup px-3 py-[10px] ${
        estado?.activa ? 'border-acc' : 'border-bor'
      }`}
    >
      <span className="block min-w-0">
        <span className="block text-sm font-semibold">Asistencia</span>
        <span className="mt-[3px] block font-mono text-[11px] text-tx3">
          {estado ? `${claseHoy?.horario.inicio}–${claseHoy?.horario.fin} · ${estado.texto}` : HINT_ASISTENCIA}
        </span>
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        {materia.asistenciaUrl && (
          <LinkPresente
            url={materia.asistenciaUrl}
            destacado={estado?.activa ?? false}
            materia={materia.nombre}
          />
        )}
        {materia.claseUrl && (
          <LinkClase
            url={materia.claseUrl}
            destacado={estado?.activa ?? false}
            materia={materia.nombre}
          />
        )}
      </span>
    </div>
  );
}
