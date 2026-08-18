import { redirect } from 'next/navigation';
import { BottomNav } from '@/components/bottom-nav';
import { Contenedor } from '@/components/contenedor';
import { Sidebar } from '@/components/sidebar';
import { iniciales } from '@/lib/cursada';
import { getPerfil } from '@/lib/queries';
import { exigirSesion } from '@/lib/sesion-actual';
import { supabaseConfigurado } from '@/lib/supabase/configurado';

/**
 * Layout de todo lo que requiere estar adentro: acá se exige la sesión (una
 * sola vez, para las cuatro pestañas, el detalle de materia y el perfil), se
 * chequea el consentimiento (solo en modo Supabase) y se arma el shell con
 * la nav.
 *
 * Sin sesión, `exigirSesion` corta el render y manda a /login, así que nada de
 * lo que está adentro llega a ejecutarse ni a leer datos.
 *
 * `/consentimiento` vive FUERA de este grupo a propósito: si estuviera
 * adentro, este mismo redirect la alcanzaría a ella y armaría un loop.
 *
 * El chequeo de consentimiento reusa el `perfil` que ya trae `getPerfil()`
 * (agregado a su select) en vez de una query aparte: una sola consulta a
 * `perfiles` por página, no dos.
 */
export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  await exigirSesion();
  const perfil = await getPerfil();

  if (supabaseConfigurado() && !perfil?.consentimientoEn) redirect('/consentimiento');

  return (
    <>
      <Sidebar
        nombre={perfil?.nombre ?? ''}
        iniciales={iniciales(perfil?.nombre ?? '')}
        avatarUrl={perfil?.avatarUrl ?? null}
        carrera={perfil?.carrera ?? null}
      />
      <Contenedor>{children}</Contenedor>
      <BottomNav />
    </>
  );
}
