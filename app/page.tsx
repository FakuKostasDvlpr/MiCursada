import { formatDistanceToNowStrict } from 'date-fns';
import { es } from 'date-fns/locale';
import { HoyLive } from '@/components/hoy-live';
import { iniciales } from '@/lib/cursada';
import { getAvisos, getMaterias, getPerfil, getUltimaSync } from '@/lib/queries';

export const dynamic = 'force-dynamic';

/** "hace 2 h" / "hace 35 min" / "hace 3 d". */
function haceTexto(iso: string): string {
  return `hace ${formatDistanceToNowStrict(new Date(iso), { locale: es })}`
    .replace(/ horas?/, ' h')
    .replace(/ minutos?/, ' min')
    .replace(/ segundos?/, ' s')
    .replace(/ días?/, ' d');
}

export default async function PaginaHoy() {
  const [materias, avisos, perfil, sync] = await Promise.all([
    getMaterias(),
    getAvisos(),
    getPerfil(),
    getUltimaSync(),
  ]);

  return (
    <main>
      <HoyLive
        materias={materias}
        avisos={avisos}
        iniciales={iniciales(perfil?.nombre ?? '')}
        inicialIso={new Date().toISOString()}
      />
      {sync && (
        <div className="mt-[34px] flex items-center justify-center gap-2">
          <span aria-hidden className="h-[6px] w-[6px] rounded-full bg-sync-ok" />
          <span className="font-mono text-[11px] text-tx3">
            Sincronizado con el aula virtual · {haceTexto(sync.corridaAt)}
          </span>
        </div>
      )}
    </main>
  );
}
