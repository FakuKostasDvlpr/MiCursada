import { PerfilVista } from '@/components/perfil-vista';
import { turnoDesdeMaterias } from '@/lib/cursada';
import { leerCredenciales } from '@/lib/moodle/credenciales';
import { getMaterias, getPerfil } from '@/lib/queries';
import { supabaseConfigurado } from '@/lib/supabase/configurado';

export const dynamic = 'force-dynamic';

export default async function PaginaPerfil() {
  const [perfil, cred, materias] = await Promise.all([
    getPerfil(),
    leerCredenciales(),
    getMaterias(),
  ]);
  // Del archivo de credenciales solo sale el usuario: el token NUNCA sale de ahí.
  const usuario = cred?.usuario ?? '';

  return (
    <main className="mx-auto max-w-[400px] py-[26px]">
      <div className="text-center">
        <div className="kicker tracking-[0.16em]">Tu perfil</div>
        <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.015em]">
          {perfil?.nombre || 'Tu cursada'}
        </h1>
      </div>
      <PerfilVista
        perfil={perfil}
        usuario={usuario}
        conCuenta={supabaseConfigurado()}
        turno={turnoDesdeMaterias(materias)}
      />
    </main>
  );
}
