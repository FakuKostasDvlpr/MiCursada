// El sonido del aviso de "dar el presente", sintetizado con WebAudio.
//
// Sin archivo en /public y sin dependencias: son dos osciladores y un envelope.
// Un .mp3 sumaría un binario al repo para 0,4 segundos de audio.

/** Las dos notas del chime (La5 → Mi6): un intervalo que sube, no una alarma. */
const NOTAS = [880, 1320] as const;

/** Cuánto dura cada nota. */
const DURACION = 0.18;

/** Volumen de pico. Bajo a propósito: avisa, no sobresalta. */
const PICO = 0.18;

/**
 * Suena el chime en el `AudioContext` que se le pase. El contexto lo crea el
 * click de la campanita (`components/aviso-presente.tsx`): es el único momento
 * con gesto de usuario, y sin eso el navegador no deja sonar nada después,
 * cuando el aviso salta solo.
 *
 * No tira: si el contexto está cerrado o el navegador se pone raro, el aviso
 * visual (notificación o toast) ya salió igual.
 */
export function sonarChime(ctx: AudioContext): void {
  try {
    NOTAS.forEach((hz, i) => {
      const desde = ctx.currentTime + i * DURACION;
      const hasta = desde + DURACION;

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = hz;

      // Envelope: sube en 12 ms y decae exponencialmente. Sin esto, cortar la
      // onda de golpe hace un click audible.
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, desde);
      gain.gain.exponentialRampToValueAtTime(PICO, desde + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, hasta);

      osc.connect(gain).connect(ctx.destination);
      osc.start(desde);
      osc.stop(hasta);
    });
  } catch {
    // Audio bloqueado o contexto cerrado: el aviso visual alcanza.
  }
}
