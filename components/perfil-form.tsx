'use client';

import { Camera, Check, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { guardarAvatarLocal, guardarPerfil } from '@/app/actions';
import { iniciales } from '@/lib/cursada';
import { INSTITUTO } from '@/lib/instituto';
import { createClient } from '@/lib/supabase/client';
import type { Perfil } from '@/lib/types';

type Props = {
  perfil: Perfil | null;
  configurado: boolean;
};

/**
 * Formulario de perfil: avatar 104px (foto con anillo verde + badge check, o
 * iniciales sobre ámbar, o ícono de persona), captura de foto con
 * <input type="file" capture="user"> que sube al bucket "avatares" de Storage
 * (o al disco vía Server Action si no hay Supabase), y campos nombre +
 * instituto. "Empezar" guarda y manda a Hoy.
 */
export function PerfilForm({ perfil, configurado }: Props) {
  const router = useRouter();
  const inputFoto = useRef<HTMLInputElement>(null);

  const [nombre, setNombre] = useState(perfil?.nombre ?? '');
  /**
   * El instituto no se edita: lo trae el aula virtual (`sitename` del site
   * info) al entrar y al verificar el token. Se manda tal cual para no pisarlo.
   */
  const instituto = perfil?.instituto ?? '';
  const [fotoUrl, setFotoUrl] = useState(perfil?.avatarUrl ?? null);
  /** URL nueva subida en esta sesión (undefined = no tocar la guardada). */
  const [fotoNueva, setFotoNueva] = useState<string | undefined>(undefined);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const inis = iniciales(nombre);

  const subirFoto = async (file: File) => {
    setSubiendo(true);
    setError('');
    try {
      // Sin Supabase Storage la foto va al disco (datos/avatar.<ext>) vía Server
      // Action y se sirve por /api/avatar.
      if (!configurado) {
        const formData = new FormData();
        formData.append('foto', file);
        const resultado = await guardarAvatarLocal(formData);
        if (!resultado.ok) {
          setError(resultado.error);
          return;
        }
        setFotoUrl(resultado.url);
        setFotoNueva(resultado.url);
        return;
      }
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError('No pudimos verificar tu sesión. Entrá de nuevo.');
        return;
      }
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const ruta = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: errorSubida } = await supabase.storage
        .from('avatares')
        .upload(ruta, file, { upsert: true, contentType: file.type || 'image/jpeg' });
      if (errorSubida) {
        setError('No se pudo subir la foto. Probá de nuevo.');
        return;
      }
      const { data } = supabase.storage.from('avatares').getPublicUrl(ruta);
      setFotoUrl(data.publicUrl);
      setFotoNueva(data.publicUrl);
    } finally {
      setSubiendo(false);
    }
  };

  const empezar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setError('Poné tu nombre así te saludamos.');
      return;
    }
    setGuardando(true);
    setError('');
    const resultado = await guardarPerfil({
      nombre: nombre.trim(),
      instituto: instituto.trim(),
      avatarUrl: fotoNueva,
    });
    if (!resultado.ok) {
      setGuardando(false);
      setError(resultado.error);
      return;
    }
    router.push('/');
    router.refresh();
  };

  return (
    <form onSubmit={empezar}>
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

      {/* Captura de foto */}
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
          {subiendo ? 'Subiendo…' : fotoUrl ? 'Sacate otra foto' : 'Sacate una foto'}
        </button>
      </div>

      <div className="mt-[22px] flex flex-col gap-[10px]">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Tu nombre"
          autoComplete="name"
          className="min-h-12 w-full rounded-xl border border-bor bg-sup px-[14px] text-[15px] text-tx"
        />
      </div>

      {/* El instituto lo trae el aula virtual; carrera y sede son fijas. Nada
          de esto se edita a mano: se muestra como dato. */}
      <div className="mt-3 rounded-xl border border-bor px-[14px] py-3">
        <div className="kicker">Tu cursada</div>
        <div className="mt-[6px] text-[13.5px] font-semibold text-tx">
          {instituto || INSTITUTO.nombre}
        </div>
        <div className="mt-px text-[12.5px] text-tx3">{INSTITUTO.carrera}</div>
        <div className="mt-px text-[12.5px] text-tx3">
          Sede {INSTITUTO.sede} · {INSTITUTO.turno}
        </div>
        <div className="mt-2 font-mono text-[11px] text-tx4">
          {instituto ? 'el instituto lo trae el aula virtual' : 'se completa al entrar'}
        </div>
      </div>

      {error && <div className="mt-[10px] text-center text-[13px] text-vencido">{error}</div>}

      <button
        type="submit"
        disabled={guardando}
        className="mt-4 min-h-12 w-full cursor-pointer rounded-xl bg-acc-bg text-[15px] font-bold text-acc-fg disabled:opacity-60"
      >
        {guardando ? 'Guardando…' : 'Empezar'}
      </button>
      <button
        type="button"
        onClick={() => router.back()}
        className="mt-2 min-h-11 w-full cursor-pointer text-[13px] font-semibold text-tx3"
      >
        Volver
      </button>
    </form>
  );
}
