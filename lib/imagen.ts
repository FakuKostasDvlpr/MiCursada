// Optimización de la foto de perfil ANTES de subirla — solo cliente (usa
// canvas). Ver el presupuesto y las constantes en lib/avatares.ts.
//
// Por qué en el cliente y no en el server: así el archivo pesado no llega ni a
// viajar. Una foto de celular de 8 MB sube como ~25 KB, la subida es
// instantánea y el bucket no se llena.

import { CALIDAD_AVATAR, LADO_AVATAR } from '@/lib/avatares';

/** Qué parte del original entra en el cuadrado final. */
export type Recorte = { sx: number; sy: number; lado: number };

/**
 * Recorte cuadrado centrado, estilo `object-fit: cover`.
 *
 * El avatar se muestra siempre circular y recortado, así que guardar la foto
 * entera (con sus bandas) sería guardar píxeles que nadie ve. Se toma el
 * cuadrado más grande que entre, centrado.
 */
export function recorteCover(ancho: number, alto: number): Recorte {
  const lado = Math.min(ancho, alto);
  return {
    sx: Math.max(0, Math.round((ancho - lado) / 2)),
    sy: Math.max(0, Math.round((alto - lado) / 2)),
    lado,
  };
}

/** ¿Es un GIF? No se redimensiona: el canvas se quedaría con un solo cuadro. */
export function esGif(file: File): boolean {
  return file.type.toLowerCase() === 'image/gif';
}

function cargarImagen(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    img.src = url;
  });
}

/**
 * Devuelve la foto lista para subir: recortada al cuadrado, escalada a
 * `LADO_AVATAR` y recomprimida a WebP.
 *
 * Un GIF vuelve intacto (perdería la animación). Si el navegador no puede dar
 * WebP, cae a JPEG; si no puede ninguno de los dos, devuelve el original antes
 * que dejar a la persona sin poder cambiar su foto.
 */
export async function optimizarImagen(file: File): Promise<File> {
  if (esGif(file)) return file;

  const url = URL.createObjectURL(file);
  try {
    const img = await cargarImagen(url);
    const { sx, sy, lado } = recorteCover(img.naturalWidth, img.naturalHeight);

    const canvas = document.createElement('canvas');
    canvas.width = LADO_AVATAR;
    canvas.height = LADO_AVATAR;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    // Suavizado alto: la reducción es grande (de ~3000 px a 256) y sin esto
    // los bordes quedan dentados.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, lado, lado, 0, 0, LADO_AVATAR, LADO_AVATAR);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/webp', CALIDAD_AVATAR);
    });
    if (blob) return new File([blob], 'avatar.webp', { type: 'image/webp' });

    const jpeg = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', CALIDAD_AVATAR);
    });
    if (jpeg) return new File([jpeg], 'avatar.jpg', { type: 'image/jpeg' });

    return file;
  } catch {
    // Un formato que el navegador no sabe decodificar (un HEIC viejo, por
    // ejemplo) sube sin optimizar: el server tiene su propio límite y lo
    // rechaza si no entra.
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}
