'use client';

// Perfil de solo lectura (handoff v3 §0b). Los datos vienen del aula virtual, no
// se escriben a mano: lo único editable es la foto, que es de la app y no de
// Moodle.

import { Camera, Check, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { guardarAvatarLocal } from '@/app/actions';
import { CerrarSesion } from '@/components/cerrar-sesion';
import { iniciales } from '@/lib/cursada';
import { INSTITUTO, SEDE_Y_TURNO } from '@/lib/instituto';
import type { Perfil } from '@/lib/types';

type Props = {
  perfil: Perfil | null;
  /** `username` del aula virtual (sale de datos/moodle.json, no del perfil). */
  usuario: string;
};

export function PerfilVista({ perfil, usuario }: Props) {
  const router = useRouter();
  const inputFoto = useRef<HTMLInputElement>(null);

  const [fotoUrl, setFotoUrl] = useState(perfil?.avatarUrl ?? null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');

  const nombre = perfil?.nombre ?? '';
  const inis = iniciales(nombre);

  const subirFoto = async (file: File) => {
    setSubiendo(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('foto', file);
      const resultado = await guardarAvatarLocal(formData);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setFotoUrl(resultado.url);
      router.refresh();
    } finally {
      setSubiendo(false);
    }
  };

  const filas = [
    { label: 'Nombre', valor: nombre || 'Sin nombre', mono: false },
    { label: 'Usuario', valor: usuario || '—', mono: true },
    { label: 'Carrera', valor: INSTITUTO.carrera, mono: false },
    { label: 'Instituto', valor: `${perfil?.instituto ?? INSTITUTO.nombre} · ${SEDE_Y_TURNO}`, mono: false },
  ];

  return (
    <>
      {/* Avatar 104px */}
      <div className="relative mx-auto mt-[26px] w-[104px]">
        {fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={fotoUrl}
            alt="Tu foto de perfil"
            className="h-[104px] w-[104px] rounded-full object-cover [box-shadow:0_0_0_3px_var(--bg),0_0_0_5px_#34d399]"
          />
        ) : (
          <div className="grid h-[104px] w-[104px] place-items-center rounded-full bg-[#fbbf24] text-[34px] font-extrabold text-[#221a00]">
            {inis || <User size={40} strokeWidth={1.8} aria-hidden />}
          </div>
        )}
        {fotoUrl && (
          <span className="absolute -right-[2px] -bottom-[2px] grid h-[30px] w-[30px] place-items-center rounded-full border-[3px] border-bg bg-[#34d399] text-bg">
            <Check size={13} strokeWidth={3} aria-hidden />
          </span>
        )}
      </div>

      {/* Captura de foto: lo único editable de esta pantalla */}
      <div className="mt-4 flex justify-center">
        <input
          ref={inputFoto}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void subirFoto(file);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => inputFoto.current?.click()}
          disabled={subiendo}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-bor2 bg-sup px-4 text-[13.5px] font-bold text-tx disabled:opacity-60"
        >
          <Camera size={16} strokeWidth={2} aria-hidden />
          {subiendo ? 'Subiendo…' : fotoUrl ? 'Sacar otra foto' : 'Sacate una foto'}
        </button>
      </div>

      {error && <div className="mt-[10px] text-center text-[13px] text-vencido">{error}</div>}

      <dl className="mt-[22px] flex flex-col gap-[10px]">
        {filas.map((f) => (
          <div
            key={f.label}
            className="flex min-h-[50px] items-center gap-3 rounded-xl border border-bor bg-sup px-[14px] py-2"
          >
            <dt className="kicker w-[76px] shrink-0">{f.label}</dt>
            <dd
              className={`min-w-0 flex-1 text-right ${
                f.mono ? 'font-mono text-[12.5px] text-tx2' : 'text-[14px] font-semibold text-tx'
              }`}
            >
              {f.valor}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-center font-mono text-[11px] leading-[1.5] text-tx4">
        datos sincronizados del aula virtual — no se editan acá
      </p>

      <button
        type="button"
        onClick={() => router.push('/')}
        className="mt-5 min-h-12 w-full cursor-pointer rounded-xl bg-acc-bg text-[15px] font-bold text-acc-fg"
      >
        Listo
      </button>
      <CerrarSesion />
    </>
  );
}
