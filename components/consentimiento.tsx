'use client';

// Aviso de privacidad del primer ingreso (solo modo Supabase).
//
// Se muestra COMO CAPA sobre la app difuminada, no como una pantalla suelta:
// atrás se ve la cursada real (borrosa y sin poder tocarla), así se entiende
// que el aviso es el último paso para entrar y no otra pantalla de login. El
// scrim y el blur salen de los tokens del handoff (`--scrim`), igual que
// components/modal.tsx.
//
// A diferencia de un modal común, este NO se puede cerrar: no hay botón de X,
// ni cierre por Escape ni por click afuera. Las dos únicas salidas son aceptar
// o salir de la app, porque sin aceptar no hay nada que mostrar.

import { useFormStatus } from 'react-dom';
import { aceptarConsentimiento, cerrarSesion } from '@/app/actions-sesion';

export function Consentimiento() {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-privacidad"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-scrim px-[18px] py-[30px] backdrop-blur-[10px]"
    >
      <div className="card-in my-auto w-full max-w-[560px] rounded-[20px] border border-bor bg-sup px-[26px] py-[30px]">
        <div className="kicker">Un paso más</div>
        <h1
          id="titulo-privacidad"
          className="mt-2 text-2xl font-extrabold tracking-[-0.015em] text-tx"
        >
          Cómo cuidamos tus datos
        </h1>
        <p className="mt-3 text-[14.5px] leading-[1.6] text-tx2">
          Mi Cursada se conecta al aula virtual para traerte tus materias. Antes de entrar, mirá qué
          guardamos y qué no.
        </p>

        <ul className="mt-5 flex flex-col gap-[14px]">
          <Punto titulo="Tu contraseña no se guarda">
            La usamos una sola vez para pedirle al aula virtual un permiso de{' '}
            <Fuerte>solo lectura</Fuerte>, y la descartamos. Ese permiso queda guardado cifrado y no
            sirve para escribir nada en tu cuenta del aula.
          </Punto>
          <Punto titulo="Guardamos tu cursada, no tu intimidad">
            Tu nombre y tu carrera (los trae el aula virtual), y lo que vos cargues acá: horarios,
            notas de clase y avisos.
          </Punto>
          <Punto titulo="Nadie lee tus notas">
            Quien administra el servidor puede ver <Fuerte>que</Fuerte> usás la app —cuántas
            personas entran, si la sincronización anda—, pero no <Fuerte>qué</Fuerte> escribís en
            ella. Tus compañeros tampoco: cada uno ve solo lo suyo.
          </Punto>
          <Punto titulo="Te podés ir cuando quieras">
            Desde tu perfil borrás tu cuenta y con ella todos tus datos de acá.{' '}
            <Fuerte>Eso no te da de baja del aula virtual ni del instituto</Fuerte>: tu cuenta de la
            facultad sigue intacta, solo desaparece lo que vive en Mi Cursada.
          </Punto>
        </ul>

        <div className="mt-7 flex flex-col gap-[10px]">
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

function Fuerte({ children }: { children: React.ReactNode }) {
  return <strong className="font-bold text-tx">{children}</strong>;
}

/** Un punto del aviso: título corto arriba, explicación abajo. */
function Punto({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <li className="border-l-2 border-bor2 pl-[14px]">
      <div className="text-[14.5px] font-bold text-tx">{titulo}</div>
      <p className="mt-1 text-[14px] leading-[1.55] text-tx2">{children}</p>
    </li>
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
      {pending ? 'Preparando tu cursada…' : 'Entendido, entrar a mi cursada'}
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
      {pending ? 'Saliendo…' : 'No, gracias'}
    </button>
  );
}
