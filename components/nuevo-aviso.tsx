'use client';

import { useState } from 'react';
import { crearAviso } from '@/app/actions';
import { Rueda } from '@/components/cargando';
import { Modal } from '@/components/modal';
import { hoyISO } from '@/lib/cursada';

type MateriaOpcion = { id: string; nombre: string };

const claseInput =
  'w-full min-h-[46px] rounded-xl border border-bor bg-bg px-[14px] text-[15px] text-tx';

const claseLabel = 'kicker mb-[7px] block';

/** Botón "+ Nuevo" de /avisos + modal "Nuevo aviso" (título, materia, fecha). */
export function NuevoAviso({ materias }: { materias: MateriaOpcion[] }) {
  const [abierto, setAbierto] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [materiaId, setMateriaId] = useState('');
  const [fecha, setFecha] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const abrir = () => {
    setTitulo('');
    setMateriaId('');
    setFecha(hoyISO(new Date()));
    setError('');
    setAbierto(true);
  };

  const guardar = async () => {
    if (!titulo.trim() || !fecha) {
      setError('Poné un título y una fecha.');
      return;
    }
    setGuardando(true);
    setError('');
    const resultado = await crearAviso({
      titulo: titulo.trim(),
      materiaId: materiaId || null,
      fecha,
    });
    setGuardando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setAbierto(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="min-h-[44px] cursor-pointer rounded-xl bg-acc-bg px-4 text-sm font-bold text-acc-fg"
      >
        + Nuevo
      </button>

      <Modal abierto={abierto} titulo="Nuevo aviso" onCerrar={() => setAbierto(false)}>
        <div className="flex flex-col gap-4">
          <div>
            <label className={claseLabel} htmlFor="na-titulo">
              Título
            </label>
            <input
              id="na-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej: Entrega del TP2"
              className={claseInput}
            />
          </div>
          <div>
            <label className={claseLabel} htmlFor="na-materia">
              Materia
            </label>
            <select
              id="na-materia"
              value={materiaId}
              onChange={(e) => setMateriaId(e.target.value)}
              className="min-h-[46px] w-full rounded-xl border border-bor bg-bg px-3 text-[15px] text-tx"
            >
              <option value="">General</option>
              {materias.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={claseLabel} htmlFor="na-fecha">
              Fecha
            </label>
            <input
              id="na-fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="min-h-[46px] w-full rounded-xl border border-bor bg-bg px-[14px] font-mono text-sm text-tx"
            />
          </div>

          {error && <div className="text-[13px] text-vencido">{error}</div>}

          <div className="mt-[2px] flex gap-[10px]">
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="min-h-12 cursor-pointer rounded-xl border border-bor2 px-[18px] text-sm font-bold text-tx2"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={guardando}
              className="inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-acc-bg text-[14.5px] font-bold text-acc-fg disabled:opacity-60"
            >
              {guardando && <Rueda sobreAmbar />}
              {guardando ? 'Guardando…' : 'Guardar aviso'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
