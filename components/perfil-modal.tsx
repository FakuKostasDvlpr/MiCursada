'use client';

// Cáscara modal del perfil (ruta interceptada app/(app)/@modal/(.)perfil).
// El contenido es el mismo PerfilVista de la página; acá solo viven el Modal
// y el cierre por history (router.back() devuelve a la pantalla de la que se
// abrió, sin recargar nada).

import { usePathname, useRouter } from 'next/navigation';
import { Modal } from '@/components/modal';
import { PerfilVista } from '@/components/perfil-vista';
import type { Perfil } from '@/lib/types';

type Props = {
  perfil: Perfil | null;
  usuario: string;
  conCuenta: boolean;
};

export function PerfilModal({ perfil, usuario, conCuenta }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  // Los slots paralelos conservan su último contenido en navegaciones suaves:
  // si desde el modal se navega a otra ruta (p. ej. "Cerrar sesión" redirige),
  // esto lo desmonta en vez de dejarlo pegado arriba de la pantalla nueva.
  if (pathname !== '/perfil') return null;

  const cerrar = () => router.back();

  return (
    <Modal abierto titulo="Tu perfil" onCerrar={cerrar}>
      <PerfilVista perfil={perfil} usuario={usuario} conCuenta={conCuenta} alCerrar={cerrar} />
    </Modal>
  );
}
