import { redirect } from 'next/navigation';
import { BottomNav } from '@/components/bottom-nav';
import { Contenedor } from '@/components/contenedor';
import { Sidebar } from '@/components/sidebar';
import { iniciales } from '@/lib/cursada';
import { getPerfil } from '@/lib/queries';
import { exigirSesion } from '@/lib/sesion-actual';
import { supabaseConfigurado } from '@/lib/supabase/configurado';
import { createClient } from '@/lib/supabase/server';

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
 */
export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  await exigirSesion();

  if (supabaseConfigurado()) {
    const supabase = await createClient();
    const { data } = await supabase.from('perfiles').select('consentimiento_en').maybeSingle();
    if (!data?.consentimiento_en) redirect('/consentimiento');
  }

  const perfil = await getPerfil();

  return (
    <>
      <Sidebar
        nombre={perfil?.nombre ?? ''}
        iniciales={iniciales(perfil?.nombre ?? '')}
        avatarUrl={perfil?.avatarUrl ?? null}
      />
      <Contenedor>{children}</Contenedor>
      <BottomNav />
    </>
  );
}
