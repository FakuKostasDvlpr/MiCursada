'use client';

import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { cerrarSesion } from '@/app/actions-sesion';
import { Modal } from '@/components/modal';

type Props = {
  /**
   * 'menu' = fila del menú del avatar (header de Hoy). 'sidebar' = fila de la
   * nav lateral. 'boton' = botón full-width (perfil).
   */
  variante?: 'menu' | 'sidebar' | 'boton';
};

/** Fila roja "Cerrar sesión" del menú del avatar. La usa `MenuPerfil`. */
export function FilaSalir({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex min-h-[42px] w-full cursor-pointer items-center gap-[9px] rounded-[10px] px-[10px] text-left text-[13.5px] font-bold hover:bg-[rgba(251,113,133,.12)]"
      style={{ color: '#fb7185' }}
    >
      <LogOut size={15} strokeWidth={2} aria-hidden />
      Cerrar sesión
    </button>
  );
}

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
      {variante === 'menu' ? (
        <FilaSalir onClick={() => setAbierto(true)} />
      ) : variante === 'sidebar' ? (
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

      <ModalSalir abierto={abierto} onCerrar={() => setAbierto(false)} />
    </>
  );
}

/**
 * El modal de confirmación, aparte del disparador (handoff
 * `design_handoff_onboarding_sesion` §2).
 *
 * Está separado porque el disparador del menú del avatar tiene que **cerrar el
 * menú** al abrirlo, y el menú desmonta su contenido: si el modal viviera
 * adentro, se iría con él y no se vería nada. `MenuPerfil` monta este modal
 * afuera del menú y le pasa el estado.
 *
 * No lleva fila de título ni ✕: el tile rosa y el "¿Cerrás sesión?" ya son el
 * encabezado. Se sale con `Quedarme`, con Escape o tocando afuera.
 */
export function ModalSalir({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  return (
    <Modal abierto={abierto} titulo="¿Cerrás sesión?" onCerrar={onCerrar} encabezado={<></>}>
      <div className="flex items-start gap-[14px]">
        <span
          aria-hidden
          className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px]"
          style={{
            background: 'rgba(251,113,133,.12)',
            border: '1px solid rgba(251,113,133,.35)',
          }}
        >
          <LogOut size={20} strokeWidth={2} style={{ color: '#fb7185' }} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[17px] font-extrabold tracking-[-0.01em]">¿Cerrás sesión?</div>
          {/* El handoff dice "entrar de nuevo con tu correo"; acá no se entra
              con un correo sino con el usuario del aula virtual. Es la única
              cláusula que cambia (spec `onboarding-y-salida` A6). */}
          <p className="mt-[6px] text-[13.5px] leading-[1.55] text-tx2">
            Tus materias, notas y avisos quedan guardados. Vas a tener que entrar de nuevo con el
            usuario del aula virtual.
          </p>
        </div>
      </div>
      <form action={cerrarSesion} className="mt-5 flex gap-[10px]">
        <button
          type="button"
          onClick={onCerrar}
          className="min-h-12 flex-1 cursor-pointer rounded-xl border border-bor2 text-[14px] font-bold text-tx2"
        >
          Quedarme
        </button>
        <BotonSalir />
      </form>
    </Modal>
  );
}

/**
 * Separado para poder usar useFormStatus (solo funciona adentro del <form>).
 *
 * Rosa y no ámbar: es la acción destructiva, y el ámbar en esta app es el color
 * de "seguí". El `Saliendo…` no está en el prototipo (su logout es instantáneo);
 * acá hay red de por medio y sin él el botón parece no hacer nada.
 */
function BotonSalir() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-12 flex-1 cursor-pointer rounded-xl text-[14.5px] font-bold disabled:opacity-60"
      style={{ background: '#fb7185', color: '#20060b' }}
    >
      {pending ? 'Saliendo…' : 'Cerrar sesión'}
    </button>
  );
}
