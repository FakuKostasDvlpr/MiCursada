'use client';

// Perfil (handoff v3 §0b). Todo el perfil es de solo lectura salvo el avatar:
// nombre y carrera vienen fijos (ver comentario junto a `filas` más abajo).
// Lo único editable es el avatar (de la app, no de Moodle): un predefinido o
// una foto propia, ambos vía guardarAvatarLocal.

import { Camera, Check, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { guardarAvatarLocal } from '@/app/actions';
import { borrarMiCuenta } from '@/app/actions-sesion';
import { AvatarPicker, crearAvatarPredefinido } from '@/components/kokonutui/avatar-picker';
import { CerrarSesion } from '@/components/cerrar-sesion';
import { Modal } from '@/components/modal';
import { iniciales } from '@/lib/cursada';
import { INSTITUTO, SEDE_Y_TURNO } from '@/lib/instituto';
import type { Perfil } from '@/lib/types';

type Props = {
  perfil: Perfil | null;
  /** `username` del aula virtual (sale de datos/moodle.json, no del perfil). */
  usuario: string;
  /** Solo con Supabase configurado hay cuenta real que borrar. */
  conCuenta: boolean;
};

export function PerfilVista({ perfil, usuario, conCuenta }: Props) {
  const router = useRouter();
  const inputFoto = useRef<HTMLInputElement>(null);

  const [fotoUrl, setFotoUrl] = useState(perfil?.avatarUrl ?? null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  // Color del predefinido elegido en esta sesión (null si subió una foto propia o todavía no tocó nada).
  const [colorActivo, setColorActivo] = useState<string | null>(null);

  const [abiertoBorrar, setAbiertoBorrar] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrar, setErrorBorrar] = useState('');

  const confirmarBorrado = async () => {
    setBorrando(true);
    setErrorBorrar('');
    const resultado = await borrarMiCuenta();
    if (!resultado.ok) {
      setErrorBorrar(resultado.error);
      setBorrando(false);
    }
  };

  const nombre = perfil?.nombre ?? '';
  const inis = iniciales(nombre);

  /** Sube un archivo (propio o generado a partir de un predefinido) por la misma action. */
  const subirArchivo = async (file: File): Promise<boolean> => {
    setSubiendo(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('foto', file);
      const resultado = await guardarAvatarLocal(formData);
      if (!resultado.ok) {
        setError(resultado.error);
        return false;
      }
      setFotoUrl(resultado.url);
      router.refresh();
      return true;
    } finally {
      setSubiendo(false);
    }
  };

  const subirFoto = async (file: File) => {
    setColorActivo(null);
    await subirArchivo(file);
  };

  const elegirPredefinido = async (color: string) => {
    setColorActivo(null);
    setError('');
    let blob: Blob;
    try {
      blob = await crearAvatarPredefinido(color);
    } catch {
      setError('No se pudo generar el avatar. Probá de nuevo.');
      return;
    }
    const file = new File([blob], `avatar-${color.slice(1)}.png`, { type: 'image/png' });
    const ok = await subirArchivo(file);
    if (ok) setColorActivo(color);
  };

  // Nombre y carrera son de solo lectura acá: el nombre lo trae el aula
  // virtual y la carrera quedó fija por decisión de producto (2026-08-18).
  const filas = [
    { label: 'Nombre', valor: nombre || 'Sin nombre', mono: false },
    { label: 'Carrera', valor: perfil?.carrera ?? INSTITUTO.carrera, mono: false },
    { label: 'Usuario', valor: usuario || '—', mono: true },
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

      {/* Avatar: única personalización de esta pantalla — un predefinido o una foto propia */}
      <div className="mt-4">
        <div className="kicker mb-[7px] text-center">Elegí tu avatar</div>
        <AvatarPicker
          colorActivo={colorActivo}
          deshabilitado={subiendo}
          onElegir={(color) => void elegirPredefinido(color)}
        />
      </div>

      <div className="mt-3 flex justify-center">
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
          {subiendo ? 'Subiendo…' : fotoUrl ? 'Subir otra foto' : 'Subí tu propia foto'}
        </button>
      </div>

      {error && <div className="mt-[10px] text-center text-[13px] text-vencido">{error}</div>}

      <dl className="mt-[14px] flex flex-col gap-[10px]">
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

      {conCuenta && (
        <>
          <button
            type="button"
            onClick={() => setAbiertoBorrar(true)}
            className="tactil mt-2 flex min-h-11 w-full cursor-pointer items-center justify-center text-[13px] font-bold"
            style={{ color: '#fb7185' }}
          >
            Borrar mi cuenta
          </button>

          <Modal
            abierto={abiertoBorrar}
            titulo="¿Borrar tu cuenta?"
            onCerrar={() => setAbiertoBorrar(false)}
          >
            <p className="text-[14px] leading-[1.5] text-tx2">
              Se borran tu token del aula virtual, tus notas, tus horarios y tus avisos. No hay
              vuelta atrás.
            </p>
            {errorBorrar && (
              <p className="mt-2 text-[13px] leading-[1.5] text-vencido">{errorBorrar}</p>
            )}
            <div className="mt-5 flex gap-[10px]">
              <button
                type="button"
                onClick={() => setAbiertoBorrar(false)}
                disabled={borrando}
                className="min-h-12 cursor-pointer rounded-xl border border-bor2 px-5 text-[14.5px] font-bold text-tx disabled:opacity-60"
              >
                Mejor no
              </button>
              <button
                type="button"
                onClick={confirmarBorrado}
                disabled={borrando}
                className="min-h-12 flex-1 cursor-pointer rounded-xl border text-[14.5px] font-bold disabled:opacity-60"
                style={{ borderColor: 'rgba(251,113,133,.45)', color: '#fb7185' }}
              >
                {borrando ? 'Borrando…' : 'Borrar todo'}
              </button>
            </div>
          </Modal>
        </>
      )}
    </>
  );
}
