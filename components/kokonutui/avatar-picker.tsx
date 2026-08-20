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

import { Check, ChevronRight, Plus, X } from 'lucide-react';
import type { Variants } from 'motion/react';
import { AnimatePresence, LazyMotion, useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import Image from 'next/image';
import { useState } from 'react';
import { Rueda } from '@/components/cargando';
import {
  AVATAR_RGB,
  AVATARES_PREDEFINIDOS,
  type Avatar,
} from '@/components/kokonutui/avatares-predefinidos';

/**
 * Las features de animación se cargan aparte del bundle inicial: el picker
 * importa `m` (el componente chico) en vez de `motion`, y `LazyMotion` trae el
 * pack recién cuando el modal se monta. `domAnimation` alcanza — el picker usa
 * animaciones, variants, exit (AnimatePresence mode="wait") y gestos básicos
 * (whileHover/whileTap); no hay drag ni layout animations, que son lo único
 * que obligaría a `domMax` (10 kB más).
 */
const cargarFeatures = () => import('motion/react').then((mod) => mod.domAnimation);

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

type Props = {
  /** true mientras se genera/sube el avatar elegido — deshabilita todo el picker. */
  subiendo: boolean;
  /** Error de la subida (mismo copy que devuelve guardarAvatarLocal), mostrado dentro del picker. */
  error: string;
  /**
   * Tu biblioteca: las imágenes que ya subiste, la más reciente primero. Van
   * antes que los predefinidos, así lo tuyo queda a mano.
   */
  biblioteca: string[];
  /** URL de la biblioteca que arranca marcada (tu avatar actual), si es una. */
  seleccionInicial?: string | null;
  /** Confirmar un predefinido: el padre lo convierte a blob y lo sube. */
  onElegir: (avatar: Avatar) => void;
  /** Confirmar una imagen de la biblioteca: el padre solo la apunta, no la sube. */
  onElegirImagen: (url: string) => void;
  /** El óvalo con `+`: el padre abre su input de archivo. */
  onAgregarImagen: () => void;
  /** La ✕ de una foto de la biblioteca. */
  onBorrarImagen: (url: string) => void;
};

/** Lo que está marcado: un avatar generado, o una imagen tuya. */
type Seleccion = { tipo: 'predefinido'; avatar: Avatar } | { tipo: 'imagen'; url: string };

/**
 * La misma imagen llega con `?v=<timestamp>` cuando viene del perfil y sin él
 * cuando viene del listado del bucket. Comparar crudo no matchearía nunca y el
 * avatar actual se vería sin marcar en su propia biblioteca.
 */
const sinQuery = (url: string) => url.split('?')[0] ?? url;

export function AvatarPicker({
  subiendo,
  error,
  biblioteca,
  seleccionInicial = null,
  onElegir,
  onElegirImagen,
  onAgregarImagen,
  onBorrarImagen,
}: Props) {
  const [seleccion, setSeleccion] = useState<Seleccion>(() =>
    seleccionInicial
      ? { tipo: 'imagen', url: seleccionInicial }
      : { tipo: 'predefinido', avatar: AVATARES_PREDEFINIDOS[0]! }
  );
  const shouldReduceMotion = useReducedMotion();

  // Cuando entra una imagen nueva a la biblioteca queda primera y marcada, sin
  // que haya que volver a tocarla: es el paso siguiente natural después de
  // elegir el archivo.
  const primera = biblioteca[0];
  const [ultimaVista, setUltimaVista] = useState(primera);
  if (primera !== ultimaVista) {
    setUltimaVista(primera);
    if (primera) setSeleccion({ tipo: 'imagen', url: primera });
  }

  const selectedAvatar =
    seleccion.tipo === 'predefinido' ? seleccion.avatar : AVATARES_PREDEFINIDOS[0]!;

  const handleAvatarSelect = (avatar: Avatar) => {
    if (subiendo) return;
    setSeleccion({ tipo: 'predefinido', avatar });
  };

  const elegirImagen = (url: string) => {
    if (subiendo) return;
    setSeleccion({ tipo: 'imagen', url });
  };

  const confirmar = () => {
    if (seleccion.tipo === 'imagen') onElegirImagen(seleccion.url);
    else onElegir(seleccion.avatar);
  };

  const rgb = AVATAR_RGB[selectedAvatar.id];

  return (
    <LazyMotion features={cargarFeatures}>
      <div className="space-y-8">
        {/* Avatar Stage */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-40 w-40">
            {/* Anillo/glow animado del color del avatar seleccionado */}
            <m.div
              animate={{
                boxShadow: `0 0 0 2px rgba(${rgb}, 0.55), 0 6px 24px rgba(${rgb}, 0.18)`,
              }}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-full"
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.45, ease: 'easeOut' }}
            />

            <div className="relative h-full w-full overflow-hidden rounded-full bg-sup">
              <AnimatePresence mode="wait">
                <m.div
                  animate={{ opacity: 1 }}
                  className="absolute inset-0 flex items-center justify-center"
                  exit={{ opacity: 0 }}
                  initial={{ opacity: 0 }}
                  key={seleccion.tipo === 'imagen' ? seleccion.url : selectedAvatar.id}
                  transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
                >
                  {seleccion.tipo === 'imagen' ? (
                    // 160×160 son las medidas reales del stage (h-40 w-40): con
                    // ellas next/image pide al bucket una versión de ese tamaño
                    // en vez de la foto original de varios MB. La biblioteca solo
                    // tiene URLs públicas del bucket (en modo local viene vacía,
                    // ver listarBibliotecaAvatares), así que el host siempre está
                    // declarado en images.remotePatterns.
                    <Image
                      src={seleccion.url}
                      alt="Tu imagen"
                      width={160}
                      height={160}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="scale-[4] transform">{selectedAvatar.svg}</div>
                  )}
                </m.div>
              </AnimatePresence>
            </div>
          </div>

          <AnimatePresence mode="wait">
            <m.span
              animate={{ opacity: 1 }}
              className="text-[11px] text-tx3 uppercase tracking-[0.12em]"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              key={seleccion.tipo === 'imagen' ? seleccion.url : selectedAvatar.id}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.16, ease: 'easeOut' }}
            >
              {seleccion.tipo === 'imagen' ? 'Tu imagen' : selectedAvatar.alt}
            </m.span>
          </AnimatePresence>

          <m.div
            animate="animate"
            className="flex max-w-[300px] flex-wrap justify-center gap-3"
            initial="initial"
            variants={containerVariants}
          >
            {/* El óvalo con `+`: agregar una imagen propia. Va primero porque es
                la acción, y lo que sube queda como la primera imagen de la fila. */}
            <m.button
              aria-label="Agregar una imagen tuya"
              className="relative h-14 w-14 shrink-0 cursor-pointer overflow-hidden rounded-full border-2 border-dashed border-bor2 bg-sup text-tx2 transition-opacity duration-200 ease-out hover:border-acc hover:text-acc disabled:cursor-not-allowed disabled:opacity-60"
              disabled={subiendo}
              onClick={onAgregarImagen}
              type="button"
              variants={thumbnailVariants}
              whileHover={shouldReduceMotion || subiendo ? undefined : { scale: 1.06 }}
              whileTap={shouldReduceMotion || subiendo ? undefined : { scale: 0.94 }}
            >
              <span className="absolute inset-0 flex items-center justify-center">
                <Plus aria-hidden="true" className="h-6 w-6" strokeWidth={2.4} />
              </span>
            </m.button>

            {/* Tu biblioteca: lo que ya subiste, sin volver a subirlo. */}
            {biblioteca.map((url) => {
              const isSelected =
                seleccion.tipo === 'imagen' && sinQuery(seleccion.url) === sinQuery(url);
              return (
                // El borrar NO puede ir adentro del botón de elegir (un <button>
                // dentro de otro es HTML inválido y el click interno no llega):
                // van como hermanos, con el de borrar posicionado encima.
                <m.div
                  className="relative h-14 w-14 shrink-0"
                  key={url}
                  variants={thumbnailVariants}
                  whileHover={shouldReduceMotion || subiendo ? undefined : { scale: 1.06 }}
                  whileTap={shouldReduceMotion || subiendo ? undefined : { scale: 0.94 }}
                >
                  <button
                    aria-label="Elegir tu imagen"
                    aria-pressed={isSelected}
                    className={`h-full w-full cursor-pointer overflow-hidden rounded-xl border-2 bg-sup transition-[opacity,box-shadow] duration-200 ease-out disabled:cursor-not-allowed ${
                      isSelected ? 'border-tx opacity-100' : 'border-bor2 opacity-50 hover:opacity-100'
                    }`}
                    disabled={subiendo}
                    onClick={() => elegirImagen(url)}
                    type="button"
                  >
                    {/* 56×56 = h-14 w-14, el tamaño real del thumbnail. */}
                    <Image src={url} alt="" width={56} height={56} className="h-full w-full object-cover" />
                  </button>

                  {isSelected && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -right-0.5 -bottom-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-tx"
                    >
                      <Check className="h-3 w-3 text-bg" />
                    </span>
                  )}

                  <button
                    aria-label="Borrar esta foto"
                    className="absolute -top-1.5 -right-1.5 grid h-5 w-5 cursor-pointer place-items-center rounded-full border border-bor2 bg-sup text-tx3 hover:border-[#fb7185] hover:text-[#fb7185] disabled:cursor-not-allowed"
                    disabled={subiendo}
                    onClick={() => onBorrarImagen(url)}
                    type="button"
                  >
                    <X aria-hidden="true" className="h-3 w-3" strokeWidth={2.6} />
                  </button>
                </m.div>
              );
            })}

            {AVATARES_PREDEFINIDOS.map((avatar) => {
              const isSelected = seleccion.tipo === 'predefinido' && selectedAvatar.id === avatar.id;
              return (
                <m.button
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
                </m.button>
              );
            })}
          </m.div>
        </div>

        <div className="space-y-3">
          <button
            className="group flex min-h-12 w-full cursor-pointer items-center justify-center gap-1 rounded-xl bg-acc-bg text-[15px] font-bold text-acc-fg disabled:cursor-not-allowed disabled:opacity-60"
            disabled={subiendo}
            onClick={confirmar}
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

          {/* El "…o subí tu propia foto" que iba acá se fue: subir una imagen es
              ahora el óvalo con `+` de la grilla, al lado del resto. Tener dos
              entradas para lo mismo, y una escondida abajo, era el problema. */}

          {error && <p className="text-center text-[13px] text-vencido">{error}</p>}
        </div>
      </div>
    </LazyMotion>
  );
}
