import { listarBibliotecaAvatares } from '@/app/actions';
import { PerfilModal } from '@/components/perfil-modal';
import { turnoDesdeMaterias } from '@/lib/cursada';
import { leerCredenciales } from '@/lib/moodle/credenciales';
import { getMaterias, getPerfil } from '@/lib/queries';
import { supabaseConfigurado } from '@/lib/supabase/configurado';

export const dynamic = 'force-dynamic';

/**
 * Intercepción de /perfil: navegando desde adentro de la app, el perfil se
 * abre como modal sobre la pantalla actual. Un F5 o un link directo caen en
 * app/(app)/perfil/page.tsx, que muestra el MISMO modal — el perfil nunca es
 * una página aparte. Lo único que cambia allá es que la ✕ va a Hoy, porque no
 * hay historia a la que volver.
 */
export default async function PerfilInterceptado() {
  const [perfil, cred, materias, biblioteca] = await Promise.all([
    getPerfil(),
    leerCredenciales(),
    getMaterias(),
    // Se resuelve acá y no al abrir la vista: así la grilla del avatar ya se
    // ve poblada, sin el parpadeo de "vacía y después aparecen".
    listarBibliotecaAvatares(),
  ]);
  // Del archivo de credenciales solo sale el usuario: el token NUNCA sale de ahí.
  const usuario = cred?.usuario ?? '';
  return (
    <PerfilModal
      perfil={perfil}
      usuario={usuario}
      conCuenta={supabaseConfigurado()}
      turno={turnoDesdeMaterias(materias)}
      biblioteca={biblioteca.ok ? biblioteca.urls : []}
    />
  );
}
