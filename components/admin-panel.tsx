'use client';

// Panel de administración (specs/panel-admin). Todo el dataset llega armado
// del servidor (lib/admin-metricas o el seed demo); acá solo viven filtro,
// búsqueda y selección — estado de UI puro, sin fetches.

import Image from 'next/image';
import { useState } from 'react';
import { COLOR_ESTADO, type EstadoUsuario, type UsuarioPanel } from '@/lib/admin-calculos';
import type { PanelAdmin } from '@/lib/admin-metricas';
import { iniciales } from '@/lib/cursada';

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

export function AdminPanel({ panel, actualizado, demo }: Props) {
  const [filtro, setFiltro] = useState<'todos' | EstadoUsuario>('todos');
  const [busca, setBusca] = useState('');
  const [selId, setSelId] = useState<string | null>(panel.usuarios[0]?.id ?? null);

  const q = busca.trim().toLowerCase();
  const lista = panel.usuarios.filter(
    (u) =>
      (filtro === 'todos' || u.estado === filtro) &&
      (!q || `${u.nombre} ${u.usuario} ${u.carrera}`.toLowerCase().includes(q))
  );
  const det = panel.usuarios.find((u) => u.id === selId) ?? null;

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
          <span className="ml-auto inline-flex items-center gap-2 font-mono text-[11px] text-tx3">
            <span className="dot-pulso h-[7px] w-[7px] rounded-full bg-[#34d399]" aria-hidden />
            actualizado {actualizado}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-7 pb-20 pt-[26px]">
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

          {det ? <DetalleUsuario det={det} onCerrar={() => setSelId(null)} /> : null}
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
    <aside className="aside-entra sticky top-[86px] rounded-2xl border border-bor bg-sup p-5">
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
