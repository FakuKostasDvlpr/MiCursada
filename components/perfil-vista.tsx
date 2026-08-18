'use client';

// Perfil (handoff v3 §0b). La mayoría de los datos vienen del aula virtual y no
// se escriben a mano; lo editable es la foto (de la app, no de Moodle) y la
// carrera (de la persona, no del aula virtual — ver lib/instituto.ts).

import { Camera, Check, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { guardarAvatarLocal, guardarPerfil } from '@/app/actions';
import { borrarMiCuenta } from '@/app/actions-sesion';
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

  const [abiertoBorrar, setAbiertoBorrar] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrar, setErrorBorrar] = useState('');

  const [carrera, setCarrera] = useState(perfil?.carrera ?? INSTITUTO.carrera);
  const [errorCarrera, setErrorCarrera] = useState('');

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

  const guardarCarrera = async () => {
    const valor = carrera.trim();
    setErrorCarrera('');
    const resultado = await guardarPerfil({
      nombre,
      instituto: perfil?.instituto ?? INSTITUTO.nombre,
      carrera: valor,
    });
    if (!resultado.ok) {
      setErrorCarrera(resultado.error);
      return;
    }
    router.refresh();
  };

  const filas = [
    { label: 'Nombre', valor: nombre || 'Sin nombre', mono: false },
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

      <div className="mt-[22px]">
        <label htmlFor="carrera" className="kicker mb-[7px] block">
          Carrera
        </label>
        <input
          id="carrera"
          type="text"
          value={carrera}
          onChange={(e) => setCarrera(e.target.value)}
          onBlur={guardarCarrera}
          maxLength={80}
          className="min-h-12 w-full rounded-xl border border-bor bg-bg px-[14px] text-[15px] text-tx"
        />
        {errorCarrera && (
          <div className="mt-[6px] text-[13px] text-vencido">{errorCarrera}</div>
        )}
      </div>

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
