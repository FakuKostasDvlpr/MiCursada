'use client';

import { Moon, Sun } from 'lucide-react';

type Props = {
  /** 'icono' = botón 40px del header de Hoy (móvil). 'sidebar' = fila con label. */
  variante?: 'icono' | 'sidebar';
};

/**
 * Toggle de tema: escribe data-tema en <html> y persiste en localStorage('tema').
 * El ícono y el label correctos se resuelven por CSS (según data-tema), así no hay
 * desajuste de hidratación: sol + "Modo claro" en oscuro, luna + "Modo oscuro" en
 * claro. Cambio instantáneo.
 */
export function ThemeToggle({ variante = 'icono' }: Props) {
  const alternar = () => {
    const raiz = document.documentElement;
    const aClaro = raiz.dataset.tema !== 'claro';
    if (aClaro) raiz.dataset.tema = 'claro';
    else delete raiz.dataset.tema;
    try {
      localStorage.setItem('tema', aClaro ? 'claro' : 'oscuro');
    } catch {
      // localStorage bloqueado: el tema igual cambia para esta sesión.
    }
  };

  if (variante === 'sidebar') {
    return (
      <button
        type="button"
        onClick={alternar}
        className="flex min-h-[44px] cursor-pointer items-center gap-[11px] rounded-[11px] px-3 text-left text-[13.5px] font-bold text-tx2"
      >
        <Sun size={18} strokeWidth={2} aria-hidden className="[[data-tema=claro]_&]:hidden" />
        <Moon
          size={18}
          strokeWidth={2}
          aria-hidden
          className="hidden [[data-tema=claro]_&]:block"
        />
        <span className="[[data-tema=claro]_&]:hidden">Modo claro</span>
        <span className="hidden [[data-tema=claro]_&]:inline">Modo oscuro</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label="Cambiar tema"
      className="tactil grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl border border-bor bg-sup text-tx2"
    >
      <Sun size={17} strokeWidth={2} aria-hidden className="[[data-tema=claro]_&]:hidden" />
      <Moon size={17} strokeWidth={2} aria-hidden className="hidden [[data-tema=claro]_&]:block" />
    </button>
  );
}
