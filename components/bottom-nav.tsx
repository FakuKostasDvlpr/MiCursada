'use client';

import { Bell, BookOpen, Calendar, Moon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconoGrafo } from '@/components/icono-grafo';

const ITEMS = [
  { href: '/', label: 'Hoy', Icono: Moon },
  { href: '/semana', label: 'Semana', Icono: Calendar },
  { href: '/materias', label: 'Materias', Icono: BookOpen },
  { href: '/avisos', label: 'Avisos', Icono: Bell },
  { href: '/grafo', label: 'Grafo', Icono: IconoGrafo },
] as const;

/**
 * Bottom nav fija de 5 pestañas (móvil ≤640px; arriba de eso manda Sidebar).
 * No se muestra en /login. (/perfil dejó de ser especial: se abre como modal
 * interceptado y el shell queda visible atrás.)
 */
export function BottomNav() {
  const pathname = usePathname();
  if (pathname.startsWith('/login')) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-bor bg-navbg pb-[env(safe-area-inset-bottom)] backdrop-blur-[14px] min-[641px]:hidden">
      <div className="mx-auto grid max-w-[720px] grid-cols-5">
        {ITEMS.map(({ href, label, Icono }) => {
          const activa = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={activa ? 'page' : undefined}
              className={`flex min-h-[56px] flex-col items-center gap-1 pt-[10px] pb-3 text-[11px] font-bold ${
                activa ? 'text-acc' : 'text-tx3'
              }`}
            >
              <Icono size={21} strokeWidth={1.9} aria-hidden />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
