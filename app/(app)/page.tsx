import { HoyLive } from '@/components/hoy-live';
import { iniciales } from '@/lib/cursada';
import { getAvisos, getMaterias, getPerfil, getUltimaSync } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function PaginaHoy() {
  const [materias, avisos, perfil, sync] = await Promise.all([
    getMaterias(),
    getAvisos(),
    getPerfil(),
    getUltimaSync(),
  ]);

  return (
    <main>
      {/* El footer de sync y el panel del aula virtual viven dentro de HoyLive:
          comparten el estado del token con el indicador del header. */}
      <HoyLive
        materias={materias}
        avisos={avisos}
        iniciales={iniciales(perfil?.nombre ?? '')}
        avatarUrl={perfil?.avatarUrl ?? null}
        inicialIso={new Date().toISOString()}
        syncIso={sync?.corridaAt ?? null}
      />
    </main>
  );
}
