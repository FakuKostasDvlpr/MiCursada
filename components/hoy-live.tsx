'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  IndicadorAula,
  PanelAulaVirtual,
  detallesAula,
  nombreAula,
  useAulaVirtual,
} from '@/components/aula-virtual';
import { TileAsistencia } from '@/components/asistencia';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  clasesDeHoy,
  estadoAviso,
  fechaLargaHoy,
  hace,
  proximaClase,
  statsBento,
  textoEstado,
} from '@/lib/cursada';
import type { Aviso, Materia } from '@/lib/types';

/** 'YYYY-MM-DD' → 'dd/mm'. */
const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

type Props = {
  materias: Materia[];
  avisos: Aviso[];
  iniciales: string;
  avatarUrl?: string | null;
  /** Instante del render en el server, para hidratar sin desajuste. */
  inicialIso: string;
  /** ISO de la última sincronización con el aula virtual, o null si nunca corrió. */
  syncIso?: string | null;
};

/**
 * Sección viva de Hoy: header con fecha larga + bento (hero, tiles, clases de hoy,
 * próximos avisos). Un tick de 30s recalcula countdown y estados; los datos
 * llegan serializados del server.
 */
export function HoyLive({
  materias,
  avisos,
  iniciales,
  avatarUrl = null,
  inicialIso,
  syncIso = null,
}: Props) {
  const [ahora, setAhora] = useState(() => new Date(inicialIso));
  const [panel, setPanel] = useState(false);
  const { estado, clave, refrescar } = useAulaVirtual();

  useEffect(() => {
    setAhora(new Date());
    const id = setInterval(() => setAhora(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const prox = proximaClase(materias, ahora);
  const hoy = clasesDeHoy(materias, ahora);
  const stats = statsBento(materias, avisos, ahora);
  const proximos = avisos.filter((a) => !a.hecho).slice(0, 3);
  const materiaDe = (id: string | null) => materias.find((m) => m.id === id) ?? null;
  const detalles = detallesAula(estado, ahora, syncIso);

  return (
    <>
      <header className="flex items-start gap-[10px]">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {/* El logo es azul sobre transparente: en tema oscuro se perdería,
                así que va sobre un chip blanco (idéntico en ambos temas). */}
            <span className="flex shrink-0 items-center rounded-md bg-white px-[6px] py-[3px]">
              <Image
                src="/logo-ort.png"
                alt="Aula Virtual ORT"
                width={30}
                height={16}
                priority
                className="h-[16px] w-auto"
              />
            </span>
            <div className="kicker min-w-0 truncate tracking-[0.1em]">Analista de Sistemas</div>
          </div>
          <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.015em]">
            {fechaLargaHoy(ahora)}
          </h1>
        </div>
        <IndicadorAula
          clave={clave}
          nombre={nombreAula(estado)}
          detalles={detalles}
          onAbrirPanel={() => setPanel(true)}
        />
        {/* En desktop el tema y el perfil viven en la sidebar. */}
        <div className="flex items-start gap-[10px] min-[641px]:hidden">
          <ThemeToggle />
          <Link
            href="/perfil"
            aria-label="Tu perfil"
            className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-[#fbbf24] text-[13px] font-extrabold !text-[#221a00]"
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              iniciales || '·'
            )}
          </Link>
        </div>
      </header>

      {/* Bento: 2 columnas en móvil, 4 en desktop (hero 1/3, stats en 3 y 4,
          "Clases de hoy" 1/3 y "Próximos avisos" 3/5 lado a lado). */}
      <div className="mt-5 grid grid-cols-2 gap-[10px] min-[641px]:grid-cols-[repeat(4,minmax(0,1fr))]">
        {prox ? (
          <Link
            href={`/materias/${prox.materia.id}`}
            className="col-span-full flex gap-[14px] rounded-2xl border border-bor bg-sup p-4 !text-tx min-[641px]:col-[1/3]"
          >
            <span
              aria-hidden
              className="w-1 shrink-0 self-stretch rounded-full"
              style={{ background: prox.materia.color }}
            />
            <span className="block min-w-0 flex-1">
              <span className="kicker block tracking-[0.16em]">Próxima clase</span>
              <span className="mt-2 block text-[21px] leading-[1.2] font-extrabold tracking-[-0.01em]">
                {prox.materia.nombre}
              </span>
              <span className="mt-2 flex flex-wrap items-baseline gap-3">
                <span className="font-mono text-[17px] font-semibold">
                  {prox.horario.inicio}–{prox.horario.fin}
                </span>
                <span className="text-[13px] text-tx2">{prox.materia.aula}</span>
              </span>
              <span
                className="mt-[10px] block text-[13.5px] font-semibold"
                style={{ color: prox.materia.color }}
              >
                {textoEstado(prox, ahora)}
              </span>
            </span>
          </Link>
        ) : (
          <div className="col-span-full rounded-2xl border border-dashed border-bor px-5 py-[26px] text-center text-[13.5px] text-tx3">
            Tus materias llegan del aula virtual con la primera sincronización.
          </div>
        )}

        <Link
          href="/semana"
          className="flex min-h-[106px] flex-col gap-[6px] rounded-2xl border border-bor bg-sup p-[14px] !text-tx"
        >
          <span className="kicker tracking-[0.16em]">Clases hoy</span>
          <span className="mt-auto font-mono text-[32px] leading-none font-semibold">
            {stats.clasesHoy}
          </span>
          <span className="text-xs text-tx3">{stats.subClases}</span>
        </Link>

        <Link
          href="/avisos"
          className="flex min-h-[106px] flex-col gap-[6px] rounded-2xl border border-bor bg-sup p-[14px] !text-tx"
        >
          <span className="kicker tracking-[0.16em]">Pendientes</span>
          <span
            className={`mt-auto font-mono text-[32px] leading-none font-semibold ${
              stats.pendientes > 0 ? 'text-acc' : ''
            }`}
          >
            {stats.pendientes}
          </span>
          <span className="text-xs text-tx3">{stats.subPendientes}</span>
        </Link>

        {/* Recordatorio de asistencia: solo los días que cursás. */}
        <TileAsistencia materias={materias} ahora={ahora} />

        <div className="col-span-full rounded-2xl border border-bor bg-sup p-[14px] min-[641px]:col-[1/3]">
          <div className="kicker mb-[10px] tracking-[0.16em]">Clases de hoy</div>
          {hoy.length === 0 ? (
            <div className="rounded-xl border border-dashed border-bor p-4 text-center text-[13.5px] text-tx3">
              Hoy no cursás. Aprovechá para ponerte al día.
            </div>
          ) : (
            <div className="flex flex-col gap-[6px]">
              {hoy.map((c) => (
                <Link
                  key={c.horario.id}
                  href={`/materias/${c.materia.id}`}
                  className={`flex min-h-[50px] items-center gap-3 rounded-xl border border-bor bg-bg px-3 py-[10px] !text-tx ${
                    c.pasada ? 'opacity-40' : ''
                  }`}
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: c.materia.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {c.materia.nombre}
                  </span>
                  <span className="text-xs text-tx3">{c.materia.aula}</span>
                  <span
                    className={`font-mono text-[12.5px] whitespace-nowrap ${
                      c.enCurso ? 'text-acc' : 'text-tx2'
                    }`}
                  >
                    {c.horario.inicio}–{c.horario.fin}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="col-span-full rounded-2xl border border-bor bg-sup p-[14px] min-[641px]:col-[3/5]">
          <div className="mb-[6px] flex items-center justify-between">
            <div className="kicker tracking-[0.16em]">Próximos avisos</div>
            <Link
              href="/avisos"
              className="flex min-h-[44px] items-center px-1 text-[13px] font-bold text-acc"
            >
              Ver todos
            </Link>
          </div>
          {proximos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-bor p-4 text-center text-[13.5px] text-tx3">
              Nada pendiente. Tranquilo.
            </div>
          ) : (
            <div className="flex flex-col gap-[6px]">
              {proximos.map((a) => {
                const materia = materiaDe(a.materiaId);
                const estado = estadoAviso(a, ahora);
                return (
                  <Link
                    key={a.id}
                    href="/avisos"
                    className="flex min-h-[52px] items-center gap-3 rounded-xl border border-bor bg-bg px-3 py-2 !text-tx"
                  >
                    <span
                      aria-hidden
                      className="h-5 w-5 shrink-0 rounded-full border-2 border-bor2"
                    />
                    <span className="block min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{a.titulo}</span>
                      <span className="mt-[3px] flex items-center gap-[6px]">
                        <span
                          aria-hidden
                          className="h-[6px] w-[6px] rounded-full"
                          style={{ background: materia?.color ?? '#64748b' }}
                        />
                        <span className="text-xs text-tx3">{materia?.nombre ?? 'General'}</span>
                      </span>
                    </span>
                    <span
                      className={`font-mono text-xs whitespace-nowrap ${
                        estado === 'vencido'
                          ? 'text-vencido'
                          : estado === 'hoy'
                            ? 'text-acc'
                            : 'text-tx3'
                      }`}
                    >
                      {ddmm(a.fecha)}
                      {estado === 'vencido' ? ' · vencido' : estado === 'hoy' ? ' · hoy' : ''}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {syncIso && (
        <button
          type="button"
          onClick={() => setPanel(true)}
          className="mt-[34px] flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2"
        >
          <span aria-hidden className="h-[6px] w-[6px] shrink-0 rounded-full bg-sync-ok" />
          <span className="font-mono text-[11px] text-tx3">
            Sincronizado con el aula virtual · {hace(syncIso, ahora)}
          </span>
        </button>
      )}

      <PanelAulaVirtual
        abierto={panel}
        onCerrar={() => setPanel(false)}
        clave={clave}
        nombre={nombreAula(estado)}
        detalles={detalles}
        onRefrescar={refrescar}
      />
    </>
  );
}
