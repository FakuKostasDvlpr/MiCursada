'use client';

import { Moon, Sun } from 'lucide-react';

/**
 * Toggle de tema: escribe data-tema en <html> y persiste en localStorage('tema').
 * El ícono correcto se resuelve por CSS (según data-tema), así no hay
 * desajuste de hidratación: sol en oscuro, luna en claro. Cambio instantáneo.
 */
export function ThemeToggle() {
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
