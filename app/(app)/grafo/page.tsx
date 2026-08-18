import { GrafoCursada } from '@/components/grafo';
import { iniciales } from '@/lib/cursada';
import { totalesGrafo } from '@/lib/grafo';
import { getAvisos, getMaterias, getPerfil } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function PaginaGrafo() {
  const [materias, avisos, perfil] = await Promise.all([
    getMaterias(),
    getAvisos(),
    getPerfil(),
  ]);

  // `secciones` es el contenido entero del curso: no lo mira el grafo y sería
  // el 99% del payload que viaja al cliente.
  const paraElGrafo = materias.map((m) => ({ ...m, secciones: undefined }));
  const totales = totalesGrafo(materias, avisos);

  return (
    <main>
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-[-0.015em]">Grafo</h1>
        <div className="font-mono text-[11px] text-tx3">tu cursada como red</div>
      </header>

      <div className="mt-3 flex flex-wrap gap-4 font-mono text-[11px] text-tx3">
        <span>{totales.materias} materias</span>
        <span>{totales.notas} notas</span>
        <span>{totales.archivos} archivos</span>
        <span className={totales.avisos > 0 ? 'text-acc' : undefined}>
          {totales.avisos} avisos pendientes
        </span>
      </div>

      {materias.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-bor px-5 py-7 text-center text-[13.5px] text-tx3">
          Sin datos para graficar todavía. Cargá tus materias primero.
        </div>
      ) : (
        <>
          <GrafoCursada
            materias={paraElGrafo}
            avisos={avisos}
            iniciales={iniciales(perfil?.nombre ?? '')}
          />
          <div className="flex justify-center pt-[2px]">
            <span className="font-mono text-[10.5px] text-tx4">
              hover para leer cada ítem · click para ir
            </span>
          </div>
        </>
      )}
    </main>
  );
}
