import { HoyLive } from '@/components/hoy-live';
import { resumenNota, type ResumenNota } from '@/lib/aviso-nota';
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

  // La nota vinculada del modal de detalle se resuelve acá, igual que en
  // /avisos: el cliente no necesita los bloques de todas las materias para
  // pintar un modal. Si la nota se borró, el aviso queda sin nota y no se rompe
  // nada. Solo los pendientes: la card de Hoy no muestra hechos.
  const notas: Record<string, ResumenNota> = {};
  for (const a of avisos) {
    if (a.hecho || !a.notaId || !a.materiaId) continue;
    const bloque = materias
      .find((m) => m.id === a.materiaId)
      ?.bloques.find((b) => b.id === a.notaId);
    if (bloque) notas[a.id] = resumenNota(bloque);
  }

  return (
    <main>
      {/* El footer de sync y el panel del aula virtual viven dentro de HoyLive:
          comparten el estado del token con el indicador del header. */}
      <HoyLive
        materias={materias}
        avisos={avisos}
        nombre={perfil?.nombre ?? ''}
        iniciales={iniciales(perfil?.nombre ?? '')}
        avatarUrl={perfil?.avatarUrl ?? null}
        instituto={perfil?.instituto ?? null}
        inicialIso={new Date().toISOString()}
        syncIso={sync?.corridaAt ?? null}
        notas={notas}
      />
    </main>
  );
}
