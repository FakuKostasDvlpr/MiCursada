// Rueda de carga de la app: el mismo anillo con el borde superior de acento
// que usa la secuencia de entrada (`.girando` en globals.css, que ya respeta
// prefers-reduced-motion dejando el anillo quieto pero visible).
//
// Dos piezas:
// - <Rueda />: el anillo pelado, para adentro de un botón que quedó esperando
//   una Server Action. `sobreAmbar` la oscurece para los botones primarios
//   (fondo #fbbf24), donde el ámbar de acento no contrastaría.
// - <Cargando />: el overlay con etiqueta que usa la tab Curso mientras carga
//   un material (absolute a propósito: si desmontáramos el <img>/<video> para
//   mostrarlo, su onLoad no se dispararía nunca).

type RuedaProps = {
  /** Diámetro en px. 16 entra bien en un botón de 44–48. */
  tam?: number;
  /** true = anillo oscuro, para botones con fondo ámbar. */
  sobreAmbar?: boolean;
  className?: string;
};

export function Rueda({ tam = 16, sobreAmbar = false, className = '' }: RuedaProps) {
  return (
    <span
      aria-hidden
      className={`girando inline-block shrink-0 rounded-full border-2 ${
        sobreAmbar
          ? 'border-[rgba(34,26,0,.25)] border-t-[#221a00]'
          : 'border-bor2 border-t-acc'
      } ${className}`}
      style={{ width: tam, height: tam }}
    />
  );
}

export function Cargando({ etiqueta = 'Cargando…' }: { etiqueta?: string }) {
  return (
    <div
      role="status"
      className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl border border-bor bg-sup"
    >
      <Rueda tam={20} />
      <span className="font-mono text-[11px] text-tx3">{etiqueta}</span>
    </div>
  );
}
