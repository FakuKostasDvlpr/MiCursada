'use client';

// Toast de logro (handoff §6): sube desde abajo a la derecha cuando llegás a un
// hito de notas, con rebote y un brillo que recorre el pill una vez. Se
// descarta solo.
//
// Vive en el layout de la app (no en el editor) porque el hito se cuenta sobre
// TODAS las notas de la cursada. El editor avisa con un evento y acá se lleva
// la cuenta: el total inicial lo pone el server y cada nota nueva lo sube.

import { Trophy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { EVENTO_NOTA_CREADA, MS_LOGRO, subtituloLogro } from '@/lib/logro';

export function Logro({ totalNotas }: { totalNotas: number }) {
  const [sub, setSub] = useState<string | null>(null);
  const total = useRef(totalNotas);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // El server manda el total de arranque; si cambió por afuera, lo adoptamos.
  useEffect(() => {
    total.current = Math.max(total.current, totalNotas);
  }, [totalNotas]);

  useEffect(() => {
    const alCrear = () => {
      total.current += 1;
      // Fuera de un hito `subtituloLogro` devuelve null: no hay logro y el que
      // esté en pantalla sigue su curso.
      const texto = subtituloLogro(total.current);
      if (!texto) return;
      // TODO: cada hito debería mostrarse una sola vez en la vida (spec R5.3).
      // El flag va en el overlay `datos/logros.json` (`{ "primera": true, … }`)
      // y hay que sumarlo a la lista de `getDatosLocales()` o el caché por
      // `mtime` no se entera. Se chequearía acá, antes de mostrar, y se
      // marcaría con una Server Action.
      setSub(texto);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setSub(null), MS_LOGRO);
    };
    window.addEventListener(EVENTO_NOTA_CREADA, alCrear);
    return () => {
      window.removeEventListener(EVENTO_NOTA_CREADA, alCrear);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // El toast de acción se apila arriba del logro cuando los dos están visibles:
  // a 390px, uno centrado y otro a la derecha se superponen (spec §2).
  useEffect(() => {
    if (!sub) return;
    document.documentElement.dataset.logro = '1';
    return () => {
      delete document.documentElement.dataset.logro;
    };
  }, [sub]);

  if (!sub) return null;

  return (
    <div
      // aria-live y no role="alert": es una felicitación, no interrumpe.
      aria-live="polite"
      className="pointer-events-none fixed right-[18px] bottom-24 z-[60] flex max-w-[calc(100vw-36px)] justify-end"
    >
      <div className="logro-in relative flex items-center gap-[13px] overflow-hidden rounded-full bg-[linear-gradient(120deg,#f97316,#ea580c)] py-[9px] pr-[26px] pl-[10px]">
        <span
          aria-hidden
          className="logro-brillo absolute inset-y-0 left-0 w-14 bg-white/20 blur-[2px]"
        />
        <span
          aria-hidden
          className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full bg-[rgba(59,21,3,.35)]"
        >
          <Trophy size={22} strokeWidth={2} className="text-[#ffedd5]" />
        </span>
        <span className="block">
          <span className="block text-[15.5px] font-extrabold tracking-[-0.01em] text-[#fff7ed]">
            ¡Logro desbloqueado!
          </span>
          <span className="mt-px block font-mono text-[11.5px] text-[rgba(255,247,237,.85)]">
            {sub}
          </span>
        </span>
      </div>
    </div>
  );
}
