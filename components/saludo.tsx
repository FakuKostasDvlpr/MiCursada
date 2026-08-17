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

  return (
    <div className="kicker overflow-hidden text-acc">
      <span className="sr-only">{texto}</span>
      <span aria-hidden>
        {texto.split('').map((c, i) => (
          <span
            // Los caracteres no se reordenan: el índice alcanza como key.
            key={i}
            className="char-roll inline-block"
            style={{ animationDelay: `${0.1 + i * 0.035}s` }}
          >
            {c === ' ' ? ' ' : c}
          </span>
        ))}
      </span>
    </div>
  );
}
