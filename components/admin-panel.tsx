'use client';

// Panel de administración (specs/panel-admin).
//
// El primer dataset llega armado del servidor; a partir de ahí el panel se
// refresca solo contra /api/admin/metricas cada 30 s (polling, no Realtime:
// para un panel de monitoreo con esta cantidad de gente, una suscripción es
// más maquinaria de la que hace falta). Filtro, búsqueda y selección son
// estado de UI que sobrevive a cada refresco.
//
// El panel NUNCA muestra el contenido de las notas de nadie: el dataset que
// llega trae counts, tipos, fechas y nombres de materia y nada más. Es una
// regla estructural del spec (§2, "Privacidad"), no una omisión.

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { COLOR_ESTADO, type EstadoUsuario, type UsuarioPanel } from '@/lib/admin-calculos';
import type { PanelAdmin } from '@/lib/admin-metricas';
import { Rueda } from '@/components/cargando';
import { iniciales } from '@/lib/cursada';

/** Cada cuánto repregunta el panel cuando está "en vivo". */
const INTERVALO_MS = 30_000;

const FILTROS: { clave: 'todos' | EstadoUsuario; nombre: string }[] = [
  { clave: 'todos', nombre: 'Todos' },
  { clave: 'online', nombre: 'Online' },
  { clave: 'inactivo', nombre: 'Inactivos' },
  { clave: 'offline', nombre: 'Offline' },
];

type Props = {
  panel: PanelAdmin;
  /** Hora del render (HH:mm, Buenos Aires) para el "actualizado". */
  actualizado: string;
  demo: boolean;
};

export function AdminPanel({ panel: inicial, actualizado: actualizadoInicial, demo }: Props) {
  const [panel, setPanel] = useState(inicial);
  const [actualizado, setActualizado] = useState(actualizadoInicial);
  const [vivo, setVivo] = useState(true);
  const [falla, setFalla] = useState(false);

  const [filtro, setFiltro] = useState<'todos' | EstadoUsuario>('todos');
  const [busca, setBusca] = useState('');
  const [selId, setSelId] = useState<string | null>(inicial.usuarios[0]?.id ?? null);

  // El fetch en vuelo, para poder cancelarlo al desmontar o al apagar el vivo.
  const enVuelo = useRef<AbortController | null>(null);
  const [refrescando, setRefrescando] = useState(false);

  // Quiénes ya estaban: lo que no esté acá en el próximo refresco es un alta.
  // Va en un ref y no en estado porque cambiarlo no tiene que re-renderizar
  // (y `traer` depende de él sin querer rearmarse en cada tanda).
  const conocidos = useRef<Set<string>>(new Set(inicial.usuarios.map((u) => u.id)));
  const [recienLlegados, setRecienLlegados] = useState<string[]>([]);

  const traer = useCallback(async () => {
    enVuelo.current?.abort();
    const ctrl = new AbortController();
    enVuelo.current = ctrl;
    try {
      const res = await fetch('/api/admin/metricas', { signal: ctrl.signal, cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const datos = (await res.json()) as PanelAdmin & { actualizado: string };

      const nuevos = datos.usuarios.filter((u) => !conocidos.current.has(u.id));
      for (const u of datos.usuarios) conocidos.current.add(u.id);
      if (nuevos.length > 0) setRecienLlegados((v) => [...v, ...nuevos.map((u) => u.nombre)]);

      setPanel({ generado: datos.generado, stats: datos.stats, usuarios: datos.usuarios });
      setActualizado(datos.actualizado);
      setFalla(false);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      // Un refresco fallido no rompe la vista: se queda con lo último bueno.
      setFalla(true);
    }
  }, []);

  // Refresco a pedido: sirve con el vivo pausado y para no esperar los 30 s.
  const refrescarAhora = useCallback(async () => {
    setRefrescando(true);
    await traer();
    setRefrescando(false);
  }, [traer]);

  useEffect(() => {
    if (!vivo) {
      enVuelo.current?.abort();
      return;
    }
    // Con la pestaña de fondo no tiene sentido gastar requests; al volver,
    // refresca de una para no mostrar una foto vieja.
    const tick = () => {
      if (!document.hidden) void traer();
    };
    const id = setInterval(tick, INTERVALO_MS);
    const alVolver = () => {
      if (!document.hidden) void traer();
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', alVolver);
      enVuelo.current?.abort();
    };
  }, [vivo, traer]);

  const q = busca.trim().toLowerCase();
  const lista = panel.usuarios.filter(
    (u) =>
      (filtro === 'todos' || u.estado === filtro) &&
      (!q || `${u.nombre} ${u.usuario} ${u.carrera}`.toLowerCase().includes(q))
  );
  // Si la persona abierta ya no está en el dataset, el aside se cierra solo.
  const det = panel.usuarios.find((u) => u.id === selId) ?? null;

  const colorDot = !vivo ? '#64748b' : falla ? '#fbbf24' : '#34d399';

  return (
    <div className="min-h-dvh bg-bg text-tx">
      <header className="sticky top-0 z-20 border-b border-bor bg-[color-mix(in_srgb,var(--bg)_90%,transparent)] backdrop-blur-[12px]">
        <div className="mx-auto flex max-w-[1280px] items-center gap-3.5 px-7 py-4">
          <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-[10px] bg-acc-bg">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#221a00" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3l9 5-9 5-9-5z" />
              <path d="M6 10.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5" />
            </svg>
          </span>
          <span className="block">
            <span className="block text-[15px] font-extrabold tracking-[-0.01em]">Mi Cursada · Admin</span>
            <span className="kicker block text-[10px] text-tx3">Panel de monitoreo</span>
          </span>
          {demo ? (
            <span className="kicker rounded-full border border-bor2 px-2.5 py-1 text-[9.5px] text-tx3">
              demo · datos sintéticos
            </span>
          ) : null}
          <span className="ml-auto inline-flex items-center gap-3">
            <button
              type="button"
              onClick={() => void refrescarAhora()}
              disabled={refrescando}
              aria-label="Actualizar ahora"
              className="tactil inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border border-bor2 px-3 text-[9.5px] text-tx2 disabled:cursor-default disabled:text-tx4"
            >
              {refrescando ? (
                <Rueda />
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 12a9 9 0 1 1-3-6.7" />
                  <path d="M21 3v6h-6" />
                </svg>
              )}
              <span className="kicker">Actualizar</span>
            </button>
            <button
              type="button"
              onClick={() => setVivo((v) => !v)}
              aria-pressed={vivo}
              className={`kicker min-h-8 cursor-pointer rounded-full border px-3 text-[9.5px] ${
                vivo ? 'border-bor2 text-tx2' : 'border-bor text-tx4'
              }`}
            >
              {vivo ? 'En vivo' : 'Pausado'}
            </button>
            <span className="inline-flex items-center gap-2 font-mono text-[11px] text-tx3">
              <span
                className={`h-[7px] w-[7px] rounded-full ${vivo && !falla ? 'dot-pulso' : ''}`}
                style={{ background: colorDot }}
                aria-hidden
              />
              {falla ? 'sin conexión ·' : ''} actualizado {actualizado}
            </span>
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-7 pb-20 pt-[26px]">
        {/* Alta detectada entre dos refrescos. No se descarta sola: la gracia
            es enterarte aunque no estuvieras mirando la pantalla. */}
        {recienLlegados.length > 0 ? (
          <div
            role="status"
            className="mb-4 flex items-center gap-3 rounded-[14px] border border-acc-bg bg-[color-mix(in_srgb,var(--acc-bg)_12%,transparent)] px-[18px] py-3.5"
          >
            <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-acc-bg">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#221a00" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M19 8v6M22 11h-6" />
              </svg>
            </span>
            <span className="min-w-0 flex-1 text-[13.5px] text-tx">
              {recienLlegados.length === 1
                ? `Se sumó ${recienLlegados[0]}.`
                : `Se sumaron ${recienLlegados.length} personas: ${recienLlegados.join(', ')}.`}
            </span>
            <button
              type="button"
              onClick={() => setRecienLlegados([])}
              className="kicker tactil cursor-pointer rounded-[9px] border border-bor2 bg-transparent px-3 text-[9.5px] text-tx2"
            >
              Listo
            </button>
          </div>
        ) : null}

        {/* Stats */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
          {panel.stats.map((s) => (
            <div key={s.k} className="rounded-[14px] border border-bor bg-sup px-[18px] py-4">
              <div className="kicker text-[10px] text-tx3">{s.k}</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-mono text-[26px] font-semibold" style={{ color: s.col }}>
                  {s.v}
                </span>
                {s.delta ? (
                  <span className="font-mono text-[11px]" style={{ color: s.dCol }}>
                    {s.delta}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-1 items-start gap-5 min-[981px]:grid-cols-[minmax(0,1.6fr)_minmax(330px,1fr)]">
          <section>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2 className="m-0 text-[17px] font-extrabold tracking-[-0.01em]">Usuarios</h2>
              <span className="font-mono text-[11px] text-tx3">
                {lista.length} de {panel.usuarios.length}
              </span>
              <div className="ml-auto flex gap-0.5 rounded-[10px] border border-bor bg-sup p-[3px]">
                {FILTROS.map((f) => (
                  <button
                    key={f.clave}
                    type="button"
                    onClick={() => setFiltro(f.clave)}
                    className={`min-h-8 cursor-pointer rounded-[7px] border-none px-3 text-xs font-bold ${
                      filtro === f.clave ? 'bg-bor text-tx' : 'bg-transparent text-tx3'
                    }`}
                  >
                    {f.nombre}
                  </button>
                ))}
              </div>
            </div>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscá por nombre, usuario o carrera…"
              className="mb-3 min-h-[42px] w-full rounded-[11px] border border-bor bg-sup px-3.5 text-[13.5px] text-tx"
            />
            <div className="overflow-x-auto rounded-[14px] border border-bor bg-sup">
              <div className="min-w-[640px]">
                <div className="kicker grid grid-cols-[minmax(210px,1.5fr)_110px_1fr_92px_90px] gap-2.5 border-b border-bor px-4 py-2.5 text-[9.5px] tracking-[0.12em] text-tx4">
                  <span>Usuario</span>
                  <span>Estado</span>
                  <span>Última actividad</span>
                  <span>Sesión</span>
                  <span>Notas hoy</span>
                </div>
                {lista.map((u) => (
                  <FilaUsuario key={u.id} u={u} seleccionado={selId === u.id} onAbrir={() => setSelId(u.id)} />
                ))}
                {lista.length === 0 ? (
                  <div className="p-[26px] text-center text-[13px] text-tx3">
                    Ningún usuario con «{busca}».
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          {det ? <DetalleUsuario key={det.id} det={det} onCerrar={() => setSelId(null)} /> : null}
        </div>
      </main>
    </div>
  );
}

function AvatarUsuario({ u, tam }: { u: UsuarioPanel; tam: number }) {
  if (u.avatarUrl) {
    return (
      <Image
        src={u.avatarUrl}
        alt=""
        width={tam}
        height={tam}
        unoptimized={true} 
        className="flex-shrink-0 rounded-full object-cover"
        style={{ width: tam, height: tam }}
      />
    );
  }
  return (
    <span
      className="grid flex-shrink-0 place-items-center rounded-full font-extrabold text-[#221a00]"
      style={{ width: tam, height: tam, background: u.avBg, fontSize: tam >= 44 ? 16 : 12.5 }}
      aria-hidden
    >
      {iniciales(u.nombre)}
    </span>
  );
}

function FilaUsuario({ u, seleccionado, onAbrir }: { u: UsuarioPanel; seleccionado: boolean; onAbrir: () => void }) {
  const col = COLOR_ESTADO[u.estado];
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="grid min-h-[58px] w-full cursor-pointer grid-cols-[minmax(210px,1.5fr)_110px_1fr_92px_90px] items-center gap-2.5 border-b border-bor px-4 py-[9px] text-left text-tx hover:bg-[rgba(30,41,59,.45)]"
      style={seleccionado ? { background: 'rgba(251,191,36,.06)' } : undefined}
    >
      <span className="flex min-w-0 items-center gap-[11px]">
        <AvatarUsuario u={u} tam={34} />
        <span className="block min-w-0">
          <span className="block truncate text-[13.5px] font-bold">{u.nombre}</span>
          <span className="block truncate font-mono text-[10.5px] text-tx3">{u.carrera}</span>
        </span>
      </span>
      <span className="inline-flex items-center gap-[7px] font-mono text-[10.5px]" style={{ color: col }}>
        <span
          className={`h-[7px] w-[7px] rounded-full ${u.estado === 'online' ? 'dot-pulso' : ''}`}
          style={{ background: col }}
          aria-hidden
        />
        {u.estado}
      </span>
      <span className="truncate text-[12.5px] text-tx2">{u.actividad}</span>
      <span className="font-mono text-[11.5px] text-tx3">{u.sesion}</span>
      <span className="font-mono text-[11.5px]" style={{ color: u.notasHoy > 0 ? 'var(--acc)' : 'var(--tx4)' }}>
        {u.notasHoy > 0 ? u.notasHoy : '—'}
      </span>
    </button>
  );
}

function DetalleUsuario({ det, onCerrar }: { det: UsuarioPanel; onCerrar: () => void }) {
  const col = COLOR_ESTADO[det.estado];
  return (
    <aside className="aside-entra sticky top-[86px] overflow-y-auto rounded-2xl border border-bor bg-sup p-5">
      <div className="flex items-center gap-3">
        <AvatarUsuario u={det} tam={44} />
        <span className="block min-w-0">
          <span className="block text-base font-extrabold">{det.nombre}</span>
          <span className="block font-mono text-[10.5px] text-tx3">{det.usuario || '—'}</span>
        </span>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="ml-auto grid h-[38px] w-[38px] flex-shrink-0 cursor-pointer place-items-center rounded-[10px] border-none bg-transparent text-tx3"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M18 6L6 18" />
            <path d="M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="mt-3.5 flex flex-wrap gap-2">
        <span className="kicker rounded-full border px-2.5 py-1 text-[9.5px]" style={{ color: col, borderColor: col }}>
          {det.estado}
        </span>
        <span className="kicker rounded-full border border-bor2 px-2.5 py-1 text-[9.5px] text-tx2">{det.carrera}</span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {det.metricas.map((m) => (
          <div key={m.k} className="rounded-[11px] border border-bor bg-bg px-3 py-2.5">
            <div className="kicker text-[9px] text-tx4">{m.k}</div>
            <div className="mt-1 font-mono text-[17px] font-semibold" style={{ color: m.col }}>
              {m.v}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-[18px]">
        <div className="kicker mb-2 text-[10px] text-tx3">Materias con más notas</div>
        <div className="flex flex-col gap-[7px]">
          {det.materiasTop.map((p) => (
            <div key={p.k} className="flex items-center gap-2.5">
              <span className="w-[74px] flex-shrink-0 truncate text-xs font-semibold text-tx2">{p.k}</span>
              <span className="h-[5px] flex-1 overflow-hidden rounded-full bg-bor">
                <span className="block h-full rounded-full bg-acc-bg" style={{ width: `${p.pct}%` }} />
              </span>
              <span className="w-[38px] flex-shrink-0 text-right font-mono text-[10.5px] text-tx3">{p.pct}%</span>
            </div>
          ))}
          {det.materiasTop.length === 0 ? (
            <div className="text-[12.5px] text-tx3">Todavía sin notas.</div>
          ) : null}
        </div>
      </div>

      <div className="mt-[18px]">
        <div className="kicker mb-2 text-[10px] text-tx3">Actividad reciente</div>
        <div className="flex flex-col">
          {det.eventos.map((e, i) => (
            <div key={i} className="flex gap-2.5 border-b border-bor py-[7px]">
              <span className="mt-[5px] h-[7px] w-[7px] flex-shrink-0 rounded-full" style={{ background: e.col }} aria-hidden />
              <span className="min-w-0 flex-1 text-[12.5px] leading-[1.45] text-tx2">{e.txt}</span>
              <span className="whitespace-nowrap font-mono text-[10px] text-tx4">{e.hace}</span>
            </div>
          ))}
          {det.eventos.length === 0 ? (
            <div className="text-[12.5px] text-tx3">Sin actividad registrada.</div>
          ) : null}
        </div>
      </div>

      <div className="mt-3.5 flex items-center gap-2">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 12a9 9 0 1 1-3-6.7" />
          <path d="M21 3v6h-6" />
        </svg>
        <span className="font-mono text-[10.5px] text-tx3">Aula virtual: {det.sync}</span>
      </div>
    </aside>
  );
}
