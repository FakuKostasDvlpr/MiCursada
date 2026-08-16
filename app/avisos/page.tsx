import { AvisosLista } from '@/components/avisos-lista';
import { NuevoAviso } from '@/components/nuevo-aviso';
import { getAvisos, getMaterias } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function PaginaAvisos() {
  const [avisos, materias] = await Promise.all([getAvisos(), getMaterias()]);

  return (
    <main>
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-[-0.015em]">Avisos</h1>
        <NuevoAviso materias={materias.map((m) => ({ id: m.id, nombre: m.nombre }))} />
      </header>
      <AvisosLista
        avisos={avisos}
        materias={materias.map((m) => ({ id: m.id, nombre: m.nombre, color: m.color }))}
        ahoraIso={new Date().toISOString()}
      />
    </main>
  );
}
