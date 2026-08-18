'use client';

// Cómo se ve una referencia al curso adentro de una nota. Dos formas, un solo
// marcador detrás (lib/referencias.ts):
//
//   ChipRef  — suelta en medio de una frase ("terminar el ▸TP Nº 2 el jueves")
//   CardRef  — sola, como bloque `ref`
//
// Las dos re-resuelven el id contra las secciones de HOY: si al módulo lo
// renombraron en el aula virtual, la nota muestra el nombre nuevo. Si ya no
// está, quedan apagadas y avisan, pero la nota no se rompe.

import { ArrowUpRight, Layers } from 'lucide-react';
import { partir, resolverRef } from '@/lib/referencias';
import type { Seccion } from '@/lib/types';

type Props = {
  id: string;
  nombre: string;
  secciones: Seccion[];
  /** Abre el módulo en la tab Curso. Sin esto la referencia no es clickeable. */
  onIr?: (id: string) => void;
};

export function ChipRef({ id, nombre, secciones, onIr }: Props) {
  const item = resolverRef(id, nombre, secciones);
  const contenido = (
    <>
      <span aria-hidden className="shrink-0 font-mono text-[10px] leading-none">
        {item.tipo === 'unidad' ? '▤' : '▸'}
      </span>
      {item.nombre}
    </>
  );
  const clases =
    'mx-[1px] inline-flex max-w-full items-baseline gap-[5px] rounded-md border px-[6px] py-[1px] align-baseline text-[13.5px] font-semibold';

  if (!item.vive) {
    return (
      <span
        title="Ya no está en el aula virtual"
        className={`${clases} border-bor text-tx4 line-through`}
      >
        {contenido}
      </span>
    );
  }

  if (!onIr) {
    return <span className={`${clases} border-bor bg-bg text-acc`}>{contenido}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => onIr(item.id)}
      title={`${item.etiqueta}${item.unidad ? ` · ${item.unidad}` : ''}`}
      className={`${clases} cursor-pointer border-bor bg-bg text-acc hover:border-acc`}
    >
      {contenido}
    </button>
  );
}

export function CardRef({ id, nombre, secciones, onIr }: Props) {
  const item = resolverRef(id, nombre, secciones);

  const cuerpo = (
    <>
      <span
        aria-hidden
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-bor font-mono text-[13px] text-acc"
      >
        {item.tipo === 'unidad' ? <Layers size={14} strokeWidth={2} /> : '▸'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-acc">{item.nombre}</span>
        <span className="kicker mt-[2px] block truncate">
          {item.unidad && item.tipo === 'modulo' ? `${item.unidad} · ` : ''}
          {item.etiqueta}
        </span>
      </span>
    </>
  );

  if (!item.vive) {
    return (
      <div className="flex min-h-[52px] items-center gap-[10px] rounded-xl border border-dashed border-bor bg-sup px-3 py-[10px]">
        <span
          aria-hidden
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-bor font-mono text-[13px] text-tx4"
        >
          ?
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-tx4 line-through">
            {item.nombre}
          </span>
          <span className="kicker mt-[2px] block">Ya no está en el aula virtual</span>
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onIr?.(item.id)}
      disabled={!onIr}
      className="flex min-h-[52px] w-full cursor-pointer items-center gap-[10px] rounded-xl border border-bor bg-sup px-3 py-[10px] text-left disabled:cursor-default"
    >
      {cuerpo}
      <ArrowUpRight size={14} strokeWidth={2} aria-hidden className="shrink-0 text-tx3" />
    </button>
  );
}

/** Un texto de nota con sus referencias pintadas como chips. */
export function TextoConRefs({
  texto,
  secciones,
  onIr,
}: {
  texto: string;
  secciones: Seccion[];
  onIr?: (id: string) => void;
}) {
  return (
    <>
      {partir(texto).map((t, i) =>
        t.t === 'texto' ? (
          // Los índices alcanzan: los trozos se regeneran enteros con el texto.
          <span key={i}>{t.texto}</span>
        ) : (
          <ChipRef key={i} id={t.id} nombre={t.nombre} secciones={secciones} onIr={onIr} />
        )
      )}
    </>
  );
}
