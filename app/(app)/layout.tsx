import { BottomNav } from '@/components/bottom-nav';
import { Consentimiento } from '@/components/consentimiento';
import { Contenedor } from '@/components/contenedor';
import { Logro } from '@/components/logro';
import { Sidebar } from '@/components/sidebar';
import { Toast } from '@/components/toast';
import { iniciales } from '@/lib/cursada';
import { getMaterias, getPerfil } from '@/lib/queries';
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
  const [perfil, materias] = await Promise.all([getPerfil(), getMaterias()]);
  // Total de notas de toda la cursada: es el hito que muestra el toast de logro.
  const totalNotas = materias.reduce(
    (n, m) => n + m.bloques.filter((b) => b.tipo !== 'divisor').length,
    0
  );

  const faltaConsentir = supabaseConfigurado() && !perfil?.consentimientoEn;

  return (
    <>
      {/* aria-hidden + inert: lo de atrás es decorado mientras el aviso está arriba.
          El logro y el toast van adentro: si falta consentir tampoco tienen que sonar. */}
      <div aria-hidden={faltaConsentir || undefined} inert={faltaConsentir || undefined}>
        <Sidebar
          nombre={perfil?.nombre ?? ''}
          iniciales={iniciales(perfil?.nombre ?? '')}
          avatarUrl={perfil?.avatarUrl ?? null}
          carrera={perfil?.carrera ?? null}
        />
        <Contenedor>{children}</Contenedor>
        <BottomNav />
        <Logro totalNotas={totalNotas} />
        <Toast />
      </div>
      {faltaConsentir ? <Consentimiento /> : null}
    </>
  );
}
