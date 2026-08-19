'use client';

// Selector de hora en 24 h — SIEMPRE 24 h.
//
// Reemplaza a `<input type="time">`, que se renderiza según el locale del
// NAVEGADOR: en un equipo configurado en inglés, 19:00 se muestra "07:00 PM".
// No hay atributo, `lang` ni CSS que lo fuerce de forma confiable en todos los
// navegadores, y en esta app la hora es siempre 24 h (los horarios se guardan
// y se comparan como 'HH:MM', y la cursada es de 19 a 23).
//
// Dos <select> nativos: el formato lo escribimos nosotros, así que no depende
// de la configuración de nadie, y en móvil sale la rueda nativa.

import { componerHora, minutosOfrecidos, partirHora } from '@/lib/franjas';

type Props = {
  /** 'HH:MM'. */
  valor: string;
  onCambio: (valor: string) => void;
  /** Para lectores de pantalla: "Hora de inicio de …". */
  etiqueta: string;
  disabled?: boolean;
  /** Marca el campo cuando la franja no cierra (fin antes que inicio). */
  invalido?: boolean;
};

const HORAS = Array.from({ length: 24 }, (_, i) => i);
const dosDigitos = (n: number) => String(n).padStart(2, '0');

export function CampoHora({ valor, onCambio, etiqueta, disabled, invalido }: Props) {
  // Un valor ilegible no puede dejar el control en blanco ni romper: cae a
  // 00:00 para que siempre haya algo elegible en pantalla.
  const { hora, minuto } = partirHora(valor) ?? { hora: 0, minuto: 0 };

  const clase = `tactil min-h-9 cursor-pointer rounded-[9px] border bg-sup px-1.5 font-mono text-[12.5px] text-tx ${
    invalido ? 'border-[#fb7185]' : 'border-bor'
  }`;

  return (
    <span className="inline-flex items-center gap-0.5">
      <select
        value={hora}
        disabled={disabled}
        onChange={(e) => onCambio(componerHora(Number(e.target.value), minuto))}
        aria-label={`${etiqueta} (hora)`}
        className={clase}
      >
        {HORAS.map((h) => (
          <option key={h} value={h}>
            {dosDigitos(h)}
          </option>
        ))}
      </select>
      <span aria-hidden className="font-mono text-[12.5px] text-tx4">
        :
      </span>
      <select
        value={minuto}
        disabled={disabled}
        onChange={(e) => onCambio(componerHora(hora, Number(e.target.value)))}
        aria-label={`${etiqueta} (minutos)`}
        className={clase}
      >
        {minutosOfrecidos(minuto).map((m) => (
          <option key={m} value={m}>
            {dosDigitos(m)}
          </option>
        ))}
      </select>
    </span>
  );
}
