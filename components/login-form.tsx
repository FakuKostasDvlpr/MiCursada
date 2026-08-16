'use client';

// Login con las credenciales del AULA VIRTUAL. La contraseña vive solo en el
// state de este formulario mientras lo llenás: se manda a la server action, que
// la usa para pedirle el token a Moodle y la descarta. No se guarda, no vuelve
// y el componente se desmonta apenas entrás.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { type ResultadoLogin, iniciarSesion } from '@/app/actions-sesion';

type Props = {
  /** URL del aula virtual, para el link de "me olvidé la contraseña". */
  urlAula: string;
};

const claseInput =
  'min-h-12 w-full rounded-xl border border-bor bg-sup px-[14px] text-[15px] text-tx';

export function LoginForm({ urlAula }: Props) {
  const router = useRouter();
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [entrando, setEntrando] = useState(false);
  const [error, setError] = useState('');

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usuario.trim() || !password) {
      setError('Poné tu usuario y tu contraseña.');
      return;
    }
    setEntrando(true);
    setError('');
    let r: ResultadoLogin;
    try {
      r = await iniciarSesion(usuario.trim(), password);
    } catch {
      r = { ok: false, error: 'Algo falló. Probá de nuevo.' };
    }
    if (!r.ok) {
      setEntrando(false);
      setError(r.error);
      return;
    }
    setPassword(''); // la contraseña no sobrevive al login
    router.replace('/');
    router.refresh();
  };

  return (
    <form onSubmit={entrar} className="mt-[26px] flex flex-col gap-[10px]">
      <input
        type="text"
        value={usuario}
        onChange={(e) => setUsuario(e.target.value)}
        placeholder="Tu usuario del aula virtual"
        aria-label="Usuario del aula virtual"
        autoComplete="username"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className={claseInput}
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Tu contraseña"
        aria-label="Contraseña del aula virtual"
        autoComplete="current-password"
        className={claseInput}
      />
      {error && <div className="text-[13px] text-vencido">{error}</div>}
      <button
        type="submit"
        disabled={entrando}
        className="mt-1 min-h-12 cursor-pointer rounded-xl bg-acc-bg text-[15px] font-bold text-acc-fg disabled:opacity-60"
      >
        {entrando ? 'Entrando…' : 'Entrar'}
      </button>
      <a
        href={`${urlAula}/login/forgot_password.php`}
        target="_blank"
        rel="noreferrer"
        className="mt-1 flex min-h-11 items-center justify-center text-[13px] font-semibold !text-tx2"
      >
        ¿Te olvidaste la contraseña?
      </a>
      <p className="text-center font-mono text-[11px] leading-[1.5] text-tx4">
        entrá con el usuario y la contraseña del aula virtual — tu contraseña no se guarda
      </p>
    </form>
  );
}
