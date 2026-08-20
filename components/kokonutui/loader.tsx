// Loader de anillos — adaptación del componente Loader de KokonutUI
// (https://kokonutui.com/docs/inputs/loader), pedido explícitamente en el
// handoff `design_handoff_onboarding_sesion`.
//
// Va vendorizado y en CSS puro, no bajado del registry (spec
// `specs/onboarding-y-salida` A5): el original usa `motion`, que este repo no
// tiene y que no vale traer para dos anillos girando. Los gradientes y las
// máscaras son los del prototipo, que ya están adaptados a la paleta del
// proyecto. Mismo criterio que `components/kokonutui/avatar-picker.tsx`.
//
// Sin punto central: se quitó a pedido del usuario (README del handoff §1b).

type Props = {
  /** Título con shimmer. */
  titulo: string;
  /** Línea de abajo, en gris. */
  subtitulo: string;
  children?: React.ReactNode;
};

export function Loader({ titulo, subtitulo, children }: Props) {
  return (
    // my-auto: si el loader vive dentro de una capa centrada que scrollea (el
    // onboarding), centrarlo solo con items-center le corta la cabeza cuando no
    // entra. Los márgenes auto se colapsan a 0 en ese caso y queda scrolleable.
    <div className="my-auto flex w-full max-w-[380px] animate-[scrim-in_400ms_ease] flex-col items-center gap-[26px] motion-reduce:animate-none">
      <span className="relative grid h-[74px] w-[74px] shrink-0 place-items-center">
        <span aria-hidden className="anillo-ext absolute inset-0 rounded-full" />
        <span aria-hidden className="anillo-int absolute inset-[11px] rounded-full" />
      </span>

      <div className="-mt-2 text-center">
        <div className="shimmer-txt text-[18px] font-extrabold tracking-[-0.01em]">{titulo}</div>
        <div className="mt-[6px] text-[13.5px] text-tx3">{subtitulo}</div>
      </div>

      {children}
    </div>
  );
}
