'use client';

// Number-flow de los contadores del bento (handoff v3 §1): cada dígito es una
// ventana de 1em con la tira 0–9 adentro, desplazada por translateY.
//
// El SSR ya escribe el número correcto (si no hay JS, el dato igual es el
// verdadero). Al montar, la tira salta a 0 SIN transición y en el frame
// siguiente rueda hasta el valor: de ahí sale el efecto sin mentirle a nadie.

import { useEffect, useState } from 'react';

const GLIFOS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

type Props = {
  valor: number;
  /** Retardo del primer dígito; los siguientes suman 0.08s cada uno. */
  demora?: number;
};

export function CifraRodante({ valor, demora = 0.12 }: Props) {
  const [mostrado, setMostrado] = useState(valor);
  const [sinTransicion, setSinTransicion] = useState(false);

  useEffect(() => {
    setSinTransicion(true);
    setMostrado(0);
    const id = requestAnimationFrame(() => {
      setSinTransicion(false);
      setMostrado(valor);
    });
    return () => cancelAnimationFrame(id);
  }, [valor]);

  const digitos = String(Math.max(0, Math.trunc(mostrado))).padStart(
    String(Math.max(0, Math.trunc(valor))).length,
    '0'
  );

  return (
    <span className="inline-flex leading-none">
      <span className="sr-only">{valor}</span>
      {digitos.split('').map((d, i) => (
        <span
          // Los dígitos no se reordenan: el índice alcanza como key.
          key={i}
          aria-hidden
          className="inline-block h-[1em] overflow-hidden"
        >
          <span
            className={sinTransicion ? 'block' : 'cifra-tira block'}
            style={{
              // En em y no en %: el % de translateY es sobre la ALTURA DE LA
              // TIRA (10em, los diez glifos), así que -d*100% se iba diez veces
              // de largo y el dígito quedaba fuera de la ventana — el número se
              // veía en blanco para todo valor distinto de 0.
              transform: `translateY(calc(${Number(d)} * -1em))`,
              transitionDelay: `${demora + i * 0.08}s`,
            }}
          >
            {GLIFOS.map((g) => (
              <span key={g} className="block h-[1em]">
                {g}
              </span>
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}
