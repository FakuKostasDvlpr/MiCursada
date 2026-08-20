'use client';

// UI del aula virtual (Moodle): indicador de estado del token en el header de
// Hoy + panel para sincronizar, conectar/reconectar y desconectar.
//
// REGLA: el token nunca llega acá (las server actions devuelven solo estado) y
// la contraseña vive únicamente en el state local de este formulario, que se
// desmonta al cerrar el modal.
//
// Moodle NO expone el vencimiento del token: por eso acá no hay countdown ni
// "te quedan X días". Solo se muestra lo verificable: si está activo, a nombre
// de quién, cuándo se verificó y hace cuánto se generó.

import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type EstadoToken,
  type ResultadoSync,
  type ResultadoToken,
  estadoToken,
  generarToken,
  olvidarToken,
  sincronizarAhora,
} from '@/app/actions-moodle';
import { Rueda } from '@/components/cargando';
import { Modal } from '@/components/modal';
import { hace } from '@/lib/cursada';

export type ClaveEstado = 'verificando' | 'activo' | 'vencido' | 'error' | 'sin';

const COLOR: Record<ClaveEstado, string> = {
  verificando: 'var(--acc)',
  activo: 'var(--sync-ok)',
  vencido: 'var(--vencido)',
  error: 'var(--vencido)',
  sin: 'var(--tx3)',
};

const TITULO: Record<ClaveEstado, string> = {
  verificando: 'Verificando el aula virtual…',
  activo: 'Aula virtual conectada',
  vencido: 'Tu token venció. Tocá para generar uno nuevo.',
  error: 'No pudimos verificar el aula virtual.',
  sin: 'Conectá tu aula virtual',
};

/** Fechas anteriores a 2000 son el placeholder del token por variable de entorno. */
function fechaUtil(iso: string | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && d.getUTCFullYear() > 2000;
}

/** Nombre real del titular del token, si el estado ya lo verificó. */
export function nombreAula(estado: EstadoToken | null): string | null {
  return estado?.configurado ? (estado.nombre ?? null) : null;
}

/** Líneas de detalle del estado: verificación, generación y última sincronización. */
export function detallesAula(
  estado: EstadoToken | null,
  ahora: Date,
  syncIso: string | null
): string[] {
  const out: string[] = [];
  if (estado?.configurado) {
    if (fechaUtil(estado.verificadoEn)) out.push(`Verificado ${hace(estado.verificadoEn, ahora)}`);
    // "guardado", no "generado": solo sabemos cuándo entró el token a la app.
    // Si lo generaste en el aula virtual y lo pegaste, la fecha real es anterior.
    if (fechaUtil(estado.guardadoEn)) out.push(`Token guardado ${hace(estado.guardadoEn, ahora)}`);
  }
  if (fechaUtil(syncIso ?? undefined)) {
    out.push(`Datos sincronizados ${hace(syncIso as string, ahora)}`);
  }
  return out;
}

/**
 * Pide el estado del token al montar (verificación real contra Moodle) sin
 * bloquear el render: arranca en "verificando" y se actualiza cuando vuelve.
 */
export function useAulaVirtual() {
  const [estado, setEstado] = useState<EstadoToken | null>(null);
  const [fallo, setFallo] = useState(false);

  const refrescar = useCallback(async () => {
    try {
      const e = await estadoToken();
      setEstado(e);
      setFallo(false);
    } catch {
      setFallo(true);
    }
  }, []);

  useEffect(() => {
    void refrescar();
  }, [refrescar]);

  const clave: ClaveEstado = fallo
    ? 'error'
    : estado === null
      ? 'verificando'
      : !estado.configurado
        ? 'sin'
        : estado.activo
          ? 'activo'
          : estado.error === 'vencido'
            ? 'vencido'
            : 'error';

  return { estado, clave, refrescar };
}

type IndicadorProps = {
  clave: ClaveEstado;
  nombre: string | null;
  detalles: string[];
  onAbrirPanel: () => void;
};

/**
 * Botón de 40px con dot de estado. Al tocarlo abre un popover (no `title`, que
 * en touch no existe) con la info real; desde ahí se entra al panel.
 */
export function IndicadorAula({ clave, nombre, detalles, onAbrirPanel }: IndicadorProps) {
  const [abierto, setAbierto] = useState(false);
  const cont = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: Event) => {
      if (cont.current && !cont.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  const resumen = clave === 'activo' && nombre ? `${TITULO.activo} · ${nombre}` : TITULO[clave];

  return (
    // `relative` solo de 641px para arriba. En móvil el wrapper queda `static`
    // a propósito, así el popover de abajo se ancla al <header> (que sí es
    // relative) en vez de a este botón de 40px: colgado del botón, con el
    // interruptor de tema y el avatar a su derecha, su borde derecho cae a unos
    // 130px del borde de la página, y 252px de ancho lo mandaban 40px afuera de
    // la pantalla por la izquierda.
    <div ref={cont} className="shrink-0 min-[641px]:relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-haspopup="dialog"
        aria-label={`Aula virtual: ${resumen}`}
        className="tactil relative grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl border border-bor bg-sup text-tx2"
      >
        <RefreshCw size={16} strokeWidth={2} aria-hidden />
        <span
          aria-hidden
          data-estado={clave}
          className={`absolute top-[5px] right-[5px] h-2 w-2 rounded-full ${
            clave === 'verificando' ? 'dot-pulso' : ''
          }`}
          style={{ background: COLOR[clave] }}
        />
      </button>

      {abierto && (
        <div
          role="dialog"
          aria-label="Estado del aula virtual"
          // El max-w es el cinturón de seguridad para pantallas muy angostas:
          // el ancho del contenido es el viewport menos los 18px de padding de
          // cada lado que pone el contenedor de página.
          className="absolute top-[48px] right-0 z-50 w-[252px] max-w-[calc(100vw-36px)] rounded-[14px] border border-bor bg-sup p-[14px] text-left"
        >
          <div className="flex items-start gap-2">
            <span
              aria-hidden
              className="mt-[6px] h-2 w-2 shrink-0 rounded-full"
              style={{ background: COLOR[clave] }}
            />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] leading-[1.35] font-bold">{resumen}</div>
              {detalles.length > 0 && (
                <ul className="mt-2 flex flex-col gap-[3px]">
                  {detalles.map((d) => (
                    <li key={d} className="font-mono text-[11px] leading-[1.4] text-tx3">
                      {d}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setAbierto(false);
              onAbrirPanel();
            }}
            className="mt-3 min-h-11 w-full cursor-pointer rounded-xl bg-acc-bg text-[13.5px] font-bold text-acc-fg"
          >
            Abrir aula virtual
          </button>
        </div>
      )}
    </div>
  );
}

type PanelProps = {
  abierto: boolean;
  onCerrar: () => void;
  clave: ClaveEstado;
  nombre: string | null;
  detalles: string[];
  onRefrescar: () => Promise<void>;
};

/** Panel completo: sheet en móvil, modal centrado en desktop. */
export function PanelAulaVirtual({
  abierto,
  onCerrar,
  clave,
  nombre,
  detalles,
  onRefrescar,
}: PanelProps) {
  return (
    <Modal abierto={abierto} titulo="Aula virtual" onCerrar={onCerrar}>
      <ContenidoPanel
        clave={clave}
        nombre={nombre}
        detalles={detalles}
        onRefrescar={onRefrescar}
      />
    </Modal>
  );
}

// 16px en móvil y 15 de 641px para arriba: Safari en iOS le hace zoom al
// viewport cuando enfocás un input de menos de 16px, y el sheet queda ampliado y
// corrido justo al ir a escribir la contraseña. Mismo criterio que el login.
const claseInput =
  'w-full min-h-[46px] rounded-xl border border-bor bg-bg px-[14px] text-[16px] text-tx min-[641px]:text-[15px]';
const claseLabel = 'kicker mb-[7px] block';

/**
 * Se monta recién cuando el panel se abre y se desmonta al cerrarlo: así la
 * contraseña tipeada nunca sobrevive al cierre del modal.
 */
function ContenidoPanel({
  clave,
  nombre,
  detalles,
  onRefrescar,
}: Omit<PanelProps, 'abierto' | 'onCerrar'>) {
  const [sincronizando, setSincronizando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoSync | null>(null);

  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [generando, setGenerando] = useState(false);
  const [errorLogin, setErrorLogin] = useState('');
  const [okLogin, setOkLogin] = useState('');

  const [armado, setArmado] = useState(false);
  const [desconectando, setDesconectando] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const sincronizar = async () => {
    setSincronizando(true);
    setResultado(null);
    let r: ResultadoSync;
    try {
      r = await sincronizarAhora();
    } catch {
      r = { ok: false, error: 'No se pudo sincronizar. Probá de nuevo.' };
    }
    setResultado(r);
    setSincronizando(false);
    await onRefrescar();
  };

  const conectar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorLogin('');
    setOkLogin('');
    if (!usuario.trim() || !password) {
      setErrorLogin('Poné tu usuario y tu contraseña.');
      return;
    }
    setGenerando(true);
    let r: ResultadoToken;
    try {
      r = await generarToken(usuario.trim(), password);
    } catch {
      r = { ok: false, error: 'Algo falló. Probá de nuevo.' };
    }
    setGenerando(false);
    if (!r.ok) {
      setErrorLogin(r.error);
      return;
    }
    setPassword(''); // la contraseña no queda viva después de un alta exitosa
    setOkLogin(`Listo, ${r.nombre}. Ya podés sincronizar.`);
    await onRefrescar();
  };

  const desconectar = async () => {
    if (!armado) {
      setArmado(true);
      timer.current = setTimeout(() => setArmado(false), 3500);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    setArmado(false);
    setDesconectando(true);
    try {
      await olvidarToken();
    } catch {
      // el estado que sigue va a mostrar si quedó conectado o no
    }
    setDesconectando(false);
    await onRefrescar();
  };

  const resumen = clave === 'activo' && nombre ? `${TITULO.activo} · ${nombre}` : TITULO[clave];

  return (
    <div className="flex flex-col gap-4">
      {/* a) Estado */}
      <div className="rounded-[14px] border border-bor bg-bg p-[14px]">
        <div className="flex items-start gap-[10px]">
          <span
            aria-hidden
            className={`mt-[6px] h-2 w-2 shrink-0 rounded-full ${
              clave === 'verificando' ? 'dot-pulso' : ''
            }`}
            style={{ background: COLOR[clave] }}
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm leading-[1.35] font-bold">{resumen}</div>
            {detalles.length > 0 && (
              <ul className="mt-[10px] flex flex-col gap-[3px]">
                {detalles.map((d) => (
                  <li key={d} className="font-mono text-[11px] leading-[1.4] text-tx3">
                    {d}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* b) Sincronizar ahora */}
      <div>
        <button
          type="button"
          onClick={sincronizar}
          disabled={sincronizando}
          className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-acc-bg text-[14.5px] font-bold text-acc-fg disabled:opacity-60"
        >
          {sincronizando && <Rueda sobreAmbar />}
          {sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}
        </button>
        {sincronizando && (
          <p className="mt-2 text-[12px] text-tx3">
            Esto tarda un rato: estamos bajando todo del aula virtual.
          </p>
        )}
        {resultado?.ok === true && (
          <p className="mt-2 font-mono text-[12px] text-sync-ok">
            {resultado.materias} materias · {resultado.archivos} archivos · {resultado.avisos}{' '}
            avisos
          </p>
        )}
        {resultado?.ok === false && <p className="mt-2 text-[13px] text-vencido">{resultado.error}</p>}
      </div>

      {/* c) Conectar / reconectar */}
      <form onSubmit={conectar} className="border-t border-bor pt-4">
        <div className="mb-3 text-sm font-extrabold">Conectá tu aula virtual</div>
        <div className="flex flex-col gap-3">
          <div>
            <label className={claseLabel} htmlFor="av-usuario">
              Usuario
            </label>
            <input
              id="av-usuario"
              type="text"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              autoComplete="username"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className={claseInput}
            />
          </div>
          <div>
            <label className={claseLabel} htmlFor="av-password">
              Contraseña
            </label>
            <input
              id="av-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className={claseInput}
            />
          </div>
          {errorLogin && <div className="text-[13px] text-vencido">{errorLogin}</div>}
          {okLogin && <div className="text-[13px] text-sync-ok">{okLogin}</div>}
          <button
            type="submit"
            disabled={generando}
            className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-bor2 text-[14.5px] font-bold text-tx disabled:opacity-60"
          >
            {generando && <Rueda />}
            {generando ? 'Generando…' : 'Generar token'}
          </button>
          <p className="text-[12px] leading-[1.45] text-tx3">
            Tu contraseña se usa solo para pedirle el token al aula virtual y no se guarda en
            ningún lado.
          </p>
        </div>
      </form>

      {/* d) Desconectar */}
      <button
        type="button"
        onClick={desconectar}
        disabled={desconectando}
        className="min-h-12 w-full cursor-pointer rounded-xl border text-[14px] font-bold disabled:opacity-60"
        style={
          armado
            ? { background: '#fb7185', borderColor: '#fb7185', color: '#20060b' }
            : { borderColor: 'rgba(251,113,133,.45)', color: '#fb7185' }
        }
      >
        {armado ? '¿Seguro? Tocá de nuevo para desconectar' : 'Desconectar'}
      </button>
    </div>
  );
}
