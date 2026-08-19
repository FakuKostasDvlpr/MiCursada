'use client';

// Vista "Elegir tu avatar" — es una VISTA del modal de perfil, no un modal
// aparte. Antes se abría un segundo Modal encima del de perfil: dos scrims
// apilados, dos ✕, y cerrar el de arriba dejaba el de abajo sin contexto de
// dónde estabas. Ahora el modal es uno solo y acá se cambia el contenido, con
// un "atrás" que vuelve al perfil.

import { useRef, useState } from 'react';
import {
  borrarAvatarDeBiblioteca,
  guardarAvatarLocal,
  subirAvatarABiblioteca,
  usarAvatarDeBiblioteca,
} from '@/app/actions';
import { type Avatar, AvatarPicker, crearAvatarBlob } from '@/components/kokonutui/avatar-picker';
import {
  AVISAR_DESDE,
  MAX_FOTOS_BIBLIOTECA,
  MAX_GIF,
  MAX_ORIGINAL,
  formatearPeso,
} from '@/lib/avatares';
import { esGif, optimizarImagen } from '@/lib/imagen';
import { lanzarToast } from '@/lib/toast';

type Props = {
  /** Biblioteca que ya llegó del server: la grilla se ve poblada al abrir. */
  bibliotecaInicial: string[];
  /** Tu avatar de ahora, para que arranque marcado. */
  avatarActual: string | null;
  /** Guardado con éxito: el modal vuelve a la vista de perfil. */
  onListo: (url: string | null) => void;
};

export function PerfilAvatar({ bibliotecaInicial, avatarActual, onListo }: Props) {
  const inputFoto = useRef<HTMLInputElement>(null);
  const [biblioteca, setBiblioteca] = useState<string[]>(bibliotecaInicial);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');

  /**
   * El óvalo con `+`: sube la imagen a la biblioteca y la deja marcada, SIN
   * aplicarla todavía. Aplicar es el paso siguiente ("Usar este avatar").
   */
  const agregarImagen = async (original: File) => {
    if (subiendo) return;
    // El tope también se chequea en el server; acá se corta antes para no
    // subir un archivo que va a rebotar.
    if (biblioteca.length >= MAX_FOTOS_BIBLIOTECA) {
      lanzarToast(`Máximo ${MAX_FOTOS_BIBLIOTECA} fotos. Borrá una para subir otra.`, 'error');
      return;
    }
    // Un archivo enorme ni se intenta: decodificarlo en un canvas para
    // achicarlo colgaría la pestaña.
    if (original.size > MAX_ORIGINAL) {
      lanzarToast(
        `Esa imagen pesa ${formatearPeso(original.size)} y es demasiado grande. Probá con una de hasta ${formatearPeso(MAX_ORIGINAL)}.`,
        'error'
      );
      return;
    }
    // El GIF no pasa por el canvas: perdería la animación. Como no se puede
    // achicar, se acota.
    if (esGif(original) && original.size > MAX_GIF) {
      lanzarToast(
        `Ese GIF pesa ${formatearPeso(original.size)} y el máximo es ${formatearPeso(MAX_GIF)}. Los GIF no se pueden optimizar sin perder la animación.`,
        'error'
      );
      return;
    }

    setSubiendo(true);
    setError('');
    try {
      const file = await optimizarImagen(original);

      // Solo se cuenta cuando la original venía pesada de verdad: avisar de un
      // ahorro de 40 KB sería ruido.
      if (original.size >= AVISAR_DESDE && file.size < original.size) {
        lanzarToast(
          `Tu foto pesaba ${formatearPeso(original.size)}. La dejamos en ${formatearPeso(file.size)} para que cargue rápido.`,
          'ok'
        );
      }

      const formData = new FormData();
      formData.append('foto', file);
      const r = await subirAvatarABiblioteca(formData);
      if (!r.ok) {
        lanzarToast(r.error, 'error');
        return;
      }
      // Al frente: es "la primera imagen", y el picker sigue ese primer
      // elemento para mover la selección solo.
      setBiblioteca((prev) => [r.url, ...prev.filter((u) => u !== r.url)]);
      // Sin el aviso de optimización queda este; con él, ese ya confirmó que
      // la foto entró y dos toast seguidos serían ruido.
      if (original.size < AVISAR_DESDE) lanzarToast('Foto agregada', 'ok');
    } finally {
      setSubiendo(false);
    }
  };

  /** Confirmar una imagen de la biblioteca: no se vuelve a subir, solo se apunta. */
  const elegirImagen = async (url: string) => {
    if (subiendo) return;
    setSubiendo(true);
    setError('');
    try {
      const r = await usarAvatarDeBiblioteca(url);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      lanzarToast('Foto actualizada', 'ok');
      onListo(r.url);
    } finally {
      setSubiendo(false);
    }
  };

  /** Confirmar un avatar generado: se rasteriza a PNG y se sube. */
  const elegirAvatar = async (avatar: Avatar) => {
    // Guard: sin esto, un doble-click dispara dos generaciones en paralelo
    // mientras `crearAvatarBlob` todavía corre y `subiendo` sigue en false.
    if (subiendo) return;
    setSubiendo(true);
    setError('');
    let blob: Blob;
    try {
      blob = await crearAvatarBlob(avatar);
    } catch {
      setError('No se pudo generar el avatar. Probá de nuevo.');
      setSubiendo(false);
      return;
    }
    try {
      const formData = new FormData();
      formData.append('foto', new File([blob], `avatar-${avatar.id}.png`, { type: 'image/png' }));
      const r = await guardarAvatarLocal(formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      lanzarToast('Foto actualizada', 'ok');
      onListo(r.url);
    } finally {
      setSubiendo(false);
    }
  };

  const borrarImagen = async (url: string) => {
    if (subiendo) return;
    setSubiendo(true);
    setError('');
    try {
      const r = await borrarAvatarDeBiblioteca(url);
      if (!r.ok) {
        lanzarToast(r.error, 'error');
        return;
      }
      setBiblioteca((prev) => prev.filter((u) => u !== url));
      lanzarToast('Foto borrada', 'delete');
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <>
      <input
        ref={inputFoto}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/heic"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void agregarImagen(file);
          e.target.value = '';
        }}
      />
      <AvatarPicker
        subiendo={subiendo}
        error={error}
        biblioteca={biblioteca}
        seleccionInicial={avatarActual}
        onElegir={(avatar) => void elegirAvatar(avatar)}
        onElegirImagen={(url) => void elegirImagen(url)}
        onAgregarImagen={() => inputFoto.current?.click()}
        onBorrarImagen={(url) => void borrarImagen(url)}
      />
    </>
  );
}
