'use client';

// Onboarding de 3 pasos + loader (spec `specs/onboarding-y-salida`, piezas 1a y
// 1b del handoff `design_handoff_onboarding_sesion`).
//
// Overlay difuminado encima de la app, con la app renderizada atrás. Se monta
// desde el layout de (app) cuando el perfil todavía no tiene `onboardingEn`, y
// se va solo: no cierra con click afuera ni con Escape, porque es la
// presentación de la app y se sale con `Saltar` o completando los tres pasos.
//
// A diferencia del prototipo, esto se ve UNA sola vez por persona: el flag va a
// `perfiles.onboarding_en` (o al overlay `datos/perfil.json`), nunca a
// localStorage. Ver spec A1.

import { CalendarDays, Check, FileText, Share2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { terminarOnboarding } from '@/app/actions-sesion';
import { Loader } from '@/components/kokonutui/loader';
import {
  type IconoPaso,
  MS_CIERRE_ONBOARDING,
  MS_TAREA,
  PASOS_ONBOARDING,
  TAREAS_ONBOARDING,
  estadoTarea,
  kickerOnboarding,
  labelBotonOnboarding,
  opacidadTarea,
} from '@/lib/onboarding';

/** El ícono del tile por paso. El handoff dice que Lucide es equivalente. */
const ICONO: Record<IconoPaso, typeof CalendarDays> = {
  calendario: CalendarDays,
  documento: FileText,
  grafo: Share2,
};

export function Onboarding() {
  const [paso, setPaso] = useState(0);
  /** -1 = mostrando los pasos; 0..2 = tarea en curso; 3 = todas hechas. */
  const [tarea, setTarea] = useState(-1);
  const [cerrado, setCerrado] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pendientes = timers.current;
    return () => pendientes.forEach(clearTimeout);
  }, []);

  /**
   * Arranca el loader: la timeline del handoff, y el write del flag al final.
   *
   * El write va AL FINAL y no en paralelo: `terminarOnboarding()` hace
   * `revalidatePath('/', 'layout')`, y ese re-render encuentra el flag ya
   * escrito → el layout deja de renderizar este componente. Disparándolo al
   * arrancar, el overlay se desmontaba a los ~300 ms y el loader no se veía
   * nunca (medido: `.anillo-ext` ya no existía a los 1200 ms).
   *
   * El costo es que si cerrás la pestaña a mitad del loader el flag no se
   * escribe y el onboarding sale una vez más. Preferible a no verlo nunca.
   */
  const arrancarLoader = () => {
    if (tarea >= 0) return;
    setTarea(0);
    MS_TAREA.forEach((ms, i) => {
      if (ms === 0) return;
      timers.current.push(setTimeout(() => setTarea(i), ms));
    });
    timers.current.push(
      setTimeout(() => {
        setCerrado(true);
        void terminarOnboarding();
      }, MS_CIERRE_ONBOARDING)
    );
  };

  const setPasoSeguro = (n: number) => {
    if (tarea >= 0) return; // ya está cargando: los dots no hacen nada
    setPaso(n);
  };

  const siguiente = () => {
    if (paso < PASOS_ONBOARDING.length - 1) setPasoSeguro(paso + 1);
    else arrancarLoader();
  };

  if (cerrado) return null;

  const actual = PASOS_ONBOARDING[paso] ?? PASOS_ONBOARDING[0];
  const Icono = ICONO[actual.icono];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bienvenida a Mi Cursada"
      // El padding le suma env(safe-area-inset-*): al ser `fixed` esta capa se
      // apoya en el borde del viewport y no hereda el despeje del notch que
      // globals.css le pone al body.
      className="fixed inset-0 z-[70] flex animate-[scrim-in_500ms_ease] items-center justify-center overflow-y-auto p-6 pt-[calc(24px+env(safe-area-inset-top))] pb-[calc(24px+env(safe-area-inset-bottom))] motion-reduce:animate-none"
      style={{
        background: 'rgba(2,6,23,.62)',
        WebkitBackdropFilter: 'blur(10px)',
        backdropFilter: 'blur(10px)',
      }}
    >
      {tarea >= 0 ? (
        <Loader titulo="Preparando tu cursada…" subtitulo="Esperá un momento, estamos dejando todo listo.">
          <ul aria-live="polite" className="flex w-full list-none flex-col gap-3">
            {TAREAS_ONBOARDING.map((txt, i) => {
              const estado = estadoTarea(i, tarea);
              return (
                <li
                  key={txt}
                  className="flex items-center gap-[11px] transition-opacity duration-[350ms]"
                  style={{ opacity: opacidadTarea(estado) }}
                >
                  {estado === 'hecha' ? (
                    <span
                      aria-hidden
                      className="pop-check grid h-5 w-5 shrink-0 place-items-center rounded-full"
                      style={{ background: '#34d399' }}
                    >
                      <Check size={11} strokeWidth={3.4} style={{ color: '#06251a' }} />
                    </span>
                  ) : estado === 'activa' ? (
                    <span
                      aria-hidden
                      className="girando h-5 w-5 shrink-0 rounded-full border-[2.5px] border-bor2 border-t-acc"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="h-5 w-5 shrink-0 rounded-full border-[2.5px] border-bor"
                    />
                  )}
                  {estado === 'activa' ? (
                    <span className="shimmer-txt shimmer-txt-rapido text-[14px] font-semibold">
                      {txt}
                    </span>
                  ) : (
                    <span
                      className="text-[14px] font-semibold"
                      style={{ color: estado === 'hecha' ? '#34d399' : 'var(--tx3)' }}
                    >
                      {txt}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <span className="font-mono text-[10px] tracking-[0.14em] text-tx4 uppercase">
            No cierres la app
          </span>
        </Loader>
      ) : (
        // my-auto y no solo el items-center del contenedor: cuando la card es
        // más alta que la pantalla (teléfono bajo, o en horizontal), centrar con
        // items-center le corta la parte de arriba y no hay forma de scrollear
        // hasta ella. Con márgenes auto, el sobrante se reparte solo mientras
        // entra y se colapsa a 0 cuando no, así que la card siempre empieza
        // desde arriba y se puede scrollear entera.
        <div className="my-auto w-full max-w-[480px]">
          <div className="flex items-center justify-between">
            <span className="kicker tracking-[0.16em]">{kickerOnboarding(paso)}</span>
            <button
              type="button"
              onClick={arrancarLoader}
              className="min-h-11 cursor-pointer px-[6px] text-[13px] font-bold text-tx3"
            >
              Saltar
            </button>
          </div>

          {/* key={paso}: la card se remonta en cada paso para que onb-paso-in
              vuelva a correr (si no, la animación solo se ve la primera vez). */}
          <div
            key={paso}
            className="onb-paso-in mt-[10px] rounded-[20px] border border-bor bg-sup px-[30px] py-[34px]"
          >
            <span
              aria-hidden
              className="grid h-[58px] w-[58px] place-items-center rounded-2xl"
              style={{ background: actual.tile }}
            >
              <Icono size={27} strokeWidth={2} style={{ color: '#221a00' }} />
            </span>
            <h2 className="mt-5 text-[25px] leading-[1.25] font-extrabold tracking-[-0.015em]">
              {actual.titulo}
            </h2>
            <p className="mt-[10px] text-[14.5px] leading-[1.6] text-tx2">{actual.descripcion}</p>
            <div className="mt-5 flex flex-col gap-[10px]">
              {actual.features.map((f) => (
                <div
                  key={f.texto}
                  className="flex items-center gap-[11px] rounded-xl border border-bor bg-bg px-[14px] py-[11px]"
                >
                  <span
                    aria-hidden
                    className="h-[7px] w-[7px] shrink-0 rounded-full"
                    style={{ background: f.color }}
                  />
                  <span className="flex-1 text-[13.5px] font-semibold text-tx">{f.texto}</span>
                  <span className="font-mono text-[10px] text-tx4">{f.tag}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between">
            <span className="flex gap-[7px]">
              {PASOS_ONBOARDING.map((p, i) => (
                <button
                  key={p.titulo}
                  type="button"
                  onClick={() => setPasoSeguro(i)}
                  aria-label={kickerOnboarding(i)}
                  aria-current={i === paso || undefined}
                  className="h-2 cursor-pointer rounded-full border-0 p-0 transition-[width,background] duration-300"
                  style={{
                    width: i === paso ? 26 : 8,
                    background: i === paso ? 'var(--acc)' : 'var(--bor2)',
                  }}
                />
              ))}
            </span>
            <button
              type="button"
              onClick={siguiente}
              className="min-h-12 cursor-pointer rounded-xl bg-acc-bg px-[26px] text-[14.5px] font-bold text-acc-fg"
            >
              {labelBotonOnboarding(paso)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
