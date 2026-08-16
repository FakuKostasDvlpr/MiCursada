import { Clock, MapPin, User } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EditarMateria } from '@/components/editar-materia';
import { MateriaDetalle } from '@/components/materia-detalle';
import { nombreDia } from '@/lib/cursada';
import { getAvisos, getMateria } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function PaginaDetalleMateria({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [materia, todosLosAvisos] = await Promise.all([getMateria(id), getAvisos()]);
  if (!materia) notFound();

  const avisos = todosLosAvisos.filter((a) => a.materiaId === materia.id);

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

      <MateriaDetalle materia={materia} avisos={avisos} />
    </main>
  );
}
