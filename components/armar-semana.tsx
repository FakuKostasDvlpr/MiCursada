'use client';

// "Armá tu semana": acomodar en qué día y a qué hora cae cada materia.
//
// El aula virtual no publica horarios, así que hasta que alguien los carga
// "Hoy" y "Semana" se ven vacías. Cargarlos existía desde antes, pero materia
// por materia: entrar a cada una, abrir su editor y sumar día + inicio + fin.
// Siete veces. Nadie lo hacía.
//
// Dos velocidades sobre el mismo estado:
//  - Los botones L M M J V S son el atajo: marcan el día entero con la franja
//    de siempre, que es lo que sirve para la mayoría de la cursada nocturna.
//  - Los campos de hora de abajo son el detalle, para los días que se parten:
//    el miércoles Matemáticas va 19:00–21:40 e Inglés 21:40–23:00, y eso con
//    un toggle de días no se puede expresar.

import { Plus, Trash2 } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import { actualizarMateria } from '@/app/actions';
import { CampoHora } from '@/components/campo-hora';
import { lanzarToast } from '@/lib/toast';
import {
  DIAS_HABILES,
  FRANJA_DEFECTO,
  type Franja,
  agregarFranja,
  alternarDia,
  diasSolapados,
  editarFranja,
  franjaValida,
  ordenarFranjas,
  quitarFranja,
} from '@/lib/franjas';
import { nombreDia } from '@/lib/cursada';
import type { Materia } from '@/lib/types';

/** Inicial de cada día para los botones del atajo. */
const LETRA: Record<number, string> = { 1: 'L', 2: 'M', 3: 'M', 4: 'J', 5: 'V', 6: 'S' };

export function ArmarSemana({ materias }: { materias: Materia[] }) {
  const sinHorarios = materias.every((m) => m.horarios.length === 0);
  // Arranca abierto solo si no hay NADA cargado: es el caso en que la persona
  // está mirando una semana vacía sin saber por qué.
  const [abierto, setAbierto] = useState(sinHorarios);
  const [error, setError] = useState('');
  // Estado optimista por materia: la grilla responde al toque sin esperar al
  // server, que en una tanda de clicks se nota.
  const [local, setLocal] = useState<Record<string, Franja[]>>(() =>
    Object.fromEntries(
      materias.map((m) => [
        m.id,
        m.horarios.map((h) => ({ dia: h.dia, inicio: h.inicio, fin: h.fin })),
      ])
    )
  );
  const [, empezar] = useTransition();

  // Lo último que el server confirmó, por materia. Sirve para dos cosas: no
  // reescribir cuando nada cambió (cada blur de un campo de hora dispararía un
  // guardado igual al anterior) y tener a dónde volver si falla.
  const persistido = useRef<Record<string, Franja[]>>(
    Object.fromEntries(
      materias.map((m) => [
        m.id,
        ordenarFranjas(m.horarios.map((h) => ({ dia: h.dia, inicio: h.inicio, fin: h.fin }))),
      ])
    )
  );

  if (materias.length === 0) return null;

  /** Guarda las franjas de una materia. Vuelve a lo confirmado si el server las rechaza. */
  const guardar = (m: Materia, nuevas: Franja[]) => {
    const ordenadas = ordenarFranjas(nuevas);
    setLocal((prev) => ({ ...prev, [m.id]: ordenadas }));
    setError('');

    if (ordenadas.some((f) => !franjaValida(f.inicio, f.fin))) {
      // No se manda: el server lo rechazaría igual y volver atrás borraría lo
      // que se está tipeando. Queda en pantalla, marcado, para corregirlo.
      setError('Revisá las horas: el fin tiene que ser después del inicio.');
      return;
    }

    const antes = persistido.current[m.id] ?? [];
    if (JSON.stringify(antes) === JSON.stringify(ordenadas)) return;

    empezar(async () => {
      const r = await actualizarMateria(m.id, {
        profe: m.profe,
        aula: m.aula,
        color: m.color,
        horarios: ordenadas,
      });
      if (!r.ok) {
        setLocal((prev) => ({ ...prev, [m.id]: antes }));
        setError(r.error);
        return;
      }
      persistido.current[m.id] = ordenadas;
      lanzarToast('Horario guardado', 'ok');
    });
  };

  const todas = materias.flatMap((m) => local[m.id] ?? []);
  const choques = diasSolapados(todas);

  return (
    <section className="mt-5 rounded-[14px] border border-bor bg-sup px-[16px] py-[14px]">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="tactil flex w-full cursor-pointer items-center gap-2 bg-transparent text-left"
      >
        <span className="flex-1 text-[15px] font-extrabold tracking-[-0.01em]">Armá tu semana</span>
        <span className="kicker text-[10px] text-tx3">{abierto ? 'Ocultar' : 'Editar'}</span>
      </button>

      {abierto ? (
        <>
          <p className="mt-1.5 mb-3 text-[13px] leading-[1.45] text-tx3">
            Tocá los días de cada materia para marcarlos de {FRANJA_DEFECTO.inicio} a{' '}
            {FRANJA_DEFECTO.fin}, y cambiá las horas abajo si esa clase va en otro rango.
          </p>

          <div className="flex flex-col gap-1.5">
            {materias.map((m) => {
              const franjas = local[m.id] ?? [];
              return (
                <div key={m.id} className="rounded-[11px] border border-bor bg-bg px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: m.color }}
                      />
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-tx">
                        {m.nombre}
                      </span>
                    </span>

                    <span className="flex shrink-0 gap-1">
                      {DIAS_HABILES.map((d) => {
                        const activo = franjas.some((h) => h.dia === d);
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => guardar(m, alternarDia(franjas, d))}
                            aria-pressed={activo}
                            aria-label={`${m.nombre}: ${nombreDia(d)}`}
                            className={`grid h-9 w-9 cursor-pointer place-items-center rounded-[9px] border text-[12px] font-bold ${
                              activo
                                ? 'border-acc-bg bg-acc-bg text-acc-fg'
                                : 'border-bor bg-transparent text-tx3'
                            }`}
                          >
                            {LETRA[d]}
                          </button>
                        );
                      })}
                    </span>
                  </div>

                  {/* Detalle: una fila por franja, con día y horas editables. */}
                  {franjas.length > 0 ? (
                    <div className="mt-2.5 flex flex-col gap-1.5 border-t border-bor pt-2.5">
                      {franjas.map((h, i) => {
                        const mal = !franjaValida(h.inicio, h.fin);
                        return (
                          <div
                            // El índice como key es correcto acá: las franjas no
                            // tienen id propio hasta que el server las guarda, y
                            // la lista se reordena entera en cada guardado.
                            key={`${m.id}-${i}`}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <select
                              value={h.dia}
                              onChange={(e) =>
                                guardar(m, editarFranja(franjas, i, { dia: Number(e.target.value) }))
                              }
                              aria-label={`Día de la clase ${i + 1} de ${m.nombre}`}
                              className="tactil min-h-9 rounded-[9px] border border-bor bg-sup px-2 text-[12.5px] text-tx"
                            >
                              {DIAS_HABILES.map((d) => (
                                <option key={d} value={d}>
                                  {nombreDia(d)}
                                </option>
                              ))}
                            </select>

                            <CampoHora
                              valor={h.inicio}
                              onCambio={(v) =>
                                guardar(m, editarFranja(franjas, i, { inicio: v }))
                              }
                              etiqueta={`Hora de inicio de la clase ${i + 1} de ${m.nombre}`}
                              invalido={mal}
                            />
                            <span aria-hidden className="text-[12.5px] text-tx4">
                              –
                            </span>
                            <CampoHora
                              valor={h.fin}
                              onCambio={(v) => guardar(m, editarFranja(franjas, i, { fin: v }))}
                              etiqueta={`Hora de fin de la clase ${i + 1} de ${m.nombre}`}
                              invalido={mal}
                            />

                            <button
                              type="button"
                              onClick={() => guardar(m, quitarFranja(franjas, i))}
                              aria-label={`Quitar la clase ${i + 1} de ${m.nombre}`}
                              className="tactil ml-auto grid h-9 w-9 cursor-pointer place-items-center rounded-[9px] border border-bor text-tx3"
                            >
                              <Trash2 size={14} strokeWidth={2} aria-hidden />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => guardar(m, agregarFranja(franjas))}
                    className="tactil mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-[9px] border border-bor2 bg-transparent px-2.5 py-1.5 text-[12px] font-bold text-tx2"
                  >
                    <Plus size={13} strokeWidth={2.5} aria-hidden />
                    Agregar horario
                  </button>
                </div>
              );
            })}
          </div>

          {/* Aviso, no bloqueo: puede haber casos raros legítimos, y frenar el
              guardado por esto sería peor que avisarlo. */}
          {choques.length > 0 ? (
            <p className="mt-2.5 text-[12.5px] text-tx3">
              Ojo: se te pisan dos clases el{' '}
              {choques.map((d) => nombreDia(d).toLowerCase()).join(' y el ')}.
            </p>
          ) : null}

          {error ? <p className="mt-2.5 text-[12.5px] text-[#fb7185]">{error}</p> : null}
        </>
      ) : null}
    </section>
  );
}
