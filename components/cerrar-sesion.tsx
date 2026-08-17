'use client';

import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { cerrarSesion } from '@/app/actions-sesion';
import { Modal } from '@/components/modal';

type Props = {
  /** 'sidebar' = fila de la nav lateral. 'boton' = botón full-width (perfil). */
  variante?: 'sidebar' | 'boton';
};

/**
 * Cierra la sesión de la app, con confirmación. NO desconecta el aula virtual:
 * el token guardado queda, así que al volver a entrar tenés todo sincronizado
 * igual. Para borrar el token está "Desconectar", en el panel del aula virtual.
 *
 * El submit va por <form action={cerrarSesion}>: la action redirige a /login y
 * Next hace la navegación con la respuesta, sin que este componente tenga que
 * empujar el router (que es lo que antes quedaba a mitad de camino).
 */
export function CerrarSesion({ variante = 'boton' }: Props) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      {variante === 'sidebar' ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="flex min-h-[44px] cursor-pointer items-center gap-[11px] rounded-[11px] px-3 text-left text-[13.5px] font-bold text-tx2"
        >
          <LogOut size={18} strokeWidth={2} aria-hidden />
          Cerrar sesión
        </button>
      ) : (
        // Ghost rojo del handoff v3 §0b: es una salida, no una acción más.
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="mt-2 flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border text-[14px] font-bold"
          style={{ borderColor: 'rgba(251,113,133,.45)', color: '#fb7185' }}
        >
          <LogOut size={16} strokeWidth={2} aria-hidden />
          Cerrar sesión
        </button>
      )}

      <Modal abierto={abierto} titulo="Cerrar sesión" onCerrar={() => setAbierto(false)}>
        <p className="text-[14px] leading-[1.5] text-tx2">
          Vas a salir de la app. Para volver a entrar necesitás el usuario y la contraseña del
          aula virtual.
        </p>
        <p className="mt-2 text-[13px] leading-[1.5] text-tx3">
          Lo que ya bajaste del aula virtual queda como está: esto no desconecta tu cuenta.
        </p>
        <form action={cerrarSesion} className="mt-5 flex gap-[10px]">
          <button
            type="button"
            onClick={() => setAbierto(false)}
            className="min-h-12 cursor-pointer rounded-xl border border-bor2 px-5 text-[14.5px] font-bold text-tx"
          >
            Cancelar
          </button>
          <BotonSalir />
        </form>
      </Modal>
    </>
  );
}

/** Separado para poder usar useFormStatus (solo funciona adentro del <form>). */
function BotonSalir() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-12 flex-1 cursor-pointer rounded-xl bg-acc-bg text-[14.5px] font-bold text-acc-fg disabled:opacity-60"
    >
      {pending ? 'Saliendo…' : 'Cerrar sesión'}
    </button>
  );
}
