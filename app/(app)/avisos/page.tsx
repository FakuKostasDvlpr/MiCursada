import { AvisosLista } from '@/components/avisos-lista';
import { NuevoAviso } from '@/components/nuevo-aviso';
import { resumenNota, type ResumenNota } from '@/lib/aviso-nota';
import { getAvisos, getMaterias } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function PaginaAvisos() {
  const [avisos, materias] = await Promise.all([getAvisos(), getMaterias()]);

  // El snippet de la nota vinculada se resuelve en el server: el cliente no
  // necesita los bloques de todas las materias para pintar una línea. Si la
  // nota se borró, el aviso queda sin snippet y no se rompe nada.
  // El índice por id se arma una sola vez: buscar la materia con `find` dentro
  // del loop era O(avisos × materias).
  const porId = new Map(materias.map((m) => [m.id, m]));
  const notas: Record<string, ResumenNota> = {};
  for (const a of avisos) {
    if (!a.notaId || !a.materiaId) continue;
    const bloque = porId.get(a.materiaId)?.bloques.find((b) => b.id === a.notaId);
    if (bloque) notas[a.id] = resumenNota(bloque);
  }

  return (
    <main>
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-[-0.015em]">Avisos</h1>
        <NuevoAviso materias={materias.map((m) => ({ id: m.id, nombre: m.nombre }))} />
      </header>
      <AvisosLista
        avisos={avisos}
        materias={materias.map((m) => ({ id: m.id, nombre: m.nombre, color: m.color }))}
        notas={notas}
        // No hay mismatch posible: esta página es un Server Component puro (force-dynamic, sin
        // "use client"), así que el instante se evalúa UNA vez en el servidor y baja serializado
        // como prop. El cliente nunca lo re-evalúa en el render inicial.
        // react-doctor-disable-next-line react-doctor/rendering-hydration-mismatch-time
        ahoraIso={new Date().toISOString()}
      />
    </main>
  );
}
