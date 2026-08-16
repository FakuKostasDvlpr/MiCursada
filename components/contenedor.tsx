'use client';

import { usePathname } from 'next/navigation';

/**
 * Contenedor de página. En las rutas de la app deja el hueco de la sidebar
 * (desktop) y el despeje de la bottom nav (móvil). En /login y /perfil no hay
 * nav, así que el contenido va centrado sin offsets.
 */
export function Contenedor({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const sinNav = pathname.startsWith('/login') || pathname.startsWith('/perfil');

  if (sinNav) {
    return <div className="mx-auto max-w-[720px] px-[18px]">{children}</div>;
  }

  return (
    <div className="mx-auto max-w-[720px] px-[18px] pt-[26px] pb-[130px] min-[641px]:max-w-[1150px] min-[641px]:pt-[34px] min-[641px]:pr-10 min-[641px]:pb-20 min-[641px]:pl-[274px]">
      {children}
    </div>
  );
}
