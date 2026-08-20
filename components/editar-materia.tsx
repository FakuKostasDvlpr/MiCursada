'use client';

import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useReducer } from 'react';
import { actualizarMateria, eliminarMateriaManual } from '@/app/actions';
import { Rueda } from '@/components/cargando';
import { CampoHora } from '@/components/campo-hora';
import { Modal } from '@/components/modal';
import { nombreDia } from '@/lib/cursada';
import { lanzarToast } from '@/lib/toast';
import { COLORES_MATERIA, type ColorMateria, type Dia, esManual, type Materia } from '@/lib/types';

/**
 * Un horario del formulario. El `clave` es solo para React: los horarios que
 * llegan del server traen su id, y los que se agregan a mano todavía no existen
 * en la base, así que se les inventa uno estable acá. Sin él la lista se
 * keyeaba por índice y al quitar un chip los de abajo heredaban su identidad.
 */
type HorarioForm = { clave: string; dia: Dia; inicio: string; fin: string };

let proximaClave = 0;
const nuevaClave = () => `nuevo-${(proximaClave += 1)}`;

const NOMBRES_COLOR: Record<ColorMateria, string> = {
  '#38bdf8': 'celeste',
  '#a78bfa': 'violeta',
  '#34d399': 'verde',
  '#fb7185': 'rosa',
  '#f97316': 'naranja',
  '#e2e8f0': 'tiza',
};

const claseInput =
  'w-full min-h-[46px] rounded-xl border border-bor bg-bg px-[14px] text-[15px] text-tx';

const claseLabel = 'kicker mb-[7px] block';

// El formulario del modal es UN estado, no diez: abrir lo rellena entero desde
// la materia, agregar un horario valida y limpia el error en el mismo paso, y
// guardar apaga el spinner y cierra a la vez. Con un useState por campo cada
// transición era una tanda de setters que había que acordarse de tocar completa.
type Estado = {
  abierto: boolean;
  profe: string;
  aula: string;
  color: ColorMateria;
  horarios: HorarioForm[];
  /** El día del selector de "agregar horario", como string del <select>. */
  dia: string;
  ini: string;
  fin: string;
  error: string;
  guardando: boolean;
  /** Borrado en dos pasos: el primer click arma el botón, el segundo borra. */
  confirmaBorrar: boolean;
  borrando: boolean;
};

type Accion =
  | { tipo: 'abrir'; materia: Materia }
  | { tipo: 'cerrar' }
  | { tipo: 'campo'; campo: 'profe' | 'aula' | 'dia' | 'ini' | 'fin'; valor: string }
  | { tipo: 'color'; color: ColorMateria }
  | { tipo: 'agregarHorario' }
  | { tipo: 'quitarHorario'; clave: string }
  | { tipo: 'guardando' }
  | { tipo: 'guardado' }
  | { tipo: 'confirmarBorrado' }
  | { tipo: 'borrando' }
  | { tipo: 'borrado' }
  | { tipo: 'error'; error: string };

/** El formulario cerrado y vacío. El color arranca en el de la materia. */
const cerrado = (materia: Materia): Estado => ({
  abierto: false,
  profe: '',
  aula: '',
  color: materia.color,
  horarios: [],
  dia: '1',
  ini: '18:10',
  fin: '19:40',
  error: '',
  guardando: false,
  confirmaBorrar: false,
  borrando: false,
});

function reducir(e: Estado, a: Accion): Estado {
  switch (a.tipo) {
    case 'abrir':
      return {
        ...cerrado(a.materia),
        abierto: true,
        profe: a.materia.profe,
        aula: a.materia.aula,
        horarios: a.materia.horarios.map((h) => ({
          clave: h.id,
          dia: h.dia,
          inicio: h.inicio,
          fin: h.fin,
        })),
      };
    case 'cerrar':
      return { ...e, abierto: false };
    case 'campo':
      return { ...e, [a.campo]: a.valor };
    case 'color':
      return { ...e, color: a.color };
    case 'agregarHorario': {
      if (!e.ini || !e.fin || e.fin <= e.ini) {
        return { ...e, error: 'El fin tiene que ser después del inicio.' };
      }
      return {
        ...e,
        error: '',
        horarios: [
          ...e.horarios,
          { clave: nuevaClave(), dia: Number(e.dia) as Dia, inicio: e.ini, fin: e.fin },
        ],
      };
    }
    case 'quitarHorario':
      return { ...e, horarios: e.horarios.filter((h) => h.clave !== a.clave) };
    case 'guardando':
      return { ...e, guardando: true, error: '' };
    case 'guardado':
      return { ...e, guardando: false, abierto: false };
    case 'confirmarBorrado':
      return { ...e, confirmaBorrar: true };
    case 'borrando':
      return { ...e, borrando: true, error: '' };
    case 'borrado':
      return { ...e, borrando: false };
    case 'error':
      return { ...e, guardando: false, borrando: false, error: a.error };
  }
}

/**
 * Botón + modal "Editar materia". El nombre viene de Moodle y es readonly;
 * se editan profe, aula, color y horarios (0 o más, como chips removibles).
 */
export function EditarMateria({ materia }: { materia: Materia }) {
  const [st, dispatch] = useReducer(reducir, materia, cerrado);
  const router = useRouter();

  const abrir = () => dispatch({ tipo: 'abrir', materia });

  const borrar = async () => {
    if (!st.confirmaBorrar) {
      dispatch({ tipo: 'confirmarBorrado' });
      return;
    }
    dispatch({ tipo: 'borrando' });
    const r = await eliminarMateriaManual(materia.id);
    if (!r.ok) {
      dispatch({ tipo: 'error', error: r.error });
      return;
    }
    dispatch({ tipo: 'borrado' });
    lanzarToast('Materia eliminada', 'delete');
    router.push('/materias');
  };

  const guardar = async () => {
    dispatch({ tipo: 'guardando' });
    const resultado = await actualizarMateria(materia.id, {
      profe: st.profe.trim(),
      aula: st.aula.trim(),
      color: st.color,
      // `clave` es identidad de React, no dato: no viaja al server.
      horarios: st.horarios.map((h) => ({ dia: h.dia, inicio: h.inicio, fin: h.fin })),
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
        aria-label="Editar materia"
        className="tactil grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-xl border border-bor bg-sup text-tx2"
      >
        <Pencil size={17} strokeWidth={2} aria-hidden />
      </button>

      <Modal
        abierto={st.abierto}
        titulo="Editar materia"
        onCerrar={() => dispatch({ tipo: 'cerrar' })}
      >
        <div className="flex flex-col gap-4">
          {/* Nombre readonly: viene del aula virtual */}
          <div>
            <span className={claseLabel}>Nombre</span>
            <div className="flex min-h-[46px] items-center gap-2 rounded-xl border border-bor bg-bg px-[14px]">
              <span className="min-w-0 flex-1 truncate text-[15px] text-tx2">
                {materia.nombre}
              </span>
              {materia.source === 'moodle' && (
                <span className="shrink-0 rounded-full border border-bor px-2 py-[2px] font-mono text-[10px] text-tx3">
                  aula virtual
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-[10px]">
            <div className="min-w-0 flex-[1.4]">
              <label className={claseLabel} htmlFor="em-profe">
                Profe
              </label>
              <input
                id="em-profe"
                value={st.profe}
                onChange={(e) =>
                  dispatch({ tipo: 'campo', campo: 'profe', valor: e.target.value })
                }
                placeholder="Nombre del profe"
                className={claseInput}
              />
            </div>
            <div className="min-w-0 flex-1">
              <label className={claseLabel} htmlFor="em-aula">
                Aula
              </label>
              <input
                id="em-aula"
                value={st.aula}
                onChange={(e) => dispatch({ tipo: 'campo', campo: 'aula', valor: e.target.value })}
                placeholder="Ej: Aula 12"
                className={claseInput}
              />
            </div>
          </div>

          <div>
            <span className={claseLabel}>Color</span>
            <div className="flex flex-wrap gap-3">
              {COLORES_MATERIA.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => dispatch({ tipo: 'color', color: c })}
                  aria-label={NOMBRES_COLOR[c]}
                  aria-pressed={st.color === c}
                  className="h-[34px] w-[34px] cursor-pointer rounded-full"
                  style={{
                    background: c,
                    boxShadow:
                      st.color === c ? '0 0 0 3px var(--sup), 0 0 0 5px #fbbf24' : 'none',
                  }}
                />
              ))}
            </div>
          </div>

          <div>
            <span className={claseLabel}>Horarios</span>
            {st.horarios.length > 0 && (
              <div className="mb-[10px] flex flex-wrap gap-2">
                {st.horarios.map((h) => (
                  <span
                    key={h.clave}
                    className="inline-flex items-center gap-1 rounded-full bg-bor py-[6px] pr-[6px] pl-3 font-mono text-xs"
                  >
                    {nombreDia(h.dia).slice(0, 3)} {h.inicio}–{h.fin}
                    <button
                      type="button"
                      onClick={() => dispatch({ tipo: 'quitarHorario', clave: h.clave })}
                      aria-label="Quitar horario"
                      className="grid h-6 w-6 cursor-pointer place-items-center rounded-full text-tx2"
                    >
                      <X size={12} strokeWidth={2.4} aria-hidden />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <select
              value={st.dia}
              onChange={(e) => dispatch({ tipo: 'campo', campo: 'dia', valor: e.target.value })}
              aria-label="Día"
              className="min-h-[46px] w-full rounded-xl border border-bor bg-bg px-3 text-[15px] text-tx"
            >
              {([1, 2, 3, 4, 5, 6] as const).map((d) => (
                <option key={d} value={d}>
                  {nombreDia(d)}
                </option>
              ))}
            </select>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <CampoHora
                valor={st.ini}
                onCambio={(valor) => dispatch({ tipo: 'campo', campo: 'ini', valor })}
                etiqueta="Inicio"
              />
              <span aria-hidden className="font-mono text-sm text-tx4">
                –
              </span>
              <CampoHora
                valor={st.fin}
                onCambio={(valor) => dispatch({ tipo: 'campo', campo: 'fin', valor })}
                etiqueta="Fin"
              />
              <button
                type="button"
                onClick={() => dispatch({ tipo: 'agregarHorario' })}
                aria-label="Agregar horario"
                className="ml-auto grid h-[46px] w-[46px] shrink-0 cursor-pointer place-items-center rounded-xl border border-bor2 bg-bor text-acc"
              >
                <Plus size={18} strokeWidth={2.4} aria-hidden />
              </button>
            </div>
          </div>

          {/* Borrar: solo las materias cargadas a mano. Las del aula virtual
              volverían enteras en la próxima sincronización, así que ni se
              ofrece. */}
          {esManual(materia.id) ? (
            <button
              type="button"
              onClick={borrar}
              disabled={st.borrando}
              className={`inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border text-sm font-bold disabled:opacity-60 ${
                st.confirmaBorrar
                  ? 'border-[#fb7185] bg-[#fb7185]/10 text-[#fb7185]'
                  : 'border-bor2 text-tx2'
              }`}
            >
              <Trash2 size={15} strokeWidth={2} aria-hidden />
              {st.borrando
                ? 'Eliminando…'
                : st.confirmaBorrar
                  ? '¿Seguro? Se van sus notas y horarios'
                  : 'Eliminar materia'}
            </button>
          ) : (
            <p className="font-mono text-[11px] leading-[1.5] text-tx4">
              Esta materia viene del aula virtual: no se puede borrar, volvería
              con la próxima sincronización.
            </p>
          )}

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
              {st.guardando ? 'Guardando…' : 'Guardar materia'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
