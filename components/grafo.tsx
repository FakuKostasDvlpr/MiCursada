'use client';

// Pantalla Grafo (handoff §5): toda la cursada como red de fuerzas, estilo
// graph view de Obsidian — sobre el fondo de la página, sin card.
//
// La simulación vive en un ref (no en el estado): en cada frame se muta el
// grafo y se pide un re-render con un contador. Mientras el grafo está caliente
// corre un requestAnimationFrame; cuando se asienta, se corta solo.

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ALFA_QUIETA,
  ALTO,
  ANCHO,
  type Grafo,
  type NodoGrafo,
  armarGrafo,
  cadenaEncendida,
  firmaGrafo,
  tickGrafo,
} from '@/lib/grafo';
import type { Aviso, Materia } from '@/lib/types';

/** Cuántos pasos se corren de una para mostrar el grafo ya quieto. */
const PASOS_ASENTAR = 600;

type Props = {
  materias: Materia[];
  avisos: Aviso[];
  /** Iniciales del usuario, para el nodo central. */
  iniciales: string;
};

export function GrafoCursada({ materias, avisos, iniciales }: Props) {
  const firma = firmaGrafo(materias, avisos);
  const grafoRef = useRef<Grafo | null>(null);
  const firmaRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const [, redibujar] = useState(0);
  const [hover, setHover] = useState<string | null>(null);

  // Se rearma solo si cambiaron los datos: si no, las posiciones ya calculadas
  // se conservan entre renders.
  if (firmaRef.current !== firma) {
    firmaRef.current = firma;
    grafoRef.current = armarGrafo(materias, avisos, iniciales);
  }
  const g = grafoRef.current as Grafo;

  const animar = useCallback(() => {
    const paso = () => {
      const grafo = grafoRef.current;
      if (!grafo || grafo.alfa <= ALFA_QUIETA) {
        rafRef.current = null;
        return;
      }
      tickGrafo(grafo);
      redibujar((n) => n + 1);
      rafRef.current = requestAnimationFrame(paso);
    };
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(paso);
  }, []);

  useEffect(() => {
    const grafo = grafoRef.current;
    if (!grafo) return;

    // Con reduced-motion no hay baile: se asienta de una y se dibuja quieto.
    const quieto =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (quieto) {
      for (let i = 0; i < PASOS_ASENTAR && grafo.alfa > ALFA_QUIETA; i++) tickGrafo(grafo);
      redibujar((n) => n + 1);
      return;
    }

    animar();
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [animar, firma]);

  const encendidos = useMemo(() => cadenaEncendida(g, hover), [g, hover]);
  const nodoHover = hover ? g.nodos.find((n) => n.id === hover) ?? null : null;
  const hayHover = nodoHover !== null;
  const toca = (n: NodoGrafo) => encendidos.has(n.id);

  return (
    <div className="relative mt-[6px]">
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        role="img"
        aria-label="Tu cursada como red: vos, tus materias y sus notas, archivos y avisos"
        className="block h-auto w-full select-none"
      >
        {g.aristas.map((l, i) => {
          const activa = hayHover && toca(l.a) && toca(l.b);
          return (
            <line
              // Las aristas no se reordenan: el índice alcanza como key.
              key={i}
              x1={l.a.x}
              y1={l.a.y}
              x2={l.b.x}
              y2={l.b.y}
              stroke={activa ? l.b.color || l.a.color : 'var(--bor)'}
              strokeOpacity={activa ? 0.85 : hayHover ? 0.25 : 0.5}
              strokeWidth={activa ? 1.6 : 1}
              className="[transition:stroke-opacity_.22s_ease,stroke_.22s_ease]"
            />
          );
        })}

        {g.nodos.map((n) => {
          const esYo = n.tipo === 'yo';
          const esMateria = n.tipo === 'materia';
          const encima = hover === n.id;
          const vecino = toca(n);
          const apagado = hayHover && !vecino;

          const r = esYo || esMateria ? n.r : encima ? n.r * 1.6 : n.r;
          const rHalo = encima ? n.r + 10 : esMateria ? n.r + 5 : 0;
          const relleno = esYo ? '#fbbf24' : esMateria || vecino ? n.color : 'var(--bor2)';
          const opacidad = apagado ? 0.35 : n.tipo === 'archivo' ? 0.75 : 1;
          const colorRotulo = encima
            ? 'var(--tx)'
            : apagado
              ? 'transparent'
              : esMateria
                ? 'var(--tx2)'
                : 'var(--tx3)';

          const dibujo = (
            <>
              <circle
                cx={n.x}
                cy={n.y}
                r={rHalo}
                fill={n.color}
                fillOpacity={encima ? 0.22 : 0.1}
                className="[transition:r_.2s_ease,fill-opacity_.25s_ease]"
              />
              <circle
                cx={n.x}
                cy={n.y}
                r={r}
                fill={relleno}
                fillOpacity={opacidad}
                className="[transition:r_.2s_ease,fill_.25s_ease,fill-opacity_.25s_ease]"
              />
              {esYo ? (
                <text
                  x={n.x}
                  y={n.y + 5}
                  textAnchor="middle"
                  className="pointer-events-none fill-[#221a00] text-sm font-extrabold"
                >
                  {n.rotulo}
                </text>
              ) : (
                !encima && (
                  <text
                    x={n.x}
                    y={n.y + n.r + (esMateria ? 17 : 14)}
                    textAnchor="middle"
                    fill={colorRotulo}
                    fontSize={esMateria ? 12.5 : 9}
                    fontWeight={esMateria ? 700 : 500}
                    className="pointer-events-none"
                  >
                    {n.rotulo}
                  </text>
                )
              )}
            </>
          );

          if (!n.href) return <g key={n.id}>{dibujo}</g>;

          return (
            <Link
              key={n.id}
              href={n.href}
              aria-label={`${n.tipo === 'materia' ? 'Materia' : n.tipo}: ${n.titulo}`}
              className="cursor-pointer"
              onPointerEnter={() => setHover(n.id)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(n.id)}
              onBlur={() => setHover(null)}
            >
              {dibujo}
            </Link>
          );
        })}
      </svg>

      {nodoHover && nodoHover.tipo !== 'yo' && <Tooltip nodo={nodoHover} />}
    </div>
  );
}

/**
 * Card descriptiva del nodo con hover. Va en HTML (no en SVG) y se ancla al
 * lado libre del nodo, clampeada para no salirse del lienzo.
 */
function Tooltip({ nodo }: { nodo: NodoGrafo }) {
  const px = (nodo.x / ANCHO) * 100;
  const py = (nodo.y / ALTO) * 100;
  const aLaDerecha = nodo.x < 460;
  const kicker =
    nodo.tipo === 'materia' ? 'Materia' : `${nodo.tipo} · ${nodo.materiaNombre}`;

  return (
    <div
      aria-hidden
      style={{
        left: aLaDerecha ? `min(${px.toFixed(1)}% + 18px, calc(100% - 226px))` : 'auto',
        right: aLaDerecha ? 'auto' : `min(${(100 - px).toFixed(1)}% + 18px, calc(100% - 226px))`,
        top: `clamp(4px, ${(py - 6).toFixed(1)}%, calc(100% - 110px))`,
      }}
      className="pointer-events-none absolute z-[5] w-[218px] rounded-xl border border-bor2 bg-sup px-[13px] py-[11px]"
    >
      <div className="flex items-center gap-[7px]">
        <span
          aria-hidden
          className="h-[7px] w-[7px] shrink-0 rounded-full"
          style={{ background: nodo.color }}
        />
        <span className="font-mono text-[9.5px] font-semibold tracking-[0.12em] text-tx3 uppercase">
          {kicker}
        </span>
      </div>
      <div className="mt-[5px] text-[13px] leading-[1.35] font-bold text-tx">{nodo.titulo}</div>
      <div className="mt-[3px] font-mono text-[10.5px] text-tx3">{nodo.sub}</div>
      <div
        className="mt-[7px] font-mono text-[9.5px] tracking-[0.08em] uppercase"
        style={{ color: nodo.color }}
      >
        click para ir →
      </div>
    </div>
  );
}
