'use client';

// Saludo "Bienvenido, {nombre}" del header de Hoy (handoff v3 §1): cada carácter
// entra rodando desde abajo, con un retardo escalonado.
//
// El texto completo va en un `sr-only`: los caracteres sueltos serían un
// deletreo para un lector de pantalla.

type Props = { nombre: string };

export function Saludo({ nombre }: Props) {
  const limpio = nombre.trim();
  if (!limpio) return null;

  const texto = `Bienvenido, ${limpio}`;
  const palabras = texto.split(' ');

  // Índice del carácter dentro de la FRASE, no dentro de la palabra: el retardo
  // tiene que seguir corriendo de una palabra a la siguiente, si no cada palabra
  // arrancaría de cero y se verían varios barridos sueltos en vez de uno solo.
  let indice = 0;

  return (
    // `overflow-hidden` está para recortar el rodado vertical de cada letra,
    // pero recorta los DOS ejes. Antes los espacios eran U+00A0 y no había
    // whitespace entre los <span> de cada letra, así que la frase era un bloque
    // indivisible: en un teléfono no entraba en una línea, no tenía dónde
    // cortarse, y el final del nombre quedaba comido por el recorte.
    //
    // Ahora el corte se hace entre PALABRAS —cada una es un inline-block con
    // `whitespace-nowrap`, así que nunca se parte por dentro— y el espacio que
    // las separa va afuera de ese span, que es lo que crea el punto de corte.
    // El interlineado extra es solo de móvil: es el único ancho donde la frase
    // llega a ocupar dos líneas, y en desktop entra en una y se ve igual.
    <div className="kicker overflow-hidden text-acc max-[640px]:leading-[1.35]">
      <span className="sr-only">{texto}</span>
      <span aria-hidden>
        {palabras.map((palabra, p) => {
          // El espacio que precede a la palabra también ocupa un lugar en el
          // barrido, para que el escalonado no se adelante al saltar de palabra.
          if (p > 0) indice += 1;
          const letras = palabra.split('').map((c, i) => {
            const retardo = 0.1 + indice * 0.035;
            indice += 1;
            return (
              // Ni las palabras ni los caracteres se reordenan: el índice
              // alcanza como key.
              <span
                key={i}
                className="char-roll inline-block"
                style={{ animationDelay: `${retardo}s` }}
              >
                {c}
              </span>
            );
          });
          return (
            <span key={p}>
              {p > 0 ? ' ' : null}
              <span className="inline-block whitespace-nowrap">{letras}</span>
            </span>
          );
        })}
      </span>
    </div>
  );
}
