'use client';

import { X } from 'lucide-react';
import { useEffect } from 'react';

type Props = {
  abierto: boolean;
  titulo: string;
  onCerrar: () => void;
  children: React.ReactNode;
};

/**
 * Modal reutilizable del handoff:
 * - ≤640px: sheet desde abajo, ancho 100%, radios 20px 20px 0 0, slide-up 280ms.
 * - >640px: centrado 440px, radio 16px.
 * Scrim var(--scrim) con fade 180ms; cierra con tap afuera, ✕ y Escape.
 */
export function Modal({ abierto, titulo, onCerrar, children }: Props) {
  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex animate-[scrim-in_180ms_ease-out] items-end justify-center bg-scrim min-[641px]:items-center min-[641px]:p-5"
      onClick={onCerrar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88dvh] w-full animate-[sheet-up_280ms_cubic-bezier(.22,.8,.3,1)] overflow-y-auto rounded-t-[20px] border border-bor bg-sup p-5 pb-[30px] min-[641px]:w-[440px] min-[641px]:animate-[scrim-in_180ms_ease-out] min-[641px]:rounded-2xl min-[641px]:pb-5"
      >
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
        {children}
      </div>
    </div>
  );
}
