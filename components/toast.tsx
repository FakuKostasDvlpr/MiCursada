'use client';

// Toast de acción (spec `specs/toasts-y-logro` R1): pill centrado abajo que
// confirma una mutación y se descarta solo a los 2600 ms. Un toast nuevo
// reemplaza al anterior y reinicia el timer.
//
// Vive en el layout de `(app)` y escucha un evento de window: así cualquier
// componente cliente puede dispararlo con `lanzarToast()` sin pasar props ni
// context por medio árbol.

import { Check, Trash } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { EVENTO_TOAST, MS_TOAST, type Toast as DatosToast } from '@/lib/toast';

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

  const borrado = toast.variante === 'delete';

  return (
    <div
      // role="status" + polite y nunca alert: es información efímera que se
      // anuncia sin interrumpir lo que el lector de pantalla esté leyendo.
      role="status"
      aria-live="polite"
      className="toast-cont pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4"
    >
      <div
        key={turno}
        className="toast-in flex items-center gap-[10px] rounded-full border bg-sup py-[10px] pr-[18px] pl-[12px]"
        style={{ borderColor: borrado ? 'rgba(251,113,133,.5)' : 'rgba(52,211,153,.5)' }}
      >
        <span
          aria-hidden
          className="grid h-[28px] w-[28px] shrink-0 place-items-center rounded-full"
          style={{ background: borrado ? 'rgba(251,113,133,.15)' : 'rgba(52,211,153,.15)' }}
        >
          {borrado ? (
            <Trash size={14} strokeWidth={2} className="text-[#fb7185]" />
          ) : (
            <Check size={14} strokeWidth={2.5} className="text-[#34d399]" />
          )}
        </span>
        <span className="text-[13.5px] font-bold text-tx">{toast.mensaje}</span>
      </div>
    </div>
  );
}
