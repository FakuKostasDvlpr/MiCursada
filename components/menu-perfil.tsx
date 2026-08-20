'use client';

// Avatar del header de Hoy con su menú: 48px, con la foto del usuario (sin
// fondo detrás: una imagen con transparencia no tiene que verse sobre un
// círculo ámbar) o ámbar con iniciales si no subió ninguna; al TOCARLO baja
// una card con el nombre, la segunda línea, "Ver mi perfil" y "Cerrar sesión".
//
// Se abre con CLICK, no con hover: apuntarle a un avatar de 40px para que no se
// cierre en el camino a la card es impreciso, y en touch el hover directamente
// no existe. Con click el menú se comporta igual en mouse y en dedo.
//
// El avatar es un <button> y no un <Link>: si navegara al perfil no podría
// abrir el menú. "Ver mi perfil" adentro cubre esa navegación.

import { User } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { CerrarSesion } from '@/components/cerrar-sesion';

type Props = {
  nombre: string;
  iniciales: string;
  avatarUrl?: string | null;
  /** Segunda línea del menú (el instituto que manda el aula virtual). */
  segunda?: string | null;
};

export function MenuPerfil({ nombre, iniciales, avatarUrl = null, segunda = null }: Props) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  // Cerrar al tocar afuera y con Escape. `pointerdown` y no `click`: si se
  // esperara al click, tocar un botón de otra parte de la pantalla lo dispararía
  // con el menú todavía encima.
  useEffect(() => {
    if (!abierto) return;

    const afuera = (e: PointerEvent) => {
      if (!caja.current?.contains(e.target as Node | null)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };

    document.addEventListener('pointerdown', afuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', afuera);
      document.removeEventListener('keydown', escape);
    };
  }, [abierto]);

  return (
    <div
      ref={caja}
      className="relative shrink-0"
      onBlurCapture={(e) => {
        // Tabular fuera del menú lo cierra; saltar de una fila a la siguiente no.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAbierto(false);
      }}
    >
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label="Tu perfil"
        className={`grid h-12 w-12 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full text-[14px] font-extrabold ${
          avatarUrl ? '' : 'bg-acc-bg text-acc-fg'
        }`}
      >
        {avatarUrl ? (
          // 48×48 = h-12 w-12, el tamaño real del avatar del header.
          // `unoptimized` solo para la URL relativa: en modo local el avatar lo
          // sirve /api/avatar, que exige la cookie de sesión, y el optimizador
          // de Next hace su propio fetch sin cookies (devolvería 401 y la foto
          // se vería rota). Las URLs del bucket de Supabase son absolutas y
          // públicas: esas sí se optimizan.
          <Image
            src={avatarUrl}
            alt=""
            width={48}
            height={48}
            unoptimized={avatarUrl.startsWith('/')}
            className="h-full w-full object-cover"
          />
        ) : (
          iniciales || <User size={18} strokeWidth={2} aria-hidden />
        )}
      </button>

      {abierto && (
        <div
          role="menu"
          // cardIn a .22s: la card baja, no aparece de golpe.
          style={{ animationDuration: '0.22s' }}
          className="card-in absolute top-[52px] right-0 z-45 min-w-[186px] rounded-[14px] border border-bor2 bg-sup p-[6px] pt-[6px]"
        >
          <div className="px-[10px] pt-2 pb-[6px]">
            <div className="truncate text-[13px] font-bold">{nombre || 'Sin nombre'}</div>
            {segunda && (
              <div className="mt-[2px] truncate font-mono text-[10.5px] text-tx3">{segunda}</div>
            )}
          </div>
          <Link
            href="/perfil"
            role="menuitem"
            onClick={() => setAbierto(false)}
            className="flex min-h-[42px] items-center gap-[9px] rounded-[10px] px-[10px] text-[13.5px] font-semibold !text-tx hover:bg-bor"
          >
            <User size={15} strokeWidth={2} aria-hidden className="text-tx3" />
            Ver mi perfil
          </Link>
          <CerrarSesion variante="menu" />
        </div>
      )}
    </div>
  );
}
