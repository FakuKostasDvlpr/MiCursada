// Snippet de la nota que originó un aviso (NotaAviso.dc.html del handoff).
//
// Aparece en la lista de Avisos y en la tab Avisos de la materia. Es solo
// lectura: el click lo maneja quien lo monta, para poder llevar a la nota.
//
// A diferencia del prototipo, acá NO va adentro de un <button> — el prototipo
// mete este div dentro del botón de la fila, que es HTML inválido y rompe la
// navegación por teclado.

import type { ResumenNota } from '@/lib/aviso-nota';

type Props = ResumenNota & {
  /** Color de la materia: pinta el riel izquierdo y el ícono. */
  color: string;
};

export function NotaAviso({ texto, tipo, estadoNombre, estadoColor, color }: Props) {
  return (
    <span
      className="mt-[7px] flex items-start gap-2 rounded-[9px] border border-bor bg-bg px-[10px] py-[7px]"
      style={{ borderLeft: `2px solid ${color}` }}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="mt-[2px] shrink-0"
      >
        <rect x="4" y="3" width="16" height="18" rx="2.5" />
        <path d="M8 8h8" />
        <path d="M8 12h8" />
        <path d="M8 16h4" />
      </svg>
      <span className="block min-w-0 flex-1">
        <span className="block truncate text-[12px] leading-[1.45] text-tx2">{texto}</span>
        <span className="mt-[3px] flex items-center gap-[6px]">
          <span className="font-mono text-[9.5px] tracking-[0.1em] uppercase text-tx4">{tipo}</span>
          <span
            aria-hidden
            className="h-[5px] w-[5px] rounded-full"
            style={{ background: estadoColor }}
          />
          <span className="font-mono text-[9.5px]" style={{ color: estadoColor }}>
            {estadoNombre}
          </span>
        </span>
      </span>
    </span>
  );
}
