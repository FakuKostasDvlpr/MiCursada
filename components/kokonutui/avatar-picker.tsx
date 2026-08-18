'use client';

// Picker de avatares (adaptado del componente KokonutUI "Avatar Picker" de la
// Task 19 a los tokens de Mi Cursada — ver HANDOFF.md). En vez de las SVGs de
// muestra del componente original, cada avatar predefinido es un círculo
// dibujado en <canvas> con uno de los colores de materia del handoff
// (lib/types.ts → COLORES_MATERIA), convertido a PNG y subido por la misma
// Server Action que usa la foto propia (guardarAvatarLocal en app/actions.ts).

import { Check } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { COLORES_MATERIA } from '@/lib/types';

export type AvatarPredefinido = { id: string; color: string; nombre: string };

export const AVATARES_PREDEFINIDOS: AvatarPredefinido[] = [
  { id: 'celeste', color: COLORES_MATERIA[0], nombre: 'Celeste' },
  { id: 'violeta', color: COLORES_MATERIA[1], nombre: 'Violeta' },
  { id: 'verde', color: COLORES_MATERIA[2], nombre: 'Verde' },
  { id: 'rosa', color: COLORES_MATERIA[3], nombre: 'Rosa' },
  { id: 'naranja', color: COLORES_MATERIA[4], nombre: 'Naranja' },
];

/**
 * Dibuja un avatar redondo de color sólido con una carita simple en un
 * <canvas> y lo devuelve como PNG. Solo corre en el navegador (usa canvas).
 */
export function crearAvatarPredefinido(color: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('El navegador no soporta canvas 2D.'));
      return;
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(128, 128, 128, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.beginPath();
    ctx.ellipse(96, 118, 9, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(160, 118, 9, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(128, 132, 40, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('No se pudo generar el avatar.'));
    }, 'image/png');
  });
}

type Props = {
  /** Color del último predefinido elegido en esta sesión (null si no eligió ninguno o subió foto propia). */
  colorActivo: string | null;
  deshabilitado: boolean;
  onElegir: (color: string) => void;
};

export function AvatarPicker({ colorActivo, deshabilitado, onElegir }: Props) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="flex flex-wrap justify-center gap-3" role="group" aria-label="Avatares predefinidos">
      {AVATARES_PREDEFINIDOS.map((avatar) => {
        const activo = colorActivo === avatar.color;
        return (
          <motion.button
            key={avatar.id}
            type="button"
            aria-label={`Avatar ${avatar.nombre}`}
            aria-pressed={activo}
            disabled={deshabilitado}
            onClick={() => onElegir(avatar.color)}
            whileHover={shouldReduceMotion || deshabilitado ? undefined : { scale: 1.08 }}
            whileTap={shouldReduceMotion || deshabilitado ? undefined : { scale: 0.92 }}
            className="tactil relative h-11 w-11 shrink-0 cursor-pointer rounded-full border-2 border-bor2 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: avatar.color }}
          >
            {activo && (
              <span className="absolute -right-1 -bottom-1 grid h-5 w-5 place-items-center rounded-full border-2 border-bg bg-tx text-bg">
                <Check size={11} strokeWidth={3} aria-hidden />
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
