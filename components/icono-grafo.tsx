/**
 * Ícono de la pestaña Grafo: tres nodos conectados en triángulo. Va inline y no
 * de lucide porque ninguno de los suyos dibuja esta figura, y el handoff pide
 * exactamente ésta. Misma API que los íconos de lucide (`size`, `strokeWidth`)
 * para que las navs no tengan que tratarlo distinto.
 */
export function IconoGrafo({
  size = 18,
  strokeWidth = 1.9,
}: {
  size?: number;
  strokeWidth?: number;
  /** Las navs se lo pasan a todos los íconos; acá ya va fijo en el <svg>. */
  'aria-hidden'?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="5" cy="6" r="2.6" />
      <circle cx="19" cy="6" r="2.6" />
      <circle cx="12" cy="18" r="2.6" />
      <path d="M7.2 7.4L10.5 16" />
      <path d="M16.8 7.4L13.5 16" />
      <path d="M7.6 6h8.8" />
    </svg>
  );
}
