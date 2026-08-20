import Link from 'next/link';
import { ArmarSemana } from '@/components/armar-semana';
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

      {/* Se abre solo cuando no hay ningún horario cargado: sin esto, la grilla
          de abajo dice "— libre" los seis días y parece un dato, no un
          "todavía no lo configuraste". */}
      <ArmarSemana materias={materias} />

      {/* 1 columna en móvil, 2 en desktop (cards al tope de su fila).
          `grid-cols-1` no es decorativo: sin declarar columnas, la grilla arma
          una columna implícita de tamaño `auto`, y una pista `auto` se estira
          hasta el max-content de su contenido. Con un nombre de materia largo
          eso hacía la card de 623px adentro de una pantalla de 360, y la mitad
          derecha —el horario incluido— quedaba cortada. `grid-cols-1` de
          Tailwind es `minmax(0, 1fr)`, que es justo el piso de 0 que le faltaba
          (el mismo que ya traía la versión de dos columnas). */}
      <div className="mt-5 grid grid-cols-1 items-start gap-[10px] min-[641px]:grid-cols-[repeat(2,minmax(0,1fr))]">
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
