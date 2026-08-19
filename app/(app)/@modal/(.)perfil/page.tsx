import { PerfilModal } from '@/components/perfil-modal';
import { turnoDesdeMaterias } from '@/lib/cursada';
import { leerCredenciales } from '@/lib/moodle/credenciales';
import { getMaterias, getPerfil } from '@/lib/queries';
import { supabaseConfigurado } from '@/lib/supabase/configurado';

export const dynamic = 'force-dynamic';

/**
 * Intercepción de /perfil: navegando desde adentro de la app, el perfil se
 * abre como modal sobre la pantalla actual. Un F5 o un link directo a /perfil
 * siguen mostrando la página completa (app/(app)/perfil/page.tsx) — mismos
 * datos, misma vista, otra cáscara.
 */
export default async function PerfilInterceptado() {
  const [perfil, cred, materias] = await Promise.all([
    getPerfil(),
    leerCredenciales(),
    getMaterias(),
  ]);
  // Del archivo de credenciales solo sale el usuario: el token NUNCA sale de ahí.
  const usuario = cred?.usuario ?? '';
  return (
    <PerfilModal
      perfil={perfil}
      usuario={usuario}
      conCuenta={supabaseConfigurado()}
      turno={turnoDesdeMaterias(materias)}
    />
  );
}
