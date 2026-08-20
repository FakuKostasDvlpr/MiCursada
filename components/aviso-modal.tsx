'use client';

// Modal grande de detalle de aviso (spec `specs/onboarding-y-salida` R7, que
// cierra el R7 pendiente de `specs/avisos-vinculados`).
//
// Lo abre el chevron de la card "Próximos avisos" en Hoy. Muestra el aviso
// completo, el badge de estado, y —si el aviso nació de una nota— la nota
// vinculada SIN truncar, con el link al deep-link de esa card.
//
// El ancho es el de 580px (`ancho="card"`): el paquete de diseño nuevo lo pide
// así, y manda sobre el 440px que decía el handoff anterior.

import { X } from 'lucide-react';
import Link from 'next/link';
import { Modal } from '@/components/modal';
import { type ResumenNota, badgeAviso, fechaLargaAviso } from '@/lib/aviso-nota';
import { type EstadoAviso } from '@/lib/cursada';

type Props = {
  abierto: boolean;
  titulo: string;
  /** Fecha del aviso en 'YYYY-MM-DD'. */
  fecha: string;
  estado: EstadoAviso;
  /** Nombre de la materia, o `General` si el aviso no tiene ninguna. */
  materiaNombre: string;
  materiaColor: string;
  /** Resumen de la nota que originó el aviso; null si no nació de una. */
  nota?: ResumenNota | null;
  /** Deep-link a la card de esa nota; null si no hay nota. */
  notaHref?: string | null;
  onCerrar: () => void;
  /** Marca el aviso como hecho. El modal se cierra solo después. */
  onHecho: () => void;
};

export function AvisoModal({
  abierto,
  titulo,
  fecha,
  estado,
  materiaNombre,
  materiaColor,
  nota = null,
  notaHref = null,
  onCerrar,
  onHecho,
}: Props) {
  const badge = badgeAviso(estado);

  return (
    <Modal
      abierto={abierto}
      titulo={titulo}
      onCerrar={onCerrar}
      ancho="card"
      encabezado={
        <div className="mb-[14px] flex items-center justify-between">
          <div className="kicker tracking-[0.14em]">Aviso</div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="-mr-3 grid h-11 w-11 cursor-pointer place-items-center rounded-xl text-tx3"
          >
            <X size={18} strokeWidth={2.2} aria-hidden />
          </button>
        </div>
      }
    >
      <div className="text-[21px] leading-[1.3] font-extrabold tracking-[-0.015em] text-tx">
        {titulo}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-[14px]">
        <span className="inline-flex items-center gap-[7px]">
          <span
            aria-hidden
            className="h-2 w-2 rounded-full"
            style={{ background: materiaColor }}
          />
          <span className="text-[13.5px] font-semibold text-tx2">{materiaNombre}</span>
        </span>
        <span className="font-mono text-[12.5px] text-tx3">{fechaLargaAviso(fecha)}</span>
        <span
          className="rounded-full border px-[10px] py-[3px] font-mono text-[10.5px] font-semibold tracking-[0.08em] uppercase"
          style={{ color: badge.color, borderColor: badge.color }}
        >
          {badge.texto}
        </span>
      </div>

      {nota && (
        <div className="mt-[18px]">
          <div className="kicker mb-2 tracking-[0.14em]">Nota vinculada</div>
          <div
            className="rounded-xl border border-bor bg-bg px-4 py-[14px]"
            style={{ borderLeft: `3px solid ${materiaColor}` }}
          >
            {/* Sin truncar y con pre-wrap: el snippet de la lista corta a una
                línea, pero acá la nota se lee entera. */}
            <div className="text-[14.5px] leading-[1.6] whitespace-pre-wrap text-tx">
              {nota.texto}
            </div>
            <div className="mt-[10px] flex items-center gap-2">
              <span className="font-mono text-[10px] tracking-[0.1em] text-tx4 uppercase">
                {nota.tipo}
              </span>
              <span
                aria-hidden
                className="h-[6px] w-[6px] rounded-full"
                style={{ background: nota.estadoColor }}
              />
              <span className="font-mono text-[10.5px]" style={{ color: nota.estadoColor }}>
                {nota.estadoNombre}
              </span>
              {notaHref && (
                <Link
                  href={notaHref}
                  className="ml-auto px-[2px] py-1 text-[13px] font-bold !text-acc !no-underline"
                >
                  Abrir la nota →
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-[22px] flex gap-[10px]">
        <button
          type="button"
          onClick={onHecho}
          className="min-h-12 flex-1 cursor-pointer rounded-xl bg-acc-bg text-[14.5px] font-bold text-acc-fg"
        >
          Marcar como hecho
        </button>
        <button
          type="button"
          onClick={onCerrar}
          className="min-h-12 cursor-pointer rounded-xl border border-bor2 px-[18px] text-[14px] font-bold text-tx2"
        >
          Cerrar
        </button>
      </div>
    </Modal>
  );
}
