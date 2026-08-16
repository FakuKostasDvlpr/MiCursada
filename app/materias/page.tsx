import Link from 'next/link';
import { nombreDia } from '@/lib/cursada';
import { getAvisos, getMaterias } from '@/lib/queries';

export const dynamic = 'force-dynamic';

/** "2 notas" / "1 arch." / "3 avisos". */
const nTxt = (n: number, sing: string, plur: string) => `${n} ${n === 1 ? sing : plur}`;

export default async function PaginaMaterias() {
  const [materias, avisos] = await Promise.all([getMaterias(), getAvisos()]);

  return (
    <main>
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-[-0.015em]">Materias</h1>
        {/* Placeholder: el modal de nueva materia llega en Fase 5. */}
        <button
          type="button"
          aria-disabled="true"
          className="min-h-[44px] cursor-default rounded-xl bg-acc-bg px-4 text-sm font-bold text-acc-fg"
        >
          + Nueva
        </button>
      </header>

      {materias.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-bor px-5 py-7 text-center text-[13.5px] text-tx3">
          Todavía no cargaste materias. Empezá por acá arriba.
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(165px,1fr))] gap-3">
          {materias.map((m) => {
            const notas = m.bloques.filter((b) => b.tipo !== 'divisor').length;
            const pendientes = avisos.filter((a) => a.materiaId === m.id && !a.hecho).length;
            return (
              <Link
                key={m.id}
                href={`/materias/${m.id}`}
                className="flex min-h-[128px] flex-col gap-[10px] rounded-[14px] border border-bor bg-sup p-[14px] !text-tx"
              >
                <span className="flex items-start gap-[9px]">
                  <span
                    aria-hidden
                    className="mt-[5px] h-2 w-2 shrink-0 rounded-full"
                    style={{ background: m.color }}
                  />
                  <span className="text-[15px] leading-[1.3] font-bold">{m.nombre}</span>
                </span>
                <span className="flex flex-col gap-[3px]">
                  {m.horarios.map((h) => (
                    <span key={h.id} className="font-mono text-[11.5px] text-tx2">
                      {nombreDia(h.dia).slice(0, 3)} {h.inicio}–{h.fin}
                    </span>
                  ))}
                </span>
                <span className="mt-auto font-mono text-[11px] text-tx3">
                  {nTxt(notas, 'nota', 'notas')} · {nTxt(m.archivos.length, 'arch.', 'arch.')} ·{' '}
                  <span className={pendientes > 0 ? 'text-acc' : ''}>
                    {nTxt(pendientes, 'aviso', 'avisos')}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
