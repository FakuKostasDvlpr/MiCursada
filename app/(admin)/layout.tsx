import { notFound } from 'next/navigation';
import { esAdmin, exigirSesion } from '@/lib/sesion-actual';
import { supabaseConfigurado } from '@/lib/supabase/configurado';

/**
 * Grupo del panel de administración: pantalla independiente, SIN el shell de
 * (app) — el prototipo trae su propio header y acá no van sidebar ni bottom nav.
 *
 * La guarda es doble: sesión + admin. Para cualquier usuario que no sea el
 * admin la ruta devuelve 404 (`notFound`), no 403: un 403 confirmaría que la
 * ruta existe. En modo local (sin Supabase) el panel solo existe en dev, con
 * datos sintéticos (specs/panel-admin R2).
 */
export default async function LayoutAdmin({ children }: { children: React.ReactNode }) {
  await exigirSesion();
  if (supabaseConfigurado()) {
    if (!(await esAdmin())) notFound();
  } else if (process.env.NODE_ENV === 'production') {
    notFound();
  }
  return <>{children}</>;
}
