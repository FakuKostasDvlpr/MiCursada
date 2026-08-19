import { formatInTimeZone } from 'date-fns-tz';
import { AdminPanel } from '@/components/admin-panel';
import { panelDemo } from '@/lib/admin-demo';
import { metricasAdmin } from '@/lib/admin-metricas';
import { TZ } from '@/lib/cursada';
import { supabaseConfigurado } from '@/lib/supabase/configurado';

export const metadata = { title: 'Mi Cursada · Admin' };

// El panel se arma en cada request (nada que cachear: es monitoreo).
export const dynamic = 'force-dynamic';

/**
 * Panel de monitoreo (specs/panel-admin). La guarda vive en el layout del
 * grupo; acá solo se elige la fuente: métricas reales con Supabase, seed
 * sintético en dev local.
 */
export default async function PaginaAdmin() {
  const ahora = new Date();
  const demo = !supabaseConfigurado();
  const panel = demo ? panelDemo(ahora) : await metricasAdmin(ahora);
  return (
    <AdminPanel
      panel={panel}
      actualizado={formatInTimeZone(new Date(panel.generado), TZ, 'HH:mm')}
      demo={demo}
    />
  );
}
