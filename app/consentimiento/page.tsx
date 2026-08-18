import { Consentimiento } from '@/components/consentimiento';
import { exigirSesion } from '@/lib/sesion-actual';

export const dynamic = 'force-dynamic';

/**
 * Pantalla de consentimiento del primer ingreso. Vive FUERA del grupo (app)
 * a propósito: si estuviera adentro, el redirect que agrega ese layout
 * cuando falta el consentimiento la alcanzaría a ella también y armaría un
 * loop — por eso pide su propia sesión acá, en vez de depender del layout.
 */
export default async function PaginaConsentimiento() {
  await exigirSesion();

  return (
    <main className="px-[18px] py-[30px]">
      <Consentimiento />
    </main>
  );
}
