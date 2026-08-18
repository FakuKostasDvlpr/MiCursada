'use client';

// Pantalla de consentimiento del primer ingreso (solo modo Supabase): mismo
// shell visual que la card de login (components/login-entrada.tsx) — card
// `bg-sup`, borde `border-bor`, radio 20px, kicker mono — pero sin la
// secuencia animada: acá no hay nada que esperar, solo dos botones.

import { useFormStatus } from 'react-dom';
import { aceptarConsentimiento, cerrarSesion } from '@/app/actions-sesion';

export function Consentimiento() {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-160px)] w-full max-w-[520px] flex-col justify-center">
      <div className="card-in rounded-[20px] border border-bor bg-sup px-[26px] py-[30px]">
        <div className="kicker">Mi cursada</div>
        <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.015em]">Antes de empezar</h1>

        <p className="mt-4 text-[14px] leading-[1.6] text-tx2">
          Para que Mi Cursada funcione guardamos: tu nombre y tu carrera, un token de{' '}
          <strong className="text-tx">solo lectura</strong> del aula virtual (cifrado), tus
          horarios, tus notas y tus avisos. Tu contraseña no se guarda nunca. El servidor lo
          administra una persona física (Facu), que puede ver <strong className="text-tx">que</strong>{' '}
          usás la app pero no <strong className="text-tx">qué</strong> escribís en ella. Podés
          borrar tu cuenta y todos tus datos cuando quieras, desde tu perfil.
        </p>

        <div className="mt-6 flex flex-col gap-[10px]">
          <form action={aceptarConsentimiento}>
            <BotonAceptar />
          </form>
          <form action={cerrarSesion}>
            <BotonRechazar />
          </form>
        </div>
      </div>
    </div>
  );
}

/** Separado para poder usar useFormStatus (solo funciona adentro del <form>). */
function BotonAceptar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="tactil flex w-full cursor-pointer items-center justify-center rounded-xl bg-acc-bg text-[14.5px] font-bold text-acc-fg transition-colors duration-[250ms] disabled:opacity-60"
    >
      {pending ? 'Entrando…' : 'Acepto y quiero entrar'}
    </button>
  );
}

function BotonRechazar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="tactil flex w-full cursor-pointer items-center justify-center rounded-xl border border-bor2 text-[14.5px] font-bold text-tx transition-colors duration-[250ms] disabled:opacity-60"
    >
      {pending ? 'Saliendo…' : 'No acepto'}
    </button>
  );
}
