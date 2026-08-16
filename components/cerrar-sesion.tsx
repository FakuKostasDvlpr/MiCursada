'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { cerrarSesion } from '@/app/actions-sesion';

type Props = {
  /** 'sidebar' = fila de la nav lateral. 'boton' = botón full-width (perfil). */
  variante?: 'sidebar' | 'boton';
};

/**
 * Cierra la sesión de la app. NO desconecta el aula virtual: el token guardado
 * queda, así que al volver a entrar tenés todo sincronizado igual. Para borrar
 * el token está "Desconectar", en el panel del aula virtual.
 */
export function CerrarSesion({ variante = 'boton' }: Props) {
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);

  const salir = async () => {
    setSaliendo(true);
    try {
      await cerrarSesion();
    } catch {
      setSaliendo(false);
      return;
    }
    router.replace('/login');
    router.refresh();
  };

  if (variante === 'sidebar') {
    return (
      <button
        type="button"
        onClick={salir}
        disabled={saliendo}
        className="flex min-h-[44px] cursor-pointer items-center gap-[11px] rounded-[11px] px-3 text-left text-[13.5px] font-bold text-tx2 disabled:opacity-60"
      >
        <LogOut size={18} strokeWidth={2} aria-hidden />
        {saliendo ? 'Saliendo…' : 'Cerrar sesión'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={salir}
      disabled={saliendo}
      className="mt-3 flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-bor2 text-[14px] font-bold text-tx2 disabled:opacity-60"
    >
      <LogOut size={16} strokeWidth={2} aria-hidden />
      {saliendo ? 'Saliendo…' : 'Cerrar sesión'}
    </button>
  );
}
