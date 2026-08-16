'use client';

import { Bell, BookOpen, Calendar, Moon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CerrarSesion } from '@/components/cerrar-sesion';
import { ThemeToggle } from '@/components/theme-toggle';

const ITEMS = [
  { href: '/', label: 'Hoy', Icono: Moon },
  { href: '/semana', label: 'Semana', Icono: Calendar },
  { href: '/materias', label: 'Materias', Icono: BookOpen },
  { href: '/avisos', label: 'Avisos', Icono: Bell },
] as const;

type Props = {
  nombre: string;
  iniciales: string;
  avatarUrl?: string | null;
};

/**
 * Nav lateral fija de 232px (>640px). En móvil la reemplaza BottomNav.
 * No se muestra en /login ni /perfil.
 */
export function Sidebar({ nombre, iniciales, avatarUrl = null }: Props) {
  const pathname = usePathname();
  if (pathname.startsWith('/login') || pathname.startsWith('/perfil')) return null;

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[232px] flex-col border-r border-bor bg-sup px-[14px] py-[22px] min-[641px]:flex">
      <div className="flex items-center gap-[10px] px-2">
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-acc-bg text-acc-fg"
        >
          <Moon size={18} strokeWidth={2} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-extrabold tracking-[-0.01em]">Mi Cursada</span>
          <span className="kicker mt-px block text-[9.5px]">Turno noche</span>
        </span>
      </div>

      <nav className="mt-[26px] flex flex-col gap-1">
        {ITEMS.map(({ href, label, Icono }) => {
          const activa = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={activa ? 'page' : undefined}
              className={`flex min-h-[44px] items-center gap-[11px] rounded-[11px] px-3 text-[13.5px] font-bold ${
                activa ? 'bg-bor !text-acc' : '!text-tx3'
              }`}
            >
              <Icono size={18} strokeWidth={1.9} aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1">
        <ThemeToggle variante="sidebar" />
        <Link
          href="/perfil"
          className="flex min-h-12 items-center gap-[11px] rounded-[11px] px-3 !text-tx"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              aria-hidden
              className="h-[30px] w-[30px] shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-acc-bg text-[11px] font-extrabold text-acc-fg"
            >
              {iniciales || '·'}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-bold">{nombre || 'Sin nombre'}</span>
            <span className="block truncate text-[11px] text-tx3">Tu perfil</span>
          </span>
        </Link>
        <CerrarSesion variante="sidebar" />
      </div>
    </aside>
  );
}
