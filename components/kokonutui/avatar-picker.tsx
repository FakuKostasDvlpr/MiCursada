'use client';

/**
 * Picker de avatares — adaptado del componente KokonutUI "Avatar Picker"
 * instalado en la Task 19 (ver commit 6fe7a30 para el original).
 *
 * Se conserva TAL CUAL: los 4 avatares SVG con carita, el "stage" 160px con
 * el anillo/glow animado del color de cada avatar, el label "Avatar N" que
 * hace fade al cambiar de selección, la fila de thumbnails cuadrados con
 * badge de check en el activo, y las animaciones vía `motion/react` (la dep
 * ya estaba instalada).
 *
 * Se adaptó: las clases de shadcn (`bg-card`, `text-muted-foreground`,
 * `border-border`, `ring-foreground/70`, etc.) se mapearon a los tokens de
 * Mi Cursada (`bg-sup`, `border-bor2`, `text-tx3`, …) directamente acá adentro
 * — `globals.css` no se tocó. Se sacó el campo "Username" (no aplica: el
 * nombre lo trae el aula virtual, no se crea ni se cambia acá) y el botón
 * final ("Get Started") pasa a ser el que confirma y guarda el avatar
 * ("Usar este avatar", ámbar). El componente ya no incluye su propio Card
 * envolvente: ahora vive dentro de `components/modal.tsx`, que ya aporta el
 * borde/fondo/radio del contenedor.
 *
 * Original: @author @dorianbaffier — https://kokonutui.com — MIT.
 */

import { Check, ChevronRight } from 'lucide-react';
import type { Variants } from 'motion/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Rueda } from '@/components/cargando';

export interface Avatar {
  id: number;
  svg: ReactElement;
  alt: string;
}

// RGB del anillo/glow animado del stage, por avatar (igual que el original).
// --- Generador de avatares estilo "beam" -----------------------------------
//
// Los cuatro avatares originales del componente eran SVGs escritos a mano con
// la misma anatomía: fondo pleno, una mancha rotada con esquinas redondeadas y
// una carita (dos ojos + boca) flotando encima. Acá esa anatomía es UNA función
// y el set sale de combinar la paleta de materias de la app — más variedad sin
// más markup, y todos quedan a tono con el diseño.

type Beam = {
  /** Color de fondo del círculo. */
  fondo: string;
  /** Color de la mancha rotada que cubre la mayor parte. */
  mancha: string;
  /** Color de los ojos y la boca (contraste contra la mancha). */
  cara: string;
  /** Rotación de la mancha, en grados. */
  rot: number;
  /** Corrimiento de la mancha. */
  tx: number;
  ty: number;
  /** Escala de la mancha. */
  escala: number;
  /** Rotación de la carita. */
  rotCara: number;
  /** true = sonríe; false = boca seria (línea recta). */
  sonrie: boolean;
  /** Separación de los ojos (x del ojo izquierdo; el derecho va espejado). */
  ojoX: number;
};

function BeamAvatar({ n, beam }: { n: number; beam: Beam }) {
  const idMask = `beam-${n}`;
  return (
    <svg
      aria-label={`Avatar ${n}`}
      fill="none"
      height="40"
      role="img"
      viewBox="0 0 36 36"
      width="40"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{`Avatar ${n}`}</title>
      <mask height="36" id={idMask} maskUnits="userSpaceOnUse" width="36" x="0" y="0">
        <rect fill="#FFFFFF" height="36" rx="72" width="36" />
      </mask>
      <g mask={`url(#${idMask})`}>
        <rect fill={beam.fondo} height="36" width="36" />
        <rect
          fill={beam.mancha}
          height="36"
          rx="6"
          transform={`translate(${beam.tx} ${beam.ty}) rotate(${beam.rot} 18 18) scale(${beam.escala})`}
          width="36"
          x="0"
          y="0"
        />
        <g transform={`translate(4.5 -4) rotate(${beam.rotCara} 18 18)`}>
          {beam.sonrie ? (
            <path d="M15 19c2 1 4 1 6 0" fill="none" stroke={beam.cara} strokeLinecap="round" />
          ) : (
            <path d="M15 19h6" fill="none" stroke={beam.cara} strokeLinecap="round" />
          )}
          <rect fill={beam.cara} height="2" rx="1" stroke="none" width="1.5" x={beam.ojoX} y="14" />
          <rect
            fill={beam.cara}
            height="2"
            rx="1"
            stroke="none"
            width="1.5"
            x={36 - beam.ojoX - 3.5}
            y="14"
          />
        </g>
      </g>
    </svg>
  );
}

/**
 * El set: los dos primeros son los clásicos del componente original; el resto
 * combina la paleta de materias (celeste, violeta, verde, rosa, naranja, tiza)
 * con el ámbar de la app. Caras oscuras sobre manchas claras y al revés.
 */
const COMBOS: Beam[] = [
  { fondo: '#ff005b', mancha: '#ffb238', cara: '#000000', rot: 219, tx: 9, ty: -5, escala: 1, rotCara: 9, sonrie: true, ojoX: 10 },
  { fondo: '#ff7d10', mancha: '#0a0310', cara: '#FFFFFF', rot: 55, tx: 5, ty: -1, escala: 1.1, rotCara: -5, sonrie: true, ojoX: 14 },
  { fondo: '#0a0310', mancha: '#38bdf8', cara: '#03131f', rot: 145, tx: -4, ty: 6, escala: 1.05, rotCara: 4, sonrie: true, ojoX: 12 },
  { fondo: '#38bdf8', mancha: '#a78bfa', cara: '#160a2e', rot: 300, tx: 7, ty: -3, escala: 1.15, rotCara: -7, sonrie: false, ojoX: 11 },
  { fondo: '#fbbf24', mancha: '#221a00', cara: '#fbbf24', rot: 30, tx: -6, ty: 4, escala: 1, rotCara: 6, sonrie: true, ojoX: 13 },
  { fondo: '#a78bfa', mancha: '#34d399', cara: '#04271a', rot: 200, tx: 8, ty: 2, escala: 1.08, rotCara: -3, sonrie: true, ojoX: 10 },
  { fondo: '#34d399', mancha: '#0a0310', cara: '#34d399', rot: 80, tx: -3, ty: -6, escala: 1.12, rotCara: 8, sonrie: false, ojoX: 12 },
  { fondo: '#fb7185', mancha: '#fbbf24', cara: '#221a00', rot: 250, tx: 4, ty: 7, escala: 1, rotCara: -8, sonrie: true, ojoX: 14 },
  { fondo: '#f97316', mancha: '#e2e8f0', cara: '#1e293b', rot: 120, tx: -7, ty: -2, escala: 1.1, rotCara: 3, sonrie: true, ojoX: 11 },
  { fondo: '#e2e8f0', mancha: '#fb7185', cara: '#20060b', rot: 340, tx: 6, ty: 5, escala: 1.05, rotCara: -4, sonrie: false, ojoX: 13 },
  { fondo: '#0a0310', mancha: '#f97316', cara: '#20060b', rot: 15, tx: -5, ty: -4, escala: 1.18, rotCara: 7, sonrie: true, ojoX: 10 },
  { fondo: '#38bdf8', mancha: '#fbbf24', cara: '#221a00', rot: 165, tx: 3, ty: -7, escala: 1, rotCara: -6, sonrie: true, ojoX: 12 },
];

/** '#rrggbb' → 'r, g, b' para el glow del escenario. */
const hexARgb = (hex: string) =>
  [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((p) => parseInt(p, 16)).join(', ');

const AVATAR_RGB: Record<number, string> = Object.fromEntries(
  COMBOS.map((c, i) => [i + 1, hexARgb(c.mancha)])
);

export const AVATARES_PREDEFINIDOS: Avatar[] = COMBOS.map((beam, i) => ({
  id: i + 1,
  svg: <BeamAvatar beam={beam} n={i + 1} />,
  alt: `Avatar ${i + 1}`,
}));

const containerVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
};

const thumbnailVariants: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: 'easeOut' },
  },
};

/**
 * `guardarAvatarLocal` no acepta `image/svg+xml` (ver EXT_POR_MIME en
 * lib/datos-locales.ts) — así que el SVG elegido se serializa (sin montarlo
 * en el DOM: `renderToStaticMarkup` alcanza) y se rasteriza en un <canvas>
 * a PNG antes de subirlo por la misma action que la foto propia.
 */
export function crearAvatarBlob(avatar: Avatar): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const svgMarkup = renderToStaticMarkup(avatar.svg);
    const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('El navegador no soporta canvas 2D.'));
        return;
      }
      ctx.drawImage(img, 0, 0, 256, 256);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('No se pudo generar el avatar.'));
      }, 'image/png');
    };
    img.onerror = () => reject(new Error('No se pudo generar el avatar.'));
    img.src = svgDataUrl;
  });
}

type Props = {
  /** true mientras se genera/sube el avatar elegido — deshabilita todo el picker. */
  subiendo: boolean;
  /** Error de la subida (mismo copy que devuelve guardarAvatarLocal), mostrado dentro del picker. */
  error: string;
  /** Confirmar ("Usar este avatar"): el padre convierte a blob y sube. */
  onElegir: (avatar: Avatar) => void;
  /** "…o subí tu propia foto": el padre abre su input de archivo. */
  onSubirPropia: () => void;
};

export function AvatarPicker({ subiendo, error, onElegir, onSubirPropia }: Props) {
  const [selectedAvatar, setSelectedAvatar] = useState<Avatar>(AVATARES_PREDEFINIDOS[0]!);
  const shouldReduceMotion = useReducedMotion();

  const handleAvatarSelect = (avatar: Avatar) => {
    if (avatar.id === selectedAvatar.id || subiendo) return;
    setSelectedAvatar(avatar);
  };

  const rgb = AVATAR_RGB[selectedAvatar.id];

  return (
    <div className="space-y-8">
      {/* Avatar Stage */}
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-40 w-40">
          {/* Anillo/glow animado del color del avatar seleccionado */}
          <motion.div
            animate={{
              boxShadow: `0 0 0 2px rgba(${rgb}, 0.55), 0 6px 24px rgba(${rgb}, 0.18)`,
            }}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full"
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.45, ease: 'easeOut' }}
          />

          <div className="relative h-full w-full overflow-hidden rounded-full bg-sup">
            <AnimatePresence mode="wait">
              <motion.div
                animate={{ opacity: 1 }}
                className="absolute inset-0 flex items-center justify-center"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                key={selectedAvatar.id}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
              >
                <div className="scale-[4] transform">{selectedAvatar.svg}</div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.span
            animate={{ opacity: 1 }}
            className="text-[11px] text-tx3 uppercase tracking-[0.12em]"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            key={selectedAvatar.id}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.16, ease: 'easeOut' }}
          >
            {selectedAvatar.alt}
          </motion.span>
        </AnimatePresence>

        <motion.div
          animate="animate"
          className="flex max-w-[300px] flex-wrap justify-center gap-3"
          initial="initial"
          variants={containerVariants}
        >
          {AVATARES_PREDEFINIDOS.map((avatar) => {
            const isSelected = selectedAvatar.id === avatar.id;
            return (
              <motion.button
                aria-label={`Elegir ${avatar.alt}`}
                aria-pressed={isSelected}
                className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 bg-sup transition-[opacity,box-shadow] duration-200 ease-out disabled:cursor-not-allowed ${
                  isSelected ? 'border-tx opacity-100' : 'border-bor2 opacity-50 hover:opacity-100'
                }`}
                disabled={subiendo}
                key={avatar.id}
                onClick={() => handleAvatarSelect(avatar)}
                type="button"
                variants={thumbnailVariants}
                whileHover={shouldReduceMotion || subiendo ? undefined : { scale: 1.06 }}
                whileTap={shouldReduceMotion || subiendo ? undefined : { scale: 0.94 }}
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="scale-[2.3] transform">{avatar.svg}</div>
                </div>
                {isSelected && (
                  <div className="absolute -right-0.5 -bottom-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-tx">
                    <Check aria-hidden="true" className="h-3 w-3 text-bg" />
                  </div>
                )}
              </motion.button>
            );
          })}
        </motion.div>
      </div>

      <div className="space-y-3">
        <button
          className="group flex min-h-12 w-full cursor-pointer items-center justify-center gap-1 rounded-xl bg-acc-bg text-[15px] font-bold text-acc-fg disabled:cursor-not-allowed disabled:opacity-60"
          disabled={subiendo}
          onClick={() => onElegir(selectedAvatar)}
          type="button"
        >
          {subiendo && <Rueda sobreAmbar />}
          {subiendo ? 'Guardando…' : 'Usar este avatar'}
          {!subiendo && (
            <ChevronRight
              aria-hidden="true"
              className="h-4 w-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5"
            />
          )}
        </button>

        <button
          className="tactil block w-full cursor-pointer text-center text-[13px] font-semibold text-tx2 underline decoration-dotted underline-offset-4 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={subiendo}
          onClick={onSubirPropia}
          type="button"
        >
          …o subí tu propia foto
        </button>

        {error && <p className="text-center text-[13px] text-vencido">{error}</p>}
      </div>
    </div>
  );
}
