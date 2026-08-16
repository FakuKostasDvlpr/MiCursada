import Image from 'next/image';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/login-form';
import { INSTITUTO } from '@/lib/instituto';
import { URL_MOODLE_DEFAULT, leerCredenciales } from '@/lib/moodle/credenciales';
import { hayAcceso } from '@/lib/sesion-actual';

export const dynamic = 'force-dynamic';

export default async function PaginaLogin() {
  // Si ya estás adentro, no tiene sentido volver a pedirte la contraseña.
  if (await hayAcceso()) redirect('/');

  // Del archivo de credenciales solo sale la URL: el token NUNCA llega al cliente.
  const url = (await leerCredenciales())?.url ?? URL_MOODLE_DEFAULT;

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-[360px] flex-col justify-center px-[18px] py-[30px]">
      {/* El logo del instituto, que es de quién son las credenciales que se
          piden acá. Va sobre chip blanco: el JPG tiene fondo blanco y en tema
          oscuro se vería el recuadro. */}
      <div className="mx-auto inline-flex items-center rounded-2xl bg-white px-[18px] py-[13px]">
        <Image
          src={INSTITUTO.logo}
          alt={INSTITUTO.logoAlt}
          width={INSTITUTO.logoAncho}
          height={INSTITUTO.logoAlto}
          priority
          className="h-[52px] w-auto"
        />
      </div>
      <div className="mt-[18px] text-center">
        <div className="kicker tracking-[0.16em]">Mi cursada · Turno noche</div>
        <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.015em]">Entrá a tu cursada</h1>
      </div>
      <LoginForm urlAula={url} />
    </main>
  );
}
