// Dataset del panel admin para el refresco en vivo (cada 30 s desde
// components/admin-panel.tsx). Es la misma función que usa el server
// component de /admin: acá solo se expone por HTTP para que el panel se
// repregunte sin recargar la página.

import { formatInTimeZone } from 'date-fns-tz';
import { metricasAdmin } from '@/lib/admin-metricas';
import { TZ } from '@/lib/cursada';
import { esAdmin, hayAcceso } from '@/lib/sesion-actual';
import { supabaseConfigurado } from '@/lib/supabase/configurado';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  // Misma guarda doble que el layout de (admin), y por la misma razón: un
  // route handler es un GET que no pasa por ningún layout. 404 y no 403 —
  // un 403 confirmaría que la ruta existe (specs/panel-admin R1).
  if (!supabaseConfigurado()) return new Response('No encontrado', { status: 404 });
  if (!(await hayAcceso())) return new Response('No encontrado', { status: 404 });
  if (!(await esAdmin())) return new Response('No encontrado', { status: 404 });

  try {
    const panel = await metricasAdmin(new Date());
    // `actualizado` va acá y no lo calcula el cliente: la hora tiene que ser
    // la de Buenos Aires (TZ fija del proyecto), no la del dispositivo, y es
    // el mismo formato que arma el server component de /admin.
    return Response.json(
      { ...panel, actualizado: formatInTimeZone(new Date(panel.generado), TZ, 'HH:mm') },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    console.error('GET /api/admin/metricas:', e);
    return new Response('No se pudo armar el panel', { status: 500 });
  }
}
