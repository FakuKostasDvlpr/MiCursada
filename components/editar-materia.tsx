'use client';

import { Pencil, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { actualizarMateria } from '@/app/actions';
import { Rueda } from '@/components/cargando';
import { CampoHora } from '@/components/campo-hora';
import { Modal } from '@/components/modal';
import { nombreDia } from '@/lib/cursada';
import { COLORES_MATERIA, type ColorMateria, type Dia, type Materia } from '@/lib/types';

type HorarioForm = { dia: Dia; inicio: string; fin: string };

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

/**
 * Botón + modal "Editar materia". El nombre viene de Moodle y es readonly;
 * se editan profe, aula, color y horarios (0 o más, como chips removibles).
 */
export function EditarMateria({ materia }: { materia: Materia }) {
  const [abierto, setAbierto] = useState(false);
  const [profe, setProfe] = useState('');
  const [aula, setAula] = useState('');
  const [color, setColor] = useState<ColorMateria>(materia.color);
  const [horarios, setHorarios] = useState<HorarioForm[]>([]);
  const [dia, setDia] = useState('1');
  const [ini, setIni] = useState('18:10');
  const [fin, setFin] = useState('19:40');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const abrir = () => {
    setProfe(materia.profe);
    setAula(materia.aula);
    setColor(materia.color);
    setHorarios(materia.horarios.map((h) => ({ dia: h.dia, inicio: h.inicio, fin: h.fin })));
    setDia('1');
    setIni('18:10');
    setFin('19:40');
    setError('');
    setAbierto(true);
  };

  const agregarHorario = () => {
    if (!ini || !fin || fin <= ini) {
      setError('El fin tiene que ser después del inicio.');
      return;
    }
    setError('');
    setHorarios((prev) => [...prev, { dia: Number(dia) as Dia, inicio: ini, fin: fin }]);
  };

  const guardar = async () => {
    setGuardando(true);
    setError('');
    const resultado = await actualizarMateria(materia.id, {
      profe: profe.trim(),
      aula: aula.trim(),
      color,
      horarios,
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
        aria-label="Editar materia"
        className="tactil grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-xl border border-bor bg-sup text-tx2"
      >
        <Pencil size={17} strokeWidth={2} aria-hidden />
      </button>

      <Modal abierto={abierto} titulo="Editar materia" onCerrar={() => setAbierto(false)}>
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
                value={profe}
                onChange={(e) => setProfe(e.target.value)}
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
                value={aula}
                onChange={(e) => setAula(e.target.value)}
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
                  onClick={() => setColor(c)}
                  aria-label={NOMBRES_COLOR[c]}
                  aria-pressed={color === c}
                  className="h-[34px] w-[34px] cursor-pointer rounded-full"
                  style={{
                    background: c,
                    boxShadow:
                      color === c ? '0 0 0 3px var(--sup), 0 0 0 5px #fbbf24' : 'none',
                  }}
                />
              ))}
            </div>
          </div>

          <div>
            <span className={claseLabel}>Horarios</span>
            {horarios.length > 0 && (
              <div className="mb-[10px] flex flex-wrap gap-2">
                {horarios.map((h, i) => (
                  <span
                    key={`${h.dia}-${h.inicio}-${h.fin}-${i}`}
                    className="inline-flex items-center gap-1 rounded-full bg-bor py-[6px] pr-[6px] pl-3 font-mono text-xs"
                  >
                    {nombreDia(h.dia).slice(0, 3)} {h.inicio}–{h.fin}
                    <button
                      type="button"
                      onClick={() => setHorarios((prev) => prev.filter((_, j) => j !== i))}
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
              value={dia}
              onChange={(e) => setDia(e.target.value)}
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
              <CampoHora valor={ini} onCambio={setIni} etiqueta="Inicio" />
              <span aria-hidden className="font-mono text-sm text-tx4">
                –
              </span>
              <CampoHora valor={fin} onCambio={setFin} etiqueta="Fin" />
              <button
                type="button"
                onClick={agregarHorario}
                aria-label="Agregar horario"
                className="ml-auto grid h-[46px] w-[46px] shrink-0 cursor-pointer place-items-center rounded-xl border border-bor2 bg-bor text-acc"
              >
                <Plus size={18} strokeWidth={2.4} aria-hidden />
              </button>
            </div>
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
              {guardando ? 'Guardando…' : 'Guardar materia'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
