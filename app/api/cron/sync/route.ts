// Cron diario (vercel.json): refresca el contenido compartido de madrugada.
// Recorre los usuarios con credencial; el primero que sincroniza deja frescos
// los cursos compartidos, así que los que cursan lo mismo se saltean solos.
// Protegido con CRON_SECRET (Vercel lo manda como Bearer).
//
// A diferencia del botón y el login, este barrido corre en background sin que
// nadie lo dispare: por eso NO alcanza con que haya credencial, hace falta
// que el usuario haya dado su consentimiento (perfiles.consentimiento_en). Se
// arma un set aparte con los `user_id` consentidos y se saltea a quien no
// esté: no hay FK directa entre `credenciales` y `perfiles` (ambas apuntan a
// auth.users, no entre sí) así que un embed de PostgREST no es directo, y dos
// queries simples son más claras que forzar el join.

import { registrarEvento } from '@/lib/eventos';
import type { Credencial } from '@/lib/moodle/credenciales';
import { leerCredencialDb } from '@/lib/moodle/credenciales-db';
import { adminClient } from '@/lib/supabase/admin';
import { cursadaFresca, sincronizarCompartido } from '@/lib/sync-compartido';

export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(null, { status: 401 });
  }

  const admin = adminClient();
  const { data: usuarios, error } = await admin.from('credenciales').select('user_id');
  if (error) return Response.json({ ok: false }, { status: 500 });

  const { data: consentidos, error: errorConsentidos } = await admin
    .from('perfiles')
    .select('user_id')
    .not('consentimiento_en', 'is', null);
  if (errorConsentidos) return Response.json({ ok: false }, { status: 500 });
  const consentidosSet = new Set((consentidos ?? []).map((p) => p.user_id as string));

  let ok = 0;
  let errores = 0;
  let salteados = 0;
  for (const { user_id } of usuarios ?? []) {
    if (!consentidosSet.has(user_id)) {
      salteados += 1;
      continue;
    }
    try {
      // Las iteraciones NO son independientes: la deduplicación depende del orden. El primero que
      // sincroniza deja frescos los cursos compartidos y los que cursan lo mismo se saltean por
      // esta misma condición. En paralelo todos leerían "no fresco" a la vez y bajarían la misma
      // materia N veces.
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      if (await cursadaFresca(user_id)) continue;
      const cred: Credencial | null = await leerCredencialDb(user_id);
      if (!cred) continue;
      await sincronizarCompartido(cred, user_id, 'cron');
      ok += 1;
    } catch (e) {
      errores += 1;
      console.error('cron sync:', e instanceof Error ? e.message : 'error');
      await admin.from('sync_log').insert({
        origen: 'cron',
        resultado: 'error',
        detalle: e instanceof Error ? e.message.slice(0, 200) : 'error',
      });
      await registrarEvento('sync_error', user_id, { origen: 'cron' });
    }
  }
  return Response.json({ ok: true, sincronizados: ok, errores, salteados });
}
