'use client';

// El campo de texto de un bloque de nota, con menciones al curso.
//
// Un <textarea> no sabe dibujar un chip adentro, así que:
//
//   · Un bloque SIN referencias es un textarea de punta a punta — igual que
//     antes, sin ninguna regresión al editar.
//   · Un bloque CON referencias se muestra renderizado (texto + chips) y recién
//     al tocarlo se convierte en textarea para editar el marcador crudo.
//     El cursor arranca al final: es el precio de no meter un contenteditable.
//
// Escribir `@` abre el menú del curso, que filtra mientras tipeás y reemplaza
// la mención por el marcador (lib/referencias.ts).

import { useEffect, useRef, useState } from 'react';
import { TextoConRefs } from '@/components/ref-curso';
import {
  type ItemCurso,
  buscarEnCatalogo,
  insertarMencion,
  mencionEnCursor,
  tieneRefs,
} from '@/lib/referencias';
import type { Seccion } from '@/lib/types';

/** Cuántas opciones del curso se listan de una en el menú de `@`. */
const MAX_OPCIONES = 6;

type Props = {
  valor: string;
  onCambio: (texto: string) => void;
  onBlur: (texto: string) => void;
  placeholder: string;
  etiqueta: string;
  /** Clases de tipografía del bloque (título, tarea, texto). */
  className?: string;
  catalogo: ItemCurso[];
  secciones: Seccion[];
  onIr?: (id: string) => void;
  /** Empezar en modo edición (un bloque recién creado). */
  autoFocus?: boolean;
};

export function CampoNota({
  valor,
  onCambio,
  onBlur,
  placeholder,
  etiqueta,
  className = '',
  catalogo,
  secciones,
  onIr,
  autoFocus = false,
}: Props) {
  const conRefs = tieneRefs(valor);
  const [editando, setEditando] = useState(autoFocus || !conRefs);
  const [mencion, setMencion] = useState<{ desde: number; hasta: number; consulta: string } | null>(
    null
  );
  const [elegida, setElegida] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  /** Cursor a reponer después de insertar una mención. */
  const cursorPendiente = useRef<number | null>(null);

  // Un bloque sin referencias siempre es editable: si borrás la última cita,
  // el campo se queda en modo edición en vez de volverse un div de golpe.
  useEffect(() => {
    if (!conRefs) setEditando(true);
  }, [conRefs]);

  const ajustarAlto = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    if (editando) ajustarAlto();
  }, [editando, valor]);

  useEffect(() => {
    const el = ref.current;
    if (!el || cursorPendiente.current === null) return;
    el.setSelectionRange(cursorPendiente.current, cursorPendiente.current);
    cursorPendiente.current = null;
  }, [valor]);

  const opciones = mencion ? buscarEnCatalogo(catalogo, mencion.consulta).slice(0, MAX_OPCIONES) : [];

  const revisarMencion = (el: HTMLTextAreaElement) => {
    if (catalogo.length === 0) return;
    const m = mencionEnCursor(el.value, el.selectionStart ?? 0);
    setMencion(m);
    setElegida(0);
  };

  const elegir = (item: ItemCurso) => {
    if (!mencion) return;
    const r = insertarMencion(valor, mencion, item);
    cursorPendiente.current = r.cursor;
    setMencion(null);
    onCambio(r.texto);
    ref.current?.focus();
  };

  const teclas = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mencion || opciones.length === 0) {
      if (e.key === 'Escape' && mencion) setMencion(null);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setElegida((i) => (i + 1) % opciones.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setElegida((i) => (i - 1 + opciones.length) % opciones.length);
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      const item = opciones[elegida];
      if (!item) return;
      e.preventDefault();
      elegir(item);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setMencion(null);
    }
  };

  if (!editando) {
    return (
      <div
        role="textbox"
        tabIndex={0}
        aria-label={etiqueta}
        onClick={() => setEditando(true)}
        onFocus={() => setEditando(true)}
        className={`min-w-0 flex-1 cursor-text whitespace-pre-wrap ${className}`}
      >
        {valor ? (
          <TextoConRefs texto={valor} secciones={secciones} onIr={onIr} />
        ) : (
          <span className="text-tx4">{placeholder}</span>
        )}
      </div>
    );
  }

  return (
    <div className="relative min-w-0 flex-1">
      <textarea
        ref={ref}
        value={valor}
        rows={1}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={etiqueta}
        onChange={(e) => {
          onCambio(e.target.value);
          revisarMencion(e.target);
        }}
        onKeyUp={(e) => revisarMencion(e.currentTarget)}
        onClick={(e) => revisarMencion(e.currentTarget)}
        onKeyDown={teclas}
        onBlur={(e) => {
          onBlur(e.target.value);
          // El menú se cierra con un respiro: si el blur vino de tocar una
          // opción, el click todavía no llegó.
          setTimeout(() => setMencion(null), 120);
          if (tieneRefs(e.target.value)) setEditando(false);
        }}
        onInput={ajustarAlto}
        className={`w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-tx outline-none ${className}`}
      />

      {mencion && (
        <div className="absolute top-full right-0 left-0 z-20 mt-1 overflow-hidden rounded-xl border border-bor2 bg-sup p-1">
          <div className="kicker px-[10px] pt-2 pb-1 !text-tx4">Del curso</div>
          {opciones.length === 0 ? (
            <div className="px-3 py-[10px] text-[13px] text-tx3">
              No hay nada del curso con «{mencion.consulta}».
            </div>
          ) : (
            opciones.map((op, i) => (
              <button
                key={op.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(op)}
                className={`flex min-h-[44px] w-full cursor-pointer items-center gap-[10px] rounded-[9px] px-[10px] py-1 text-left ${
                  i === elegida ? 'bg-bor' : ''
                }`}
              >
                <span
                  aria-hidden
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-bor font-mono text-[13px] text-acc"
                >
                  {op.tipo === 'unidad' ? '▤' : '▸'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-tx">
                    {op.nombre}
                  </span>
                  <span className="kicker mt-[1px] block truncate">
                    {op.tipo === 'modulo' && op.unidad ? `${op.unidad} · ` : ''}
                    {op.etiqueta}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
