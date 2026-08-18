'use client';

// Pantalla de entrada (handoff v3 §0): dos cards — identidad y formulario — y la
// secuencia animada que las releva mientras la app entra de verdad.
//
// A diferencia del prototipo, acá las fases NO son timers: `cargando` dura lo que
// tarda iniciarSesion() contra Moodle y `datos` lo que tarda montarCursada()
// bajando el snapshot. Los únicos tiempos fijos son los del feedback visual
// (check, colapso, salida), que no esperan a nadie.
//
// La contraseña vive solo en el state de este componente mientras lo llenás: se
// manda a la server action, que la usa para pedir el token y la descarta.

import { AlertTriangle, Check, X } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { type ResultadoLogin, iniciarSesion, montarCursada } from '@/app/actions-sesion';
import { INSTITUTO, SEDE_Y_TURNO } from '@/lib/instituto';

type Fase = 'form' | 'cargando' | 'check' | 'saliendo' | 'datos' | 'abriendo' | 'error';

/** Fases en las que la card A ya se quedó sola y centrada. */
const COLAPSADO: Fase[] = ['saliendo', 'datos', 'abriendo'];

/** Alto del cuerpo de la card A en cada fase (handoff: 118 → 274 → 128). */
function altoCuerpo(fase: Fase): number {
  if (fase === 'abriendo') return 128;
  if (fase === 'datos' || fase === 'saliendo') return 274;
  return 118;
}

/** ¿El error apunta a lo que se tipeó, o es un problema de conexión? */
const esDeCredenciales = (mensaje: string) =>
  /incorrect|poné tu usuario|bloqueado|otra cuenta/i.test(mensaje);

export function LoginEntrada() {
  const router = useRouter();
  const [fase, setFase] = useState<Fase>('form');
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [camposMal, setCamposMal] = useState(false);
  const [nombre, setNombre] = useState('');
  const [materias, setMaterias] = useState<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pendientes = timers.current;
    return () => pendientes.forEach(clearTimeout);
  }, []);

  const espera = (ms: number) =>
    new Promise<void>((resolve) => {
      timers.current.push(setTimeout(resolve, ms));
    });

  const fallar = (mensaje: string) => {
    setError(mensaje);
    setCamposMal(esDeCredenciales(mensaje));
    setFase('error');
  };

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fase === 'error') {
      // "Reintentar": limpia la contraseña y vuelve al formulario.
      setPassword('');
      setError('');
      setCamposMal(false);
      setFase('form');
      return;
    }
    if (fase !== 'form') return;
    if (!usuario.trim() || !password) {
      fallar('Poné tu usuario y tu contraseña.');
      return;
    }

    setFase('cargando');
    setError('');
    let r: ResultadoLogin;
    try {
      r = await iniciarSesion(usuario.trim(), password);
    } catch {
      r = { ok: false, error: 'Algo falló. Probá de nuevo.' };
    }
    if (!r.ok) {
      fallar(r.error);
      return;
    }

    setPassword(''); // la contraseña no sobrevive al login
    setNombre(r.nombre);

    // El montaje arranca YA, en paralelo con el check y el colapso: para cuando
    // se ve el bloque de datos, el snapshot suele estar a mitad de camino.
    const montaje = montarCursada().catch(() => null);

    setFase('check');
    await espera(700);
    setFase('saliendo');
    await espera(650);

    setFase('datos');
    // Lo que tarde bajar los datos, pero nunca menos de lo que dura el stagger
    // de las tres filas: si no, el bloque parpadea.
    const [resultado] = await Promise.all([montaje, espera(1400)]);
    if (resultado?.ok) setMaterias(resultado.materias);

    setFase('abriendo');
    await espera(600);
    router.replace('/');
    router.refresh();
  };

  const colapsado = COLAPSADO.includes(fase);
  const verFormulario = !colapsado;
  const bordeCampo = camposMal && fase === 'error' ? '#fb7185' : 'var(--bor)';

  return (
    <div
      // items-stretch y NADA de min-height acá: las dos cards tienen que medir
      // lo mismo, y el alto de la escena lo pone el <main> de /login. Con el
      // min-height en esta fila, las cards se estiraban a todo el viewport.
      className={`mx-auto flex w-full flex-col items-stretch justify-center max-[640px]:max-w-[440px] min-[641px]:max-w-[840px] min-[641px]:flex-row ${
        colapsado ? 'gap-0' : 'gap-[14px]'
      } transicion-card`}
    >
      {/* --- Card A: identidad. Nunca se desmonta; su cuerpo releva tres capas. --- */}
      <div
        className={`card-in transicion-card mx-auto flex w-full basis-0 flex-col rounded-[20px] border border-bor bg-sup px-[30px] ${
          colapsado ? 'justify-center py-[22px]' : 'py-[34px]'
        }`}
        style={{ flexGrow: 1.05, maxWidth: colapsado ? 620 : undefined }}
      >
        <span className="inline-flex items-center self-start rounded-[14px] bg-white px-5 py-4">
          <Image
            src={INSTITUTO.logo}
            alt={INSTITUTO.logoAlt}
            width={INSTITUTO.logoAncho}
            height={INSTITUTO.logoAlto}
            priority
            className="h-[44px] w-auto"
          />
        </span>

        <div
          // mt-auto: el bloque de identidad se apoya abajo de la card, así la
          // card A puede medir lo mismo que la del formulario sin quedar hueca.
          className={`transicion-alto relative ${colapsado ? 'pt-4' : 'mt-auto pt-6'}`}
          style={{ minHeight: altoCuerpo(fase) }}
        >
          {/* Capa 1 — identidad */}
          <div
            className="capa-entrada absolute inset-x-0 top-0"
            style={
              fase === 'form' || fase === 'cargando' || fase === 'check' || fase === 'error'
                ? { opacity: 1, transform: 'none', filter: 'none' }
                : {
                    opacity: 0,
                    transform: 'translateY(-10px)',
                    filter: 'blur(4px)',
                    pointerEvents: 'none',
                  }
            }
          >
            <div className="kicker">{INSTITUTO.nombre}</div>
            <div className="mt-2 text-[19px] leading-[1.25] font-extrabold tracking-[-0.01em]">
              Tu cursada, ordenada.
            </div>
            <p className="mt-[6px] text-[13.5px] leading-[1.5] text-tx2">
              Entrá y traemos tu carrera, horarios y materias.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <span aria-hidden className="h-[6px] w-[6px] rounded-full bg-sync-ok" />
              <span className="font-mono text-[11px] text-tx3">
                Sincroniza con el aula virtual
              </span>
            </div>
          </div>

          {/* Capa 2 — trayendo los datos */}
          <div
            aria-live="polite"
            className="capa-entrada absolute inset-x-0 top-0"
            style={
              fase === 'datos'
                ? { opacity: 1, transform: 'none', filter: 'none' }
                : {
                    opacity: 0,
                    transform: fase === 'abriendo' ? 'translateY(-8px)' : 'translateY(10px)',
                    filter: 'blur(4px)',
                    pointerEvents: 'none',
                  }
            }
          >
            <div className="flex items-center gap-2">
              {/* El dot es un acento, no un fondo de botón: va en --acc (que en
                  claro se oscurece), como el prototipo. */}
              <span aria-hidden className="dot-pulso h-[6px] w-[6px] rounded-full bg-acc" />
              <span className="kicker">Trayendo tus datos del aula virtual</span>
            </div>
            <div className="mt-2 text-[26px] leading-[1.2] font-extrabold tracking-[-0.02em]">
              {nombre}
            </div>
            <div className="mt-[7px] font-mono text-[13px] text-tx2">{SEDE_Y_TURNO}</div>
            {/* Tres chips sobre --bg, no filas subrayadas: el label va a la
                izquierda con ancho fijo de 74px y el valor pegado a él. */}
            <dl className="mt-5 flex flex-col gap-2">
              {[
                { k: 'Carrera', v: INSTITUTO.carrera, tipo: 'fuerte' as const },
                {
                  k: 'Materias',
                  v: materias === null ? 'buscando…' : `${materias} activas`,
                  tipo: 'mono' as const,
                },
                {
                  k: 'Estado',
                  v: materias === null ? 'Sincronizando…' : 'Sincronizado',
                  tipo: materias === null ? ('mono' as const) : ('verde' as const),
                },
              ].map((fila, i) => (
                <div
                  key={fila.k}
                  className="fila-in flex items-center gap-3 rounded-xl border border-bor bg-bg px-[14px] py-[11px]"
                  style={{ animationDelay: `${0.2 + i * 0.2}s` }}
                >
                  <dt className="w-[74px] shrink-0 font-mono text-[10px] font-semibold tracking-[0.12em] text-tx3 uppercase">
                    {fila.k}
                  </dt>
                  <dd
                    className={
                      fila.tipo === 'fuerte'
                        ? 'text-[14px] font-bold'
                        : fila.tipo === 'verde'
                          ? 'inline-flex items-center gap-[7px] font-mono text-[13px] text-sync-ok'
                          : 'font-mono text-[13px] text-tx2'
                    }
                  >
                    {fila.tipo === 'verde' && (
                      <span aria-hidden className="h-[6px] w-[6px] rounded-full bg-sync-ok" />
                    )}
                    {fila.v}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Capa 3 — abriendo */}
          <div
            className="capa-entrada absolute inset-x-0 top-0 grid place-items-center"
            style={
              fase === 'abriendo'
                ? { opacity: 1, transform: 'none' }
                : { opacity: 0, transform: 'translateY(10px)', pointerEvents: 'none' }
            }
          >
            <span
              aria-hidden
              className="girando h-[26px] w-[26px] rounded-full border-[3px] border-bor border-t-acc-bg"
            />
            <span className="kicker mt-3">Abriendo tu cursada</span>
          </div>
        </div>
      </div>

      {/* --- Card B: formulario. Colapsa animando flex-grow, no flex-basis. --- */}
      <div
        className={`card-in transicion-card w-full basis-0 overflow-hidden rounded-[20px] border-bor bg-sup ${
          verFormulario ? 'border px-[26px] py-[30px]' : 'border-0 px-0 py-[30px]'
        }`}
        aria-hidden={!verFormulario}
        style={{
          flexGrow: verFormulario ? 1 : 0,
          opacity: verFormulario ? 1 : 0,
          transform: verFormulario ? 'none' : 'scale(.96)',
        }}
      >
        {/* Piso de ancho para el contenido: al colapsar, la card se va a ancho
            ~0 pero sigue contando para el ALTO de la fila. Sin este piso el
            formulario se reacomoda en una columna larguísima y la card A, que
            está en items-stretch, se estira hasta el alto del viewport. Con el
            piso el contenido no se reacomoda: se recorta (overflow-hidden) y la
            card A no cambia de tamaño, que es lo que pide el handoff. */}
        <div className="min-w-[300px]">
          <div className="min-[641px]:hidden">
            <span className="inline-flex items-center rounded-xl bg-white px-3 py-2">
              <Image
                src={INSTITUTO.logo}
                alt={INSTITUTO.logoAlt}
                width={INSTITUTO.logoAncho}
                height={INSTITUTO.logoAlto}
                className="h-[34px] w-auto"
              />
            </span>
          </div>

        <div className="mt-4 min-[641px]:mt-0">
          <div className="kicker">Mi cursada</div>
          <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.015em]">Entrá a tu cursada</h1>
        </div>

        <form onSubmit={entrar} className="mt-[22px] flex flex-col gap-[14px]">
          <div>
            <label className="kicker mb-[7px] block" htmlFor="usuario">
              Usuario
            </label>
            <div className="relative">
              <input
                id="usuario"
                type="text"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                autoComplete="username"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                disabled={fase !== 'form' && fase !== 'error'}
                className="min-h-12 w-full rounded-xl border bg-bg pr-10 pl-[14px] text-[15px] text-tx transition-colors duration-[250ms]"
                style={{ borderColor: bordeCampo }}
              />
              {camposMal && fase === 'error' && <EquisError />}
            </div>
          </div>

          <div>
            <label className="kicker mb-[7px] block" htmlFor="password">
              Contraseña
            </label>
            <div className="relative">
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={fase !== 'form' && fase !== 'error'}
                className="min-h-12 w-full rounded-xl border bg-bg pr-10 pl-[14px] text-[15px] text-tx transition-colors duration-[250ms]"
                style={{ borderColor: bordeCampo }}
              />
              {camposMal && fase === 'error' && <EquisError />}
            </div>
          </div>

          {fase === 'error' && error && (
            <div
              role="alert"
              className="fila-in flex items-start gap-[10px] rounded-xl border p-3"
              style={{
                background: 'rgba(251,113,133,.1)',
                borderColor: 'rgba(251,113,133,.35)',
              }}
            >
              <AlertTriangle size={16} strokeWidth={2} aria-hidden className="mt-px text-vencido" />
              <span className="text-[13px] leading-[1.45] text-vencido">{error}</span>
            </div>
          )}

          <button
            type="submit"
            className="grid min-h-12 cursor-pointer place-items-center rounded-xl text-[15px] font-bold transition-colors duration-[250ms]"
            style={{
              background: fase === 'error' ? '#fb7185' : fase === 'check' ? '#34d399' : '#fbbf24',
              color: fase === 'error' ? '#20060b' : '#221a00',
            }}
          >
            {fase === 'cargando' && (
              <span
                aria-hidden
                className="girando h-5 w-5 rounded-full border-[3px] border-[rgba(34,26,0,.25)] border-t-[#221a00]"
              />
            )}
            {fase === 'check' && (
              <Check size={22} strokeWidth={3} aria-hidden className="pop-check" />
            )}
            {fase !== 'cargando' && fase !== 'check' && (
              <span>{fase === 'error' ? 'Reintentar' : 'Entrar'}</span>
            )}
          </button>

          <p className="text-center font-mono text-[11px] leading-[1.5] text-tx4">
            entrá con el usuario y la contraseña del aula virtual — tu contraseña no se guarda
          </p>
          </form>
        </div>
      </div>
    </div>
  );
}

/** X roja adentro del input, del lado derecho. */
function EquisError() {
  return (
    <span
      aria-hidden
      className="pop-check absolute top-1/2 right-3 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full"
      style={{ background: '#fb7185', color: '#20060b' }}
    >
      <X size={13} strokeWidth={3} />
    </span>
  );
}
