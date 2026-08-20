import { Clock, MapPin, User } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AsistenciaMateria } from '@/components/asistencia';
import { EditarMateria } from '@/components/editar-materia';
import { MateriaDetalle } from '@/components/materia-detalle';
import { hoyISO, nombreDia } from '@/lib/cursada';
import { getAvisos, getMateria, getMaterias } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function PaginaDetalleMateria({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [materia, todosLosAvisos, todasLasMaterias] = await Promise.all([
    getMateria(id),
    getAvisos(),
    getMaterias(),
  ]);
  if (!materia) notFound();

  const avisos = todosLosAvisos.filter((a) => a.materiaId === materia.id);

  // Desde una nota se cita LO DE ESTA MATERIA: sus archivos, sus unidades y
  // módulos, y sus avisos pendientes. Las otras materias y los avisos ajenos
  // igual se le pasan porque el catálogo es también lo que resuelve los chips
  // ya guardados — `catalogoRefs` los marca como "no ofrecibles".
  const materiasRef = todasLasMaterias.map((m) => ({
    id: m.id,
    nombre: m.nombre,
    color: m.color as string,
  }));

  return (
    <main>
      <Link
        href="/materias"
        className="-ml-[2px] inline-flex min-h-[44px] items-center gap-[6px] pr-2 text-sm font-bold text-acc"
      >
        ‹ Volver
      </Link>

      <div className="mt-3 flex gap-[14px]">
        <div
          aria-hidden
          className="w-1 shrink-0 self-stretch rounded-full"
          style={{ background: materia.color }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-[10px] gap-y-1">
            <h1 className="text-2xl leading-[1.2] font-extrabold tracking-[-0.015em]">
              {materia.nombre}
            </h1>
            {materia.source === 'moodle' && (
              <span className="rounded-full border border-bor px-2 py-[3px] font-mono text-[10px] text-tx3">
                aula virtual
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <div className="flex items-center gap-[9px] text-[13.5px] text-tx2">
              <User size={15} strokeWidth={2} aria-hidden className="shrink-0 text-tx3" />
              <span className={materia.profe ? '' : 'text-tx4'}>
                {materia.profe || 'sin profe'}
              </span>
            </div>
            <div className="flex items-center gap-[9px] text-[13.5px] text-tx2">
              <MapPin size={15} strokeWidth={2} aria-hidden className="shrink-0 text-tx3" />
              <span className={materia.aula ? '' : 'text-tx4'}>{materia.aula || 'sin aula'}</span>
            </div>
            {materia.horarios.length === 0 ? (
              <div className="flex items-center gap-[9px]">
                <Clock size={15} strokeWidth={2} aria-hidden className="shrink-0 text-tx3" />
                <span className="font-mono text-[12.5px] text-tx4">sin horarios todavía</span>
              </div>
            ) : (
              materia.horarios.map((h) => (
                <div key={h.id} className="flex items-center gap-[9px]">
                  <Clock size={15} strokeWidth={2} aria-hidden className="shrink-0 text-tx3" />
                  <span className="font-mono text-[12.5px] text-tx2">
                    {nombreDia(h.dia)} {h.inicio}–{h.fin}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
        <EditarMateria materia={materia} />
      </div>

      <AsistenciaMateria materia={materia} />

      <MateriaDetalle
        materia={materia}
        avisos={avisos}
        materiasRef={materiasRef}
        avisosRef={todosLosAvisos}
        hoyIso={hoyISO(new Date())}
      />
    </main>
  );
}
