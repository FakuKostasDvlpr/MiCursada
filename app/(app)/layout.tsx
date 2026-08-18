import { BottomNav } from '@/components/bottom-nav';
import { Contenedor } from '@/components/contenedor';
import { Logro } from '@/components/logro';
import { Sidebar } from '@/components/sidebar';
import { Toast } from '@/components/toast';
import { iniciales } from '@/lib/cursada';
import { getMaterias, getPerfil } from '@/lib/queries';
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
  const [perfil, materias] = await Promise.all([getPerfil(), getMaterias()]);
  // Total de notas de toda la cursada: es el hito que muestra el toast de logro.
  const totalNotas = materias.reduce(
    (n, m) => n + m.bloques.filter((b) => b.tipo !== 'divisor').length,
    0
  );

  return (
    <>
      <Sidebar
        nombre={perfil?.nombre ?? ''}
        iniciales={iniciales(perfil?.nombre ?? '')}
        avatarUrl={perfil?.avatarUrl ?? null}
      />
      <Contenedor>{children}</Contenedor>
      <BottomNav />
      <Logro totalNotas={totalNotas} />
      <Toast />
    </>
  );
}
