'use client';

// Alta manual de una materia desde /materias.
//
// Existe porque el aula virtual no siempre trae todo: materias que no figuran
// en Moodle, que no se recuperaron en el sync, o que se cursan por fuera. Sin
// esto no hay forma de cargarles un horario ni una nota.

import { Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { crearMateriaManual } from '@/app/actions';
import { lanzarToast } from '@/lib/toast';

export function AgregarMateria() {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const [guardando, empezar] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const abrir = () => {
    setAbierto(true);
    setError('');
    // El foco va después del render: el input todavía no existe en este tick.
    requestAnimationFrame(() => input.current?.focus());
  };

  const cerrar = () => {
    setAbierto(false);
    setNombre('');
    setError('');
  };

  const guardar = () => {
    const limpio = nombre.trim();
    if (!limpio) {
      setError('Poné un nombre para la materia.');
      return;
    }
    setError('');
    empezar(async () => {
      const r = await crearMateriaManual(limpio);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      cerrar();
      lanzarToast('Materia agregada', 'ok');
      // A la materia recién creada, que es donde se le cargan día y horario.
      router.push(`/materias/${encodeURIComponent(r.id)}`);
    });
  };

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={abrir}
        className="tactil inline-flex cursor-pointer items-center gap-1.5 rounded-[11px] border border-bor2 bg-sup px-3 py-2 text-[12.5px] font-bold text-tx2"
      >
        <Plus size={14} strokeWidth={2.5} aria-hidden />
        Agregar materia
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          ref={input}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              guardar();
            }
            if (e.key === 'Escape') cerrar();
          }}
          placeholder="Nombre de la materia"
          aria-label="Nombre de la materia"
          maxLength={140}
          disabled={guardando}
          className="tactil min-w-0 flex-1 rounded-[11px] border border-bor bg-sup px-3 py-2 text-[13.5px] text-tx placeholder:text-tx4"
        />
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="tactil cursor-pointer rounded-[11px] bg-acc-bg px-3.5 py-2 text-[12.5px] font-bold text-acc-fg disabled:opacity-60"
        >
          {guardando ? 'Creando…' : 'Crear'}
        </button>
        <button
          type="button"
          onClick={cerrar}
          disabled={guardando}
          aria-label="Cancelar"
          className="tactil grid cursor-pointer place-items-center rounded-[11px] border border-bor px-2.5 py-2 text-tx3"
        >
          <X size={15} strokeWidth={2.4} aria-hidden />
        </button>
      </div>
      {error ? <span className="text-[12.5px] text-[#fb7185]">{error}</span> : null}
    </div>
  );
}
