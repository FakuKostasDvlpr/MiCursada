'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Props = {
  /** Si Supabase no está configurado (.env.local), no hay auth posible. */
  configurado: boolean;
};

/**
 * Login con magic link de Supabase: un solo input de email + "Entrar".
 * Al enviar, muestra la nota de "revisá tu correo".
 */
export function LoginForm({ configurado }: Props) {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  if (!configurado) {
    return (
      <div className="mt-[26px] rounded-2xl border border-dashed border-bor bg-sup px-5 py-6 text-center text-[13.5px] text-tx3">
        Falta configurar Supabase (.env.local).
      </div>
    );
  }

  if (enviado) {
    return (
      <div className="mt-[26px] rounded-2xl border border-bor bg-sup px-5 py-6 text-center text-[14px] text-tx2">
        Te mandamos un link a tu correo. Abrilo desde este dispositivo.
      </div>
    );
  }

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    const limpio = email.trim();
    if (!limpio) {
      setError('Poné tu correo.');
      return;
    }
    setEnviando(true);
    setError('');
    const supabase = createClient();
    const { error: errorOtp } = await supabase.auth.signInWithOtp({
      email: limpio,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setEnviando(false);
    if (errorOtp) {
      setError('No pudimos mandarte el link. Probá de nuevo.');
      return;
    }
    setEnviado(true);
  };

  return (
    <form onSubmit={entrar} className="mt-[26px] flex flex-col gap-[10px]">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Tu correo"
        autoComplete="email"
        className="min-h-12 w-full rounded-xl border border-bor bg-sup px-[14px] text-[15px] text-tx"
      />
      {error && <div className="text-[13px] text-vencido">{error}</div>}
      <button
        type="submit"
        disabled={enviando}
        className="mt-1 min-h-12 cursor-pointer rounded-xl bg-acc-bg text-[15px] font-bold text-acc-fg disabled:opacity-60"
      >
        {enviando ? 'Enviando…' : 'Entrar'}
      </button>
    </form>
  );
}
