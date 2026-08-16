import { BottomNav } from '@/components/bottom-nav';
import { Contenedor } from '@/components/contenedor';
import { Sidebar } from '@/components/sidebar';
import { iniciales } from '@/lib/cursada';
import { getPerfil } from '@/lib/queries';
import { exigirSesion } from '@/lib/sesion-actual';

/**
 * Layout de todo lo que requiere estar adentro: acá se exige la sesión (una
 * sola vez, para las cuatro pestañas, el detalle de materia y el perfil) y se
 * arma el shell con la nav.
 *
 * Sin sesión, `exigirSesion` corta el render y manda a /login, así que nada de
 * lo que está adentro llega a ejecutarse ni a leer datos.
 */
export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  await exigirSesion();
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
