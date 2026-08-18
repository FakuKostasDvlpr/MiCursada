import { BottomNav } from '@/components/bottom-nav';
import { Consentimiento } from '@/components/consentimiento';
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
 * Si falta el consentimiento (solo en modo Supabase) el aviso se muestra
 * COMO CAPA encima de esta misma app, difuminada: se ve la cursada atrás,
 * borrosa y sin poder tocarla, en vez de mandar a una pantalla aparte. Las
 * Server Actions tienen su propia guarda de consentimiento (`consintio()`),
 * así que la app de atrás es solo lectura de los datos de esa persona hasta
 * que acepte. La ruta `/consentimiento` sigue existiendo como respaldo.
 *
 * El chequeo reusa el `perfil` que ya trae `getPerfil()` (agregado a su
 * select) en vez de una query aparte: una sola consulta a `perfiles` por
 * página, no dos.
 */
export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  await exigirSesion();
  const perfil = await getPerfil();

  const faltaConsentir = supabaseConfigurado() && !perfil?.consentimientoEn;

  return (
    <>
      {/* aria-hidden + inert: lo de atrás es decorado mientras el aviso está arriba. */}
      <div aria-hidden={faltaConsentir || undefined} inert={faltaConsentir || undefined}>
        <Sidebar
          nombre={perfil?.nombre ?? ''}
          iniciales={iniciales(perfil?.nombre ?? '')}
          avatarUrl={perfil?.avatarUrl ?? null}
          carrera={perfil?.carrera ?? null}
        />
        <Contenedor>{children}</Contenedor>
        <BottomNav />
      </div>
      {faltaConsentir ? <Consentimiento /> : null}
    </>
  );
}
