import { LoginEntrada } from '@/components/login-entrada';

export const dynamic = 'force-dynamic';

/**
 * Ojo: acá NO va un `if (hayAcceso()) redirect('/')`. Toda Server Action que se
 * llama desde esta ruta hace que Next vuelva a renderizar la página para
 * devolver el árbol nuevo — y como la sesión se abre en la primera de esas
 * llamadas, ese render redirigiría a Hoy y se comería la secuencia de entrada
 * entera (check, colapso, "trayendo tus datos", "abriendo"). La navegación a
 * Hoy la hace el componente cuando termina la secuencia.
 */
export default function PaginaLogin() {
  return (
    <main className="px-[18px] py-[30px]">
      <LoginEntrada />
    </main>
  );
}
