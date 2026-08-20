'use client';

// Avatar del header de Hoy con su menú: 48px, con la foto del usuario (sin
// fondo detrás: una imagen con transparencia no tiene que verse sobre un
// círculo ámbar) o ámbar con iniciales si no subió ninguna; al TOCARLO baja
// una card con el nombre, la segunda línea, "Ver mi perfil" y "Cerrar sesión".
//
// Se abre con CLICK **y** con HOVER (hover pedido el 19/08). El click sigue
// siendo el camino principal y el único en touch: ahí el hover no existe, así
// que el `pointerenter` se ignora salvo que venga de un mouse de verdad
// (`pointerType === 'mouse'`) — en iOS y Android el primer toque emite un
// pointerenter sintético que si no, abriría el menú sin que nadie lo pida.
//
// Al sacar el mouse cierra YA, sin demora (pedido del 19/08). Eso obliga a que
// no haya ni un pixel muerto entre el avatar y la card: el handoff deja 4px de
// aire (la card arranca en top:52 y el avatar mide 48), y cruzarlos dispararía
// `pointerleave` cerrando el menú antes de llegar. Se resuelve con un PUENTE
// transparente — la card va dentro de un contenedor `top-full pt-1`, así el
// hueco sigue viéndose igual pero para el puntero el área es continua.
//
// Si el menú se abrió con click, salirse con el mouse NO lo cierra: se cierra
// como siempre (click afuera, Escape, elegir una fila). Un menú que abriste a
// propósito no se te tiene que escapar por mover el cursor.
//
// El avatar es un <button> y no un <Link>: si navegara al perfil no podría
// abrir el menú. "Ver mi perfil" adentro cubre esa navegación.

import { User } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { FilaSalir, ModalSalir } from '@/components/cerrar-sesion';

type Props = {
  nombre: string;
  iniciales: string;
  avatarUrl?: string | null;
  /** Segunda línea del menú (el instituto que manda el aula virtual). */
  segunda?: string | null;
};

export function MenuPerfil({ nombre, iniciales, avatarUrl = null, segunda = null }: Props) {
  const [abierto, setAbierto] = useState(false);
  // El modal de salida vive ACÁ y no adentro del menú: el handoff pide que
  // tocar "Cerrar sesión" cierre el menú, y el menú desmonta su contenido — el
  // modal se iría con él antes de aparecer.
  const [salir, setSalir] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  /**
   * Si lo abrió el hover. Es un ref y no state porque lo lee el `onClick` en el
   * mismo tick en que el `pointerenter` acaba de abrirlo: con state, el click
   * leía el valor del render anterior y el menú se cerraba solo.
   */
  const porHover = useRef(false);

  const alEntrar = (e: React.PointerEvent) => {
    // Solo mouse: en touch el pointerenter sintético del primer toque abriría
    // el menú sin que nadie lo pida, y encima pelearía con el onClick.
    if (e.pointerType !== 'mouse') return;
    if (salir) return; // con el modal de salida abierto, el menú no vuelve
    // Si ya estaba abierto es porque lo fijó un click: volver a entrar con el
    // mouse no lo devuelve a "modo hover" (si no, salirse lo cerraría).
    if (!abierto) porHover.current = true;
    setAbierto(true);
  };

  const alSalir = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    if (!porHover.current) return; // lo abrió un click: que lo cierre un click
    porHover.current = false;
    setAbierto(false);
  };

  // Cerrar al tocar afuera y con Escape. `pointerdown` y no `click`: si se
  // esperara al click, tocar un botón de otra parte de la pantalla lo dispararía
  // con el menú todavía encima.
  useEffect(() => {
    if (!abierto) return;

    // Cerrar por afuera también resetea el modo: el próximo hover vuelve a
    // decidir si el menú se cierra al salirse o no.
    const cerrarYa = () => {
      porHover.current = false;
      setAbierto(false);
    };

    const afuera = (e: PointerEvent) => {
      if (!caja.current?.contains(e.target as Node | null)) cerrarYa();
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrarYa();
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
      // En el contenedor y no en el botón: así el menú cuenta como "adentro" y
      // pasar el mouse del avatar a la card no lo cierra.
      onPointerEnter={alEntrar}
      onPointerLeave={alSalir}
      onBlurCapture={(e) => {
        // Tabular fuera del menú lo cierra; saltar de una fila a la siguiente no.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAbierto(false);
      }}
    >
      <button
        type="button"
        onClick={() => {
          // Con el mouse encima, el hover YA abrió el menú, así que un toggle
          // pelado lo cerraba: clickear el avatar era "cerrar". Si viene del
          // hover, el click lo FIJA (pasa a modo click y se queda abierto);
          // recién el segundo click lo cierra.
          //
          // Se mira SOLO el ref, nunca `abierto`: el pointerenter y el click
          // caen en el mismo tick y `abierto` todavía vale false acá.
          if (porHover.current) {
            porHover.current = false;
            setAbierto(true);
            return;
          }
          setAbierto((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label="Tu perfil"
        className={`grid h-12 w-12 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full text-[14px] font-extrabold ${
          avatarUrl ? '' : 'bg-acc-bg text-acc-fg'
        }`}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          iniciales || <User size={18} strokeWidth={2} aria-hidden />
        )}
      </button>

      {abierto && (
        // El contenedor es el PUENTE: arranca pegado al avatar (top-full = 48px)
        // y su pt-1 son los 4px de aire del handoff, ahora hoverables. Sin esto,
        // con el cierre inmediato el menú se cerraba al cruzar el hueco.
        <div className="absolute top-full right-0 z-45 pt-1">
          <div
            role="menu"
            // cardIn a .22s: la card baja, no aparece de golpe.
            style={{ animationDuration: '0.22s' }}
            className="card-in min-w-[186px] rounded-[14px] border border-bor2 bg-sup p-[6px] pt-[6px]"
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
              onClick={() => {
                porHover.current = false;
                setAbierto(false);
              }}
              className="flex min-h-[42px] items-center gap-[9px] rounded-[10px] px-[10px] text-[13.5px] font-semibold !text-tx hover:bg-bor"
            >
              <User size={15} strokeWidth={2} aria-hidden className="text-tx3" />
              Ver mi perfil
            </Link>
            <FilaSalir
              onClick={() => {
                porHover.current = false;
                setAbierto(false);
                setSalir(true);
              }}
            />
          </div>
        </div>
      )}

      <ModalSalir abierto={salir} onCerrar={() => setSalir(false)} />
    </div>
  );
}
