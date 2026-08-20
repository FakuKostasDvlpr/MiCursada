'use client';

// Aviso de "dar el presente" 10 minutos antes de cada clase: una notificación
// del navegador con un chime corto.
//
// Son DOS componentes con un solo estado, igual que el toast y el logro:
//
// - `<AvisoPresente>` vive en el layout de `(app)` y no renderiza nada. Está en
//   el layout y no en el tile para que el aviso también salga si estás en
//   /avisos, /semana o el detalle de una materia — no solo en Hoy.
// - `<BotonAvisoPresente>` es la campanita del tile de Asistencia, que es donde
//   la idea se entiende sola (al lado de "Dar el presente").
//
// Se comunican por un evento de window (EVENTO_AVISO), como `lib/toast.ts`: sin
// context ni librería de estado.
//
// ALCANCE: funciona con la app abierta en alguna pestaña, aunque esté en
// segundo plano. Avisar con la app CERRADA es Web Push (service worker + VAPID
// + cron), y eso no es esto.

import { Bell, BellOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CLAVE_ACTIVO,
  CLAVE_AVISADAS,
  EVENTO_AVISO,
  avisosPendientes,
  esDeHoy,
  type MateriaAvisable,
} from '@/lib/aviso-presente';
import { sonarChime } from '@/lib/chime';
import { hoyISO } from '@/lib/cursada';
import { lanzarToast } from '@/lib/toast';

/** Cada cuánto se revisa si alguna clase entró en la ventana de 10 min. */
const MS_TICK = 30_000;

// ─── Preferencia (localStorage) ──────────────────────────────────────────────

function leerActivo(): boolean {
  try {
    return localStorage.getItem(CLAVE_ACTIVO) === 'on';
  } catch {
    return false;
  }
}

function guardarActivo(activo: boolean): void {
  try {
    localStorage.setItem(CLAVE_ACTIVO, activo ? 'on' : 'off');
  } catch {
    // localStorage bloqueado: vale para esta sesión y listo.
  }
}

/**
 * Claves ya avisadas, purgando de paso las de días anteriores: si no, la lista
 * crece para siempre.
 */
function leerAvisadas(hoyIso: string): Set<string> {
  try {
    const crudo: unknown = JSON.parse(localStorage.getItem(CLAVE_AVISADAS) ?? '[]');
    if (!Array.isArray(crudo)) return new Set();
    return new Set(crudo.filter((c): c is string => typeof c === 'string' && esDeHoy(c, hoyIso)));
  } catch {
    return new Set();
  }
}

function guardarAvisadas(claves: Set<string>): void {
  try {
    localStorage.setItem(CLAVE_AVISADAS, JSON.stringify([...claves]));
  } catch {
    // Sin persistencia el aviso puede repetirse tras un F5. Es lo peor que pasa.
  }
}

// ─── AudioContext ────────────────────────────────────────────────────────────

/**
 * Un solo AudioContext para toda la página. Se crea en el CLICK de la
 * campanita: es el único momento con gesto de usuario, y sin eso el navegador
 * no deja sonar nada más tarde, cuando el aviso salta solo.
 */
let ctxAudio: AudioContext | null = null;

function prepararAudio(): void {
  try {
    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctxAudio ??= new Ctor();
    if (ctxAudio.state === 'suspended') void ctxAudio.resume();
  } catch {
    // Sin audio, el aviso visual sigue saliendo.
  }
}

// ─── El notificador (layout) ─────────────────────────────────────────────────

export function AvisoPresente({ materias }: { materias: MateriaAvisable[] }) {
  const router = useRouter();
  // Arranca apagado y se sincroniza al montar: así el SSR y el primer render
  // del cliente coinciden (mismo criterio que ThemeToggle).
  const [activo, setActivo] = useState(false);
  const avisadas = useRef<Set<string>>(new Set());

  useEffect(() => {
    setActivo(leerActivo());
    const alCambiar = (e: Event) => setActivo(Boolean((e as CustomEvent<boolean>).detail));
    window.addEventListener(EVENTO_AVISO, alCambiar);
    return () => window.removeEventListener(EVENTO_AVISO, alCambiar);
  }, []);

  const revisar = useCallback(() => {
    const ahora = new Date();
    const hoyIso = hoyISO(ahora);

    // Se relee en cada tick (y se purga) porque otra pestaña de la app pudo
    // haber avisado la misma clase mientras esta estaba de fondo.
    avisadas.current = leerAvisadas(hoyIso);

    const pendientes = avisosPendientes(materias, ahora, avisadas.current);
    if (pendientes.length === 0) return;

    const puedeNotificar = 'Notification' in window && Notification.permission === 'granted';

    for (const a of pendientes) {
      const cuerpo = `Empieza ${a.inicio} · en ${a.faltan} min`;
      if (puedeNotificar) {
        try {
          const n = new Notification(`Dar el presente — ${a.nombre}`, {
            body: cuerpo,
            // El tag colapsa duplicados: si dos pestañas avisan la misma clase,
            // el sistema muestra una sola.
            tag: a.clave,
          });
          n.onclick = () => {
            window.focus();
            router.push(`/materias/${a.materiaId}`);
            n.close();
          };
        } catch {
          lanzarToast(`${a.nombre} empieza en ${a.faltan} min · dá el presente`, 'ok');
        }
      } else {
        // Sin permiso el aviso igual aparece, pero solo si estás mirando.
        lanzarToast(`${a.nombre} empieza en ${a.faltan} min · dá el presente`, 'ok');
      }
      avisadas.current.add(a.clave);
    }

    if (ctxAudio) sonarChime(ctxAudio);
    guardarAvisadas(avisadas.current);
  }, [materias, router]);

  useEffect(() => {
    if (!activo || materias.length === 0) return;
    revisar(); // no esperar 30 s si al prender ya hay una clase en la ventana
    const id = setInterval(revisar, MS_TICK);
    return () => clearInterval(id);
  }, [activo, materias.length, revisar]);

  return null;
}

// ─── La campanita (tile de Asistencia) ───────────────────────────────────────

export function BotonAvisoPresente() {
  const [activo, setActivo] = useState(false);

  useEffect(() => {
    setActivo(leerActivo());
    const alCambiar = (e: Event) => setActivo(Boolean((e as CustomEvent<boolean>).detail));
    window.addEventListener(EVENTO_AVISO, alCambiar);
    return () => window.removeEventListener(EVENTO_AVISO, alCambiar);
  }, []);

  const aplicar = (valor: boolean) => {
    setActivo(valor);
    guardarActivo(valor);
    window.dispatchEvent(new CustomEvent<boolean>(EVENTO_AVISO, { detail: valor }));
  };

  const alternar = async () => {
    if (activo) {
      aplicar(false);
      lanzarToast('Listo, no te avisamos más', 'delete');
      return;
    }

    // El gesto de usuario es ACÁ: es el único momento en que el navegador deja
    // habilitar el audio para que suene solo más tarde.
    prepararAudio();

    if (!('Notification' in window)) {
      aplicar(true);
      lanzarToast('Te avisamos 10 minutos antes de cada clase', 'ok');
      return;
    }

    const permiso =
      Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission;

    if (permiso === 'denied') {
      lanzarToast('El navegador bloqueó las notificaciones', 'error');
      return;
    }

    aplicar(true);
    lanzarToast('Te avisamos 10 minutos antes de cada clase', 'ok');
  };

  return (
    <button
      type="button"
      onClick={() => void alternar()}
      aria-pressed={activo}
      aria-label="Avisarme 10 minutos antes de cada clase"
      className={`tactil grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl border ${
        activo ? 'border-transparent bg-acc-bg !text-acc-fg' : 'border-bor bg-sup text-tx2'
      }`}
    >
      {activo ? (
        <Bell size={16} strokeWidth={2.2} aria-hidden />
      ) : (
        <BellOff size={16} strokeWidth={2} aria-hidden />
      )}
    </button>
  );
}
