'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

type Props = {
  /**
   * 'switch' = el interruptor 62×34 del header de Hoy (el del prototipo).
   * 'icono' = botón cuadrado de 40px. 'sidebar' = fila con label.
   */
  variante?: 'switch' | 'icono' | 'sidebar';
};

/**
 * Toggle de tema: escribe data-tema en <html> y persiste en localStorage('tema').
 * El ícono y el label correctos se resuelven por CSS (según data-tema), así no hay
 * desajuste de hidratación: sol + "Modo claro" en oscuro, luna + "Modo oscuro" en
 * claro. Cambio instantáneo.
 */
export function ThemeToggle({ variante = 'icono' }: Props) {
  // Solo para `aria-checked`: lo visual lo resuelve el CSS. Arranca en oscuro
  // (el default de :root) y se sincroniza al montar, así el SSR y el primer
  // render del cliente coinciden.
  const [oscuro, setOscuro] = useState(true);

  useEffect(() => {
    setOscuro(document.documentElement.dataset.tema !== 'claro');
  }, []);

  const alternar = () => {
    const raiz = document.documentElement;
    const aClaro = raiz.dataset.tema !== 'claro';
    if (aClaro) raiz.dataset.tema = 'claro';
    else delete raiz.dataset.tema;
    setOscuro(!aClaro);
    try {
      localStorage.setItem('tema', aClaro ? 'claro' : 'oscuro');
    } catch {
      // localStorage bloqueado: el tema igual cambia para esta sesión.
    }
  };

  if (variante === 'switch') {
    return (
      <button
        type="button"
        onClick={alternar}
        role="switch"
        aria-checked={oscuro}
        aria-label="Cambiar tema"
        suppressHydrationWarning
        className="relative h-[34px] w-[62px] shrink-0 cursor-pointer rounded-full border border-bor bg-sup p-0"
      >
        {/* Los dos íconos están siempre; el activo queda ARRIBA del knob ámbar
            y por eso se pinta en --acc-fg. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-[1] grid w-[31px] place-items-center text-acc-fg transition-colors duration-300 [[data-tema=claro]_&]:text-tx3"
        >
          <Moon size={15} strokeWidth={2} />
        </span>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-[1] grid w-[31px] place-items-center text-tx3 transition-colors duration-300 [[data-tema=claro]_&]:text-acc-fg"
        >
          <Sun size={15} strokeWidth={2} />
        </span>
        <span
          aria-hidden
          className="absolute top-[3px] left-[3px] h-[26px] w-[26px] rounded-full bg-acc-bg transition-transform duration-[340ms] ease-[cubic-bezier(.22,.8,.3,1)] motion-reduce:transition-none [[data-tema=claro]_&]:translate-x-[28px]"
        />
      </button>
    );
  }

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
