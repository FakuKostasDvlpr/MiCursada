'use client';

// Toast de acción (spec `specs/toasts-y-logro` R1): pill centrado abajo que
// confirma una mutación y se descarta solo a los 2600 ms. Un toast nuevo
// reemplaza al anterior y reinicia el timer.
//
// Vive en el layout de `(app)` y escucha un evento de window: así cualquier
// componente cliente puede dispararlo con `lanzarToast()` sin pasar props ni
// context por medio árbol.

import { AlertTriangle, Check, Trash } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { EVENTO_TOAST, MS_TOAST, type Toast as DatosToast } from '@/lib/toast';

// Un color y un icono por variante: verde confirma, rojo borra, ámbar avisa
// que no se pudo. El ámbar es el mismo acento de la app. Va a nivel de módulo:
// no depende de nada del render.
const PINTA = {
  ok: { borde: 'rgba(52,211,153,.5)', fondo: 'rgba(52,211,153,.15)', color: '#34d399' },
  delete: { borde: 'rgba(251,113,133,.5)', fondo: 'rgba(251,113,133,.15)', color: '#fb7185' },
  error: { borde: 'rgba(251,191,36,.5)', fondo: 'rgba(251,191,36,.15)', color: '#fbbf24' },
} as const;

export function Toast() {
  const [toast, setToast] = useState<DatosToast | null>(null);
  // Sube con cada toast: fuerza el remount del pill para que la animación de
  // entrada vuelva a correr aunque el mensaje anterior siguiera en pantalla.
  const [turno, setTurno] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const alLanzar = (e: Event) => {
      const detalle = (e as CustomEvent<DatosToast>).detail;
      if (!detalle) return;
      setToast(detalle);
      setTurno((n) => n + 1);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(null), MS_TOAST);
    };
    window.addEventListener(EVENTO_TOAST, alLanzar);
    return () => {
      window.removeEventListener(EVENTO_TOAST, alLanzar);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!toast) return null;

  const pinta = PINTA[toast.variante];

  return (
    <div
      // role="status" + polite y nunca alert: es información efímera que se
      // anuncia sin interrumpir lo que el lector de pantalla esté leyendo.
      role="status"
      aria-live="polite"
      // Arriba a la derecha, por encima de los modales (z-50): varios toasts
      // se disparan con el modal del avatar abierto y abajo quedaban tapados.
      // El safe-area es por la muesca en iOS.
      className="pointer-events-none fixed right-4 z-[60] flex max-w-[calc(100vw-32px)] justify-end"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}
    >
      <div
        key={turno}
        className="toast-in flex items-center gap-[10px] rounded-full border bg-sup py-[10px] pr-[18px] pl-[12px]"
        style={{ borderColor: pinta.borde }}
      >
        <span
          aria-hidden
          className="grid h-[28px] w-[28px] shrink-0 place-items-center rounded-full"
          style={{ background: pinta.fondo }}
        >
          {toast.variante === 'delete' ? (
            <Trash size={14} strokeWidth={2} style={{ color: pinta.color }} />
          ) : toast.variante === 'error' ? (
            <AlertTriangle size={14} strokeWidth={2.2} style={{ color: pinta.color }} />
          ) : (
            <Check size={14} strokeWidth={2.5} style={{ color: pinta.color }} />
          )}
        </span>
        <span className="text-[13.5px] font-bold text-tx">{toast.mensaje}</span>
      </div>
    </div>
  );
}
