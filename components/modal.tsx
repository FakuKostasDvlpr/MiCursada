'use client';

import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

type Props = {
  abierto: boolean;
  titulo: string;
  onCerrar: () => void;
  children: React.ReactNode;
  /**
   * Ancho del panel en desktop. `estandar` es el del handoff genérico (440px);
   * `card` es el del modal de detalle de card (580px), que además trae su
   * padding `24px 26px 32px` y sus max-height (86dvh / 92dvh en el sheet).
   */
  ancho?: 'estandar' | 'card';
  /**
   * Reemplaza la fila de título por un encabezado propio. Quien lo pasa se hace
   * cargo del botón de cerrar (el modal de card lleva badges y fecha ahí).
   */
  encabezado?: React.ReactNode;
};

/** Clases del panel por variante de ancho (estáticas: Tailwind no arma strings). */
const PANEL: Record<'estandar' | 'card', string> = {
  estandar:
    'max-h-[88dvh] rounded-t-[20px] p-5 pb-[30px] min-[641px]:w-[440px] min-[641px]:rounded-2xl min-[641px]:pb-5',
  card: 'max-h-[92dvh] rounded-t-[20px] p-[24px_26px_32px] min-[641px]:w-[580px] min-[641px]:max-h-[86dvh] min-[641px]:rounded-2xl',
};

/**
 * Modal reutilizable del handoff:
 * - ≤640px: sheet desde abajo, ancho 100%, radios 20px 20px 0 0, slide-up 280ms.
 * - >640px: centrado 440px (o 580px con `ancho="card"`), radio 16px.
 * Scrim var(--scrim) con fade 180ms; cierra con tap afuera, ✕ y Escape.
 *
 * Es un `<dialog>` nativo abierto con `showModal()`: de ahí salen gratis la
 * semántica de diálogo, el foco atrapado adentro (con Tab no te vas a la app de
 * atrás) y el resto del documento inerte. El scrim se sigue pintando en el
 * propio `<dialog>` (que ocupa todo el viewport) y no en `::backdrop`, para
 * conservar el fade del handoff; el backdrop nativo queda transparente.
 *
 * Escape lo cancela el navegador: se intercepta `cancel` para que el cierre lo
 * maneje React (`onCerrar`) y no queden el DOM y el estado desincronizados.
 */
export function Modal({
  abierto,
  titulo,
  onCerrar,
  children,
  ancho = 'estandar',
  encabezado,
}: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogo.current;
    if (!abierto || !d) return;
    if (!d.open) d.showModal();
    return () => {
      if (d.open) d.close();
    };
  }, [abierto]);

  if (!abierto) return null;

  return (
    <dialog
      ref={dialogo}
      aria-label={titulo}
      onCancel={(e) => {
        e.preventDefault();
        onCerrar();
      }}
      className="fixed inset-0 z-50 m-0 flex h-full max-h-none w-full max-w-none animate-[scrim-in_180ms_ease-out] items-end justify-center overflow-hidden bg-scrim p-0 text-tx backdrop:bg-transparent min-[641px]:items-center min-[641px]:p-5"
    >
      <div
        className={`relative z-10 w-full animate-[sheet-up_280ms_cubic-bezier(.22,.8,.3,1)] overflow-y-auto border border-bor bg-sup min-[641px]:animate-[scrim-in_180ms_ease-out] motion-reduce:animate-none ${PANEL[ancho]}`}
      >
        {encabezado ?? (
          <div className="mb-[18px] flex items-center justify-between">
            <div className="text-[17px] font-extrabold">{titulo}</div>
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar"
              className="-mr-3 grid h-11 w-11 cursor-pointer place-items-center rounded-xl text-tx3"
            >
              <X size={18} strokeWidth={2.2} aria-hidden />
            </button>
          </div>
        )}
        {children}
      </div>

      {/* El "tap afuera cierra" es un botón de verdad y no un handler colgado
          del <dialog>: la interacción vive en un elemento interactivo y el panel
          deja de necesitar stopPropagation. Va DESPUÉS del panel en el DOM y
          detrás por z-index, así el foco inicial de showModal() sigue cayendo
          en lo primero del panel y no acá. `tabIndex={-1}` a propósito: es un
          atajo de mouse redundante — el teclado cierra con Escape y con la ✕,
          y un tab stop extra "Cerrar" solo agregaría ruido. */}
      <button
        type="button"
        tabIndex={-1}
        onClick={onCerrar}
        aria-label="Cerrar"
        className="absolute inset-0 z-0 cursor-default"
      />
    </dialog>
  );
}
