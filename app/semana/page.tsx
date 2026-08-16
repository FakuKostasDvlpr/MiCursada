import Link from 'next/link';
import { semana } from '@/lib/cursada';
import { getMaterias } from '@/lib/queries';
import type { Horario, Materia } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Clases de un día (1–6), ordenadas por hora de inicio. */
function clasesDeDia(
  materias: Materia[],
  dia: number
): { materia: Materia; horario: Horario }[] {
  const out: { materia: Materia; horario: Horario }[] = [];
  for (const materia of materias) {
    for (const horario of materia.horarios) {
      if (horario.dia === dia) out.push({ materia, horario });
    }
  }
  out.sort((a, b) => a.horario.inicio.localeCompare(b.horario.inicio));
  return out;
}

export default async function PaginaSemana() {
  const materias = await getMaterias();
  const { dias, rango } = semana(new Date());

  return (
    <main>
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-[-0.015em]">Semana</h1>
        <div className="font-mono text-xs text-tx3">{rango}</div>
      </header>

      <div className="mt-5 flex flex-col gap-[10px]">
        {dias.map((d) => {
          const clases = clasesDeDia(materias, d.dia);
          return (
            <div
              key={d.dia}
              className={`rounded-[14px] border bg-sup px-[14px] py-3 ${
                d.esHoy ? 'border-acc' : 'border-bor'
              }`}
            >
              <div className="flex items-center gap-[10px]">
                <span className="text-sm font-bold">{d.nombre}</span>
                <span className="font-mono text-[11.5px] text-tx3">{d.fecha}</span>
                {d.esHoy && (
                  <span className="rounded-full bg-acc-bg px-[9px] py-[3px] font-mono text-[10px] font-semibold tracking-[0.1em] text-acc-fg uppercase">
                    hoy
                  </span>
                )}
              </div>
              {clases.length === 0 ? (
                <div className="mt-2 font-mono text-[12.5px] text-tx4">— libre</div>
              ) : (
                <div className="mt-2 flex flex-col gap-[6px]">
                  {clases.map(({ materia, horario }) => (
                    <Link
                      key={horario.id}
                      href={`/materias/${materia.id}`}
                      className="flex min-h-[44px] items-center gap-[10px] rounded-[11px] border border-bor bg-bg px-3 py-[9px] !text-tx"
                    >
                      <span
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: materia.color }}
                      />
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
                        {materia.nombre}
                      </span>
                      <span className="font-mono text-xs whitespace-nowrap text-tx2">
                        {horario.inicio}–{horario.fin}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
