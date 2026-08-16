import { PerfilForm } from '@/components/perfil-form';
import { getPerfil } from '@/lib/queries';
import { supabaseConfigurado } from '@/lib/supabase/configurado';

export const dynamic = 'force-dynamic';

export default async function PaginaPerfil() {
  const perfil = await getPerfil();

  return (
    <main className="mx-auto max-w-[400px] py-[26px]">
      <div className="text-center">
        <div className="kicker tracking-[0.16em]">Tu perfil</div>
        <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.015em]">Contanos quién sos</h1>
      </div>
      <PerfilForm perfil={perfil} configurado={supabaseConfigurado()} />
    </main>
  );
}
