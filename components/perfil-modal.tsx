'use client';

// Cáscara modal del perfil. El perfil SIEMPRE es un modal: tanto navegando
// desde adentro (ruta interceptada @modal/(.)perfil) como entrando derecho a
// /perfil o apretando F5, que renderiza esta misma cáscara sobre la pantalla.
//
// Un solo Modal con dos vistas. Elegir avatar NO abre un segundo modal encima:
// antes eran dos scrims apilados, con dos ✕, y cerrar el de arriba te dejaba
// en el de abajo sin saber bien dónde estabas. Ahora se cambia el contenido y
// hay un "atrás" que vuelve al perfil.

import { ChevronLeft } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Modal } from '@/components/modal';
import { PerfilAvatar } from '@/components/perfil-avatar';
import { PerfilVista } from '@/components/perfil-vista';
import type { Perfil } from '@/lib/types';

type Props = {
  perfil: Perfil | null;
  usuario: string;
  conCuenta: boolean;
  /** Turno derivado de los horarios reales (lib/cursada.ts turnoDesdeMaterias). */
  turno?: string | null;
  /** Biblioteca de avatares ya resuelta en el server: la grilla abre poblada. */
  biblioteca?: string[];
  /**
   * Cómo se cierra. `back` vuelve a la pantalla de la que se abrió (navegación
   * interna, hay historia). `home` va a Hoy: es el caso del link directo o el
   * F5, donde no hay a dónde volver y `router.back()` sacaría de la app.
   */
  cerrarCon?: 'back' | 'home';
};

type Vista = 'perfil' | 'avatar';

/** Default estable de `biblioteca`: un `[]` inline sería un array nuevo por render. */
const SIN_BIBLIOTECA: string[] = [];

export function PerfilModal({
  perfil,
  usuario,
  conCuenta,
  turno = null,
  biblioteca = SIN_BIBLIOTECA,
  cerrarCon = 'back',
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [vista, setVista] = useState<Vista>('perfil');
  // El avatar recién guardado, para que la foto de arriba cambie al volver sin
  // esperar a que el server revalide.
  const [avatar, setAvatar] = useState<string | null>(perfil?.avatarUrl ?? null);

  // Los slots paralelos conservan su último contenido en navegaciones suaves:
  // si desde el modal se navega a otra ruta (p. ej. "Cerrar sesión" redirige),
  // esto lo desmonta en vez de dejarlo pegado arriba de la pantalla nueva.
  if (pathname !== '/perfil') return null;

  const cerrar = () => {
    if (cerrarCon === 'home') router.push('/');
    else router.back();
  };

  const volverAPerfil = (url?: string | null) => {
    if (url !== undefined) setAvatar(url);
    setVista('perfil');
    // Que el resto de la app (sidebar, header) tome la foto nueva.
    router.refresh();
  };

  const perfilConAvatar = perfil ? { ...perfil, avatarUrl: avatar } : perfil;

  if (vista === 'avatar') {
    return (
      <Modal
        abierto
        titulo="Elegir tu avatar"
        onCerrar={cerrar}
        encabezado={
          <div className="mb-[18px] flex items-center gap-1">
            <button
              type="button"
              onClick={() => setVista('perfil')}
              className="tactil -ml-2 flex cursor-pointer items-center gap-1 rounded-xl px-2 py-1 text-[13px] font-semibold text-tx3"
            >
              <ChevronLeft size={16} strokeWidth={2.4} aria-hidden />
              Perfil
            </button>
            <span aria-hidden className="text-[13px] text-tx4">
              /
            </span>
            <span className="text-[13px] font-extrabold text-tx">Avatar</span>
          </div>
        }
      >
        <PerfilAvatar
          bibliotecaInicial={biblioteca}
          avatarActual={avatar}
          onListo={(url) => volverAPerfil(url)}
        />
      </Modal>
    );
  }

  return (
    <Modal abierto titulo="Tu perfil" onCerrar={cerrar}>
      <PerfilVista
        perfil={perfilConAvatar}
        usuario={usuario}
        conCuenta={conCuenta}
        alCerrar={cerrar}
        turno={turno}
        onAbrirAvatar={() => setVista('avatar')}
      />
    </Modal>
  );
}
