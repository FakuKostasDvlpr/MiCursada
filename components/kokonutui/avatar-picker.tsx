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

export interface Avatar {
  id: number;
  svg: ReactElement;
  alt: string;
}

// RGB del anillo/glow animado del stage, por avatar (igual que el original).
const AVATAR_RGB: Record<number, string> = {
  1: '255, 0, 91',
  2: '255, 125, 16',
  3: '255, 0, 91',
  4: '137, 252, 179',
};

export const AVATARES_PREDEFINIDOS: Avatar[] = [
  {
    id: 1,
    svg: (
      <svg
        aria-label="Avatar 1"
        fill="none"
        height="40"
        role="img"
        viewBox="0 0 36 36"
        width="40"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title>Avatar 1</title>
        <mask height="36" id=":r111:" maskUnits="userSpaceOnUse" width="36" x="0" y="0">
          <rect fill="#FFFFFF" height="36" rx="72" width="36" />
        </mask>
        <g mask="url(#:r111:)">
          <rect fill="#ff005b" height="36" width="36" />
          <rect
            fill="#ffb238"
            height="36"
            rx="6"
            transform="translate(9 -5) rotate(219 18 18) scale(1)"
            width="36"
            x="0"
            y="0"
          />
          <g transform="translate(4.5 -4) rotate(9 18 18)">
            <path d="M15 19c2 1 4 1 6 0" fill="none" stroke="#000000" strokeLinecap="round" />
            <rect fill="#000000" height="2" rx="1" stroke="none" width="1.5" x="10" y="14" />
            <rect fill="#000000" height="2" rx="1" stroke="none" width="1.5" x="24" y="14" />
          </g>
        </g>
      </svg>
    ),
    alt: 'Avatar 1',
  },
  {
    id: 2,
    svg: (
      <svg
        aria-label="Avatar 2"
        fill="none"
        height="40"
        role="img"
        viewBox="0 0 36 36"
        width="40"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title>Avatar 2</title>
        <mask height="36" id=":R4mrttb:" maskUnits="userSpaceOnUse" width="36" x="0" y="0">
          <rect fill="#FFFFFF" height="36" rx="72" width="36" />
        </mask>
        <g mask="url(#:R4mrttb:)">
          <rect fill="#ff7d10" height="36" width="36" />
          <rect
            fill="#0a0310"
            height="36"
            rx="6"
            transform="translate(5 -1) rotate(55 18 18) scale(1.1)"
            width="36"
            x="0"
            y="0"
          />
          <g transform="translate(7 -6) rotate(-5 18 18)">
            <path d="M15 20c2 1 4 1 6 0" fill="none" stroke="#FFFFFF" strokeLinecap="round" />
            <rect fill="#FFFFFF" height="2" rx="1" stroke="none" width="1.5" x="14" y="14" />
            <rect fill="#FFFFFF" height="2" rx="1" stroke="none" width="1.5" x="20" y="14" />
          </g>
        </g>
      </svg>
    ),
    alt: 'Avatar 2',
  },
  {
    id: 3,
    svg: (
      <svg
        aria-label="Avatar 3"
        fill="none"
        height="40"
        role="img"
        viewBox="0 0 36 36"
        width="40"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title>Avatar 3</title>
        <mask height="36" id=":r11c:" maskUnits="userSpaceOnUse" width="36" x="0" y="0">
          <rect fill="#FFFFFF" height="36" rx="72" width="36" />
        </mask>
        <g mask="url(#:r11c:)">
          <rect fill="#0a0310" height="36" width="36" />
          <rect
            fill="#ff005b"
            height="36"
            rx="36"
            transform="translate(-3 7) rotate(227 18 18) scale(1.2)"
            width="36"
            x="0"
            y="0"
          />
          <g transform="translate(-3 3.5) rotate(7 18 18)">
            <path d="M13,21 a1,0.75 0 0,0 10,0" fill="#FFFFFF" />
            <rect fill="#FFFFFF" height="2" rx="1" stroke="none" width="1.5" x="12" y="14" />
            <rect fill="#FFFFFF" height="2" rx="1" stroke="none" width="1.5" x="22" y="14" />
          </g>
        </g>
      </svg>
    ),
    alt: 'Avatar 3',
  },
  {
    id: 4,
    svg: (
      <svg
        aria-label="Avatar 4"
        fill="none"
        height="40"
        role="img"
        viewBox="0 0 36 36"
        width="40"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title>Avatar 4</title>
        <mask height="36" id=":r1gg:" maskUnits="userSpaceOnUse" width="36" x="0" y="0">
          <rect fill="#FFFFFF" height="36" rx="72" width="36" />
        </mask>
        <g mask="url(#:r1gg:)">
          <rect fill="#d8fcb3" height="36" width="36" />
          <rect
            fill="#89fcb3"
            height="36"
            rx="6"
            transform="translate(9 -5) rotate(219 18 18) scale(1)"
            width="36"
            x="0"
            y="0"
          />
          <g transform="translate(4.5 -4) rotate(9 18 18)">
            <path d="M15 19c2 1 4 1 6 0" fill="none" stroke="#000000" strokeLinecap="round" />
            <rect fill="#000000" height="2" rx="1" stroke="none" width="1.5" x="10" y="14" />
            <rect fill="#000000" height="2" rx="1" stroke="none" width="1.5" x="24" y="14" />
          </g>
        </g>
      </svg>
    ),
    alt: 'Avatar 4',
  },
];

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

        <motion.div animate="animate" className="flex gap-3" initial="initial" variants={containerVariants}>
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
