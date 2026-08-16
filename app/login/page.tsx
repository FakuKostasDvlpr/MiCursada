import { Moon } from 'lucide-react';
import { LoginForm } from '@/components/login-form';
import { supabaseConfigurado } from '@/lib/supabase/configurado';

export const dynamic = 'force-dynamic';

export default function PaginaLogin() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-[360px] flex-col justify-center py-[30px]">
      <div
        aria-hidden
        className="mx-auto grid h-[54px] w-[54px] place-items-center rounded-2xl bg-acc-bg text-acc-fg"
      >
        <Moon size={26} strokeWidth={2} />
      </div>
      <div className="mt-[18px] text-center">
        <div className="kicker tracking-[0.16em]">Mi cursada · Turno noche</div>
        <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.015em]">Entrá a tu cursada</h1>
      </div>
      <LoginForm configurado={supabaseConfigurado()} />
    </main>
  );
}
