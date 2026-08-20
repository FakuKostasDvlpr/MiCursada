'use client';

import { useReducer } from 'react';
import { crearAviso } from '@/app/actions';
import { Rueda } from '@/components/cargando';
import { Modal } from '@/components/modal';
import { hoyISO } from '@/lib/cursada';

type MateriaOpcion = { id: string; nombre: string };

const claseInput =
  'w-full min-h-[46px] rounded-xl border border-bor bg-bg px-[14px] text-[15px] text-tx';

const claseLabel = 'kicker mb-[7px] block';

// El formulario entero es UN estado: abrir lo resetea de una, guardar lo mueve
// de golpe. Con un useState por campo había que acordarse de tocarlos todos en
// cada transición; acá cada acción deja el formulario consistente.
type Estado = {
  abierto: boolean;
  titulo: string;
  materiaId: string;
  fecha: string;
  error: string;
  guardando: boolean;
};

type Accion =
  | { tipo: 'abrir'; hoy: string }
  | { tipo: 'cerrar' }
  | { tipo: 'campo'; campo: 'titulo' | 'materiaId' | 'fecha'; valor: string }
  | { tipo: 'guardando' }
  | { tipo: 'error'; error: string }
  | { tipo: 'guardado' };

const INICIAL: Estado = {
  abierto: false,
  titulo: '',
  materiaId: '',
  fecha: '',
  error: '',
  guardando: false,
};

function reducir(e: Estado, a: Accion): Estado {
  switch (a.tipo) {
    case 'abrir':
      return { ...INICIAL, abierto: true, fecha: a.hoy };
    case 'cerrar':
      return { ...e, abierto: false };
    case 'campo':
      return { ...e, [a.campo]: a.valor };
    case 'guardando':
      return { ...e, guardando: true, error: '' };
    case 'error':
      return { ...e, guardando: false, error: a.error };
    case 'guardado':
      return { ...e, guardando: false, abierto: false };
  }
}

/** Botón "+ Nuevo" de /avisos + modal "Nuevo aviso" (título, materia, fecha). */
export function NuevoAviso({ materias }: { materias: MateriaOpcion[] }) {
  const [st, dispatch] = useReducer(reducir, INICIAL);

  const abrir = () => dispatch({ tipo: 'abrir', hoy: hoyISO(new Date()) });

  const guardar = async () => {
    if (!st.titulo.trim() || !st.fecha) {
      dispatch({ tipo: 'error', error: 'Poné un título y una fecha.' });
      return;
    }
    dispatch({ tipo: 'guardando' });
    const resultado = await crearAviso({
      titulo: st.titulo.trim(),
      materiaId: st.materiaId || null,
      fecha: st.fecha,
    });
    if (!resultado.ok) {
      dispatch({ tipo: 'error', error: resultado.error });
      return;
    }
    dispatch({ tipo: 'guardado' });
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

      <Modal abierto={st.abierto} titulo="Nuevo aviso" onCerrar={() => dispatch({ tipo: 'cerrar' })}>
        <div className="flex flex-col gap-4">
          <div>
            <label className={claseLabel} htmlFor="na-titulo">
              Título
            </label>
            <input
              id="na-titulo"
              value={st.titulo}
              onChange={(e) => dispatch({ tipo: 'campo', campo: 'titulo', valor: e.target.value })}
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
              value={st.materiaId}
              onChange={(e) =>
                dispatch({ tipo: 'campo', campo: 'materiaId', valor: e.target.value })
              }
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
              value={st.fecha}
              onChange={(e) => dispatch({ tipo: 'campo', campo: 'fecha', valor: e.target.value })}
              className="min-h-[46px] w-full rounded-xl border border-bor bg-bg px-[14px] font-mono text-sm text-tx"
            />
          </div>

          {st.error && <div className="text-[13px] text-vencido">{st.error}</div>}

          <div className="mt-[2px] flex gap-[10px]">
            <button
              type="button"
              onClick={() => dispatch({ tipo: 'cerrar' })}
              className="min-h-12 cursor-pointer rounded-xl border border-bor2 px-[18px] text-sm font-bold text-tx2"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={st.guardando}
              className="inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-acc-bg text-[14.5px] font-bold text-acc-fg disabled:opacity-60"
            >
              {st.guardando && <Rueda sobreAmbar />}
              {st.guardando ? 'Guardando…' : 'Guardar aviso'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
