import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMateria } from '@/lib/queries';

export const dynamic = 'force-dynamic';

/** Placeholder mínimo del detalle de materia — el detalle real llega en Fase 5. */
export default async function PaginaDetalleMateria({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const materia = await getMateria(id);
  if (!materia) notFound();

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
          className="w-1 shrink-0 rounded-full"
          style={{ background: materia.color }}
        />
        <h1 className="text-2xl leading-[1.2] font-extrabold tracking-[-0.015em]">
          {materia.nombre}
        </h1>
      </div>
    </main>
  );
}
