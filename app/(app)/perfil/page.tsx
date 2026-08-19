import { listarBibliotecaAvatares } from '@/app/actions';
import { PerfilModal } from '@/components/perfil-modal';
import { turnoDesdeMaterias } from '@/lib/cursada';
import { leerCredenciales } from '@/lib/moodle/credenciales';
import { getMaterias, getPerfil } from '@/lib/queries';
import { supabaseConfigurado } from '@/lib/supabase/configurado';

export const dynamic = 'force-dynamic';

/**
 * /perfil entrando derecho (link directo o F5). Es la MISMA cáscara modal que
 * la ruta interceptada: el perfil siempre se ve como modal, nunca como página
 * aparte. Lo único que cambia es el cierre — acá no hay historia a la que
 * volver, así que la ✕ lleva a Hoy en vez de hacer `back()`.
 */
export default async function PaginaPerfil() {
  const [perfil, cred, materias, biblioteca] = await Promise.all([
    getPerfil(),
    leerCredenciales(),
    getMaterias(),
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
      cerrarCon="home"
    />
  );
}
