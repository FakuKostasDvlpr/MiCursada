'use client';

// Modal de detalle de una card (spec `specs/modal-de-card`).
//
// Es la puerta que el tablero no tenía: acá se edita todo lo que la card no
// muestra — tipo, estado, formato, referencia, URL y hecha — y se borra con
// doble toque. Se abre desde una card del tablero y desde el `⋯` de una fila
// del documento.
//
// Todo se guarda solo: el texto con el mismo debounce del editor, el resto al
// instante. Por eso el botón del pie dice "Listo" y no "Guardar".
//
// Este archivo también es el hogar de los helpers de presentación que comparte
// con el tablero (`ddmm`, `dominio`, colores y nombres de estado): viven acá
// para que la dependencia sea en una sola dirección (notas-editor → modal-card)
// y no haya ciclo de imports.

import { useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import type { BloquePatch } from '@/app/actions';
import { Modal } from '@/components/modal';
import { type ItemRef, buscarRefs, mencionEnCursor } from '@/lib/referencias';
import { lanzarToast } from '@/lib/toast';
import {
  COLOR_REF,
  type Bloque,
  type EstadoBloque,
  type FormatoBloque,
  type RefBloque,
  type TipoBloque,
} from '@/lib/types';

export const COLOR_ESTADO: Record<EstadoBloque, string> = {
  pendiente: '#64748b',
  proceso: '#38bdf8',
  listo: '#34d399',
};

export const NOMBRE_ESTADO: Record<EstadoBloque, string> = {
  pendiente: 'Por hacer',
  proceso: 'En proceso',
  listo: 'Listo',
};

/** Color del badge de estado del header: `--tx3` para "Por hacer". */
const COLOR_BADGE: Record<EstadoBloque, string> = {
  pendiente: 'var(--tx3)',
  proceso: '#38bdf8',
  listo: '#34d399',
};

/** Cómo se lee cada tipo en el badge del header. */
const NOMBRE_TIPO_BADGE: Record<TipoBloque, string> = {
  texto: 'Nota',
  titulo: 'Título',
  tarea: 'Tarea',
  link: 'Link',
  ref: 'Nota',
  divisor: 'Nota',
};

/** ISO → 'dd/mm' para el header del modal y el pie de las cards. */
export function ddmm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Dominio de una URL para el favicon y la subfila mono. */
export function dominio(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** 'YYYY-MM-DD' → 'dd/mm', sin construir un Date (no depende de la zona). */
export function ddmmFecha(f: string): string {
  return `${f.slice(8, 10)}/${f.slice(5, 7)}`;
}

/** Cuánto queda armada una confirmación de borrado antes de desarmarse sola. */
export const MS_CONFIRMAR = 3000;

// ---------------------------------------------------------------------------
// Menú "Convertir en"
// ---------------------------------------------------------------------------

type Conversion = {
  tipo: TipoBloque;
  glifo: string;
  nombre: string;
  cmd: string;
  /** Las mismas keywords del composer: `/todo` y `/checkbox` encuentran Tarea. */
  claves: string;
};

const CONVERSIONES: Conversion[] = [
  { tipo: 'texto', glifo: 'T', nombre: 'Texto', cmd: '/texto', claves: 'texto nota parrafo' },
  { tipo: 'titulo', glifo: '#', nombre: 'Título', cmd: '/titulo', claves: 'titulo encabezado' },
  {
    tipo: 'tarea',
    glifo: '✓',
    nombre: 'Tarea',
    cmd: '/tarea',
    claves: 'tarea pendiente check todo to-do checkbox',
  },
  { tipo: 'link', glifo: '↗', nombre: 'Link', cmd: '/link', claves: 'link url preview' },
];

/**
 * Saca el `/comando` que abrió el menú y devuelve el resto del texto.
 *
 * El prototipo vacía el texto al convertir (`x.texto=''`): acá no, convertir
 * conserva lo escrito (spec §2). Pero el token que abrió el menú sí se va —
 * quedaría "/link" como nombre del link. Solo se saca si ese token ES el
 * comando elegido: "/etc/passwd de la VM" se conserva entero.
 */
export function sinComando(texto: string, c: Conversion): string {
  const m = /^\/(\S*)\s*/.exec(texto);
  if (!m) return texto;
  const token = (m[1] ?? '').toLowerCase();
  if (token && !c.cmd.slice(1).includes(token) && !c.claves.includes(token)) return texto;
  return texto.slice(m[0].length);
}

// ---------------------------------------------------------------------------
// Chip de referencia
// ---------------------------------------------------------------------------

/** Resuelve una cita contra el catálogo: nombre y color con los que se pinta. */
export function verRef(ref: RefBloque, catalogo: ItemRef[]): { nombre: string; color: string } {
  const item = catalogo.find((c) => c.ref.tipo === ref.tipo && c.ref.id === ref.id);
  // Sin catálogo (o citando algo que ya no está) se muestra el id: es mejor
  // que borrar la cita en silencio.
  return { nombre: item?.nombre ?? ref.id, color: item?.color ?? COLOR_REF[ref.tipo] };
}

/** Pill con dot que cuelga del bloque y de su card. */
export function ChipRef({
  cita,
  catalogo,
  chico = false,
}: {
  cita: RefBloque;
  catalogo: ItemRef[];
  chico?: boolean;
}) {
  const { nombre, color } = verRef(cita, catalogo);
  return (
    <span
      className={`mt-[6px] inline-flex max-w-full items-center gap-[6px] rounded-full border border-bor bg-sup px-[10px] py-1 font-mono ${
        chico ? 'text-[10.5px]' : 'text-[11px]'
      }`}
      style={{ color }}
    >
      <span
        aria-hidden
        className="h-[6px] w-[6px] shrink-0 rounded-full"
        style={{ background: color }}
      />
      <span className="truncate">{nombre}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------

type Props = {
  bloque: Bloque;
  /** Lo citable con `@` y con el select de Referencia. */
  catalogo: ItemRef[];
  onCerrar: () => void;
  /** Guarda un patch y avisa si salió bien (para recién ahí lanzar el toast). */
  onGuardar: (patch: BloquePatch) => Promise<boolean>;
  /** Texto con debounce, como en el documento. */
  onTexto: (texto: string) => void;
  onBlurTexto: (texto: string) => void;
  /** Borra el bloque y cierra: el toast lo lanza quien borra. */
  onBorrar: () => void;
  /** El aviso que ya nació de esta nota, si hay uno. */
  aviso?: { fecha: string; hecho: boolean } | null;
  /** Hoy en Buenos Aires ('YYYY-MM-DD'): lo calcula el server, no el device. */
  hoyIso: string;
  /** Crea el aviso ligado a la nota. Devuelve si salió bien. */
  onCrearAviso?: (fecha: string) => Promise<boolean>;
  /** Abre el aviso ya creado. */
  onVerAviso?: () => void;
};

export function ModalCard({
  bloque: b,
  catalogo,
  onCerrar,
  onGuardar,
  onTexto,
  onBlurTexto,
  onBorrar,
  aviso = null,
  hoyIso,
  onCrearAviso,
  onVerAviso,
}: Props) {
  const area = useRef<HTMLTextAreaElement>(null);
  const [mencion, setMencion] = useState<{ desde: number; hasta: number; consulta: string } | null>(
    null
  );
  const [url, setUrl] = useState(b.url);
  const [armado, setArmado] = useState(false);
  /** Fecha del aviso a crear. Por card: abrir otra no arrastra lo tipeado acá. */
  const [fechaAviso, setFechaAviso] = useState(hoyIso);
  /** Timer PROPIO: armar el Borrar del modal no desarma el tachito de la card. */
  const timerBorrar = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerBorrar.current) clearTimeout(timerBorrar.current);
  }, []);

  // Autofoco solo en desktop: el sheet está anclado abajo y en móvil el teclado
  // lo taparía apenas se abre (spec §2).
  useEffect(() => {
    if (window.matchMedia('(min-width: 641px)').matches) area.current?.focus();
  }, []);

  /** Crea el aviso ligado y avisa con el toast del handoff. */
  const crearAviso = async () => {
    if (!onCrearAviso || !fechaAviso) return;
    if (await onCrearAviso(fechaAviso)) lanzarToast('Aviso creado desde la nota', 'ok');
  };

  const fmt: FormatoBloque = b.fmt ?? {};
  const estadoBadge: EstadoBloque = b.hecho ? 'listo' : b.estado;

  // --- Menú `/` -------------------------------------------------------------

  const slashAbierto = b.texto.startsWith('/');
  const filtro = b.texto.slice(1).trim().toLowerCase();
  const opcionesSlash = slashAbierto
    ? CONVERSIONES.filter((c) => c.cmd.includes(filtro) || c.claves.includes(filtro))
    : [];

  const convertir = async (c: Conversion) => {
    const texto = sinComando(b.texto, c);
    if (await onGuardar({ tipo: c.tipo, texto })) {
      lanzarToast(`Convertida en ${c.nombre}`, 'ok');
    }
  };

  // --- Menú `@` -------------------------------------------------------------

  const opcionesAt = mencion ? buscarRefs(catalogo, mencion.consulta, 5) : [];

  const revisar = (el: HTMLTextAreaElement) => {
    if (el.value.startsWith('/')) {
      setMencion(null);
      return;
    }
    setMencion(mencionEnCursor(el.value, el.selectionStart ?? 0));
  };

  const elegirMencion = async (item: ItemRef) => {
    if (!mencion) return;
    // Se saca solo la mención: lo escrito antes y después del `@` queda (§2).
    const texto = b.texto.slice(0, mencion.desde) + b.texto.slice(mencion.hasta);
    setMencion(null);
    if (await onGuardar({ ref: item.ref, texto })) lanzarToast('Referencia vinculada', 'ok');
  };

  // --- Controles ------------------------------------------------------------

  const elegirEstado = async (estado: EstadoBloque) => {
    if (estado === b.estado) return;
    // La misma regla que aplica el tablero al soltar: llegar a Listo marca hecho.
    if (await onGuardar({ estado, hecho: estado === 'listo' })) {
      lanzarToast(
        estado === 'listo' ? '¡Completada! Movida a Listo' : `Movida a ${NOMBRE_ESTADO[estado]}`,
        'ok'
      );
    }
  };

  const toggleFmt = (k: keyof FormatoBloque) => {
    void onGuardar({ fmt: { ...fmt, [k]: !fmt[k] } });
  };

  const elegirRef = async (valor: string) => {
    if (!valor) {
      if (await onGuardar({ ref: null })) lanzarToast('Referencia quitada', 'ok');
      return;
    }
    const item = catalogo.find((c) => `${c.ref.tipo}:${c.ref.id}` === valor);
    if (!item) return;
    if (await onGuardar({ ref: item.ref })) lanzarToast('Referencia vinculada', 'ok');
  };

  const toggleHecho = async () => {
    const hecho = !b.hecho;
    const ok = await onGuardar({ hecho, estado: hecho ? 'listo' : 'pendiente' });
    if (ok && hecho) lanzarToast('¡Tarea completada!', 'ok');
  };

  const borrar = () => {
    if (!armado) {
      setArmado(true);
      if (timerBorrar.current) clearTimeout(timerBorrar.current);
      timerBorrar.current = setTimeout(() => setArmado(false), MS_CONFIRMAR);
      return;
    }
    if (timerBorrar.current) clearTimeout(timerBorrar.current);
    setArmado(false);
    onBorrar();
  };

  const label = 'block font-mono text-[10.5px] font-semibold tracking-[0.14em] text-tx3 uppercase';
  const caja =
    'w-full min-h-[46px] rounded-xl border border-bor bg-bg text-[14px] text-tx';

  return (
    <Modal
      abierto
      ancho="card"
      titulo="Detalle de la card"
      onCerrar={onCerrar}
      encabezado={
        <div className="mb-4 flex items-center gap-[10px]">
          <span className="rounded-full border border-acc px-[11px] py-1 font-mono text-[10px] font-semibold tracking-[0.12em] text-acc uppercase">
            {NOMBRE_TIPO_BADGE[b.tipo]}
          </span>
          <span
            className="rounded-full border px-[11px] py-1 font-mono text-[10px] font-semibold tracking-[0.12em] uppercase"
            style={{ color: COLOR_BADGE[estadoBadge], borderColor: COLOR_BADGE[estadoBadge] }}
          >
            {NOMBRE_ESTADO[estadoBadge]}
          </span>
          <span className="font-mono text-[11px] text-tx4">{ddmm(b.createdAt)}</span>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="tactil -mr-3 ml-auto grid h-11 w-11 cursor-pointer place-items-center rounded-xl text-tx3"
          >
            <X size={18} strokeWidth={2.2} aria-hidden />
          </button>
        </div>
      }
    >
      <textarea
        ref={area}
        value={b.texto}
        rows={4}
        placeholder="¿Qué hay que hacer? · / cambia el tipo · @ referencia"
        aria-label="Texto de la card"
        onChange={(e) => {
          onTexto(e.target.value);
          revisar(e.target);
        }}
        onKeyUp={(e) => revisar(e.currentTarget)}
        onClick={(e) => revisar(e.currentTarget)}
        onBlur={(e) => {
          onBlurTexto(e.target.value);
          // Respiro para que el click en una opción del menú llegue antes.
          setTimeout(() => setMencion(null), 120);
        }}
        className="w-full resize-y rounded-[14px] border border-bor bg-bg px-4 py-[14px] text-[17px] leading-[1.55] font-semibold text-tx"
      />

      {slashAbierto && (
        <div className="mt-2 rounded-xl border border-bor2 bg-bg p-1">
          <div className="px-[10px] pt-2 pb-1 font-mono text-[10px] font-semibold tracking-[0.14em] text-tx4 uppercase">
            Convertir en
          </div>
          {opcionesSlash.length === 0 ? (
            <div className="px-3 py-[10px] text-[13px] text-tx3">
              No hay ningún tipo «/{filtro}».
            </div>
          ) : (
            opcionesSlash.map((c) => (
              <button
                key={c.cmd}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void convertir(c)}
                className="flex min-h-11 w-full cursor-pointer items-center gap-[10px] rounded-[9px] px-[10px] py-[6px] text-left text-tx hover:bg-bor"
              >
                <span
                  aria-hidden
                  className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-lg bg-bor font-mono text-[12px] text-acc"
                >
                  {c.glifo}
                </span>
                <span className="flex-1 text-[13.5px] font-semibold">{c.nombre}</span>
                <span className="font-mono text-[10.5px] text-tx3">{c.cmd}</span>
              </button>
            ))
          )}
        </div>
      )}

      {mencion && !slashAbierto && (
        <div className="mt-2 rounded-xl border border-bor2 bg-bg p-1">
          <div className="px-[10px] pt-2 pb-1 font-mono text-[10px] font-semibold tracking-[0.14em] text-tx4 uppercase">
            Referenciar
          </div>
          {opcionesAt.length === 0 ? (
            <div className="px-3 py-[10px] text-[13px] text-tx3">
              No hay nada para citar con «{mencion.consulta}».
            </div>
          ) : (
            opcionesAt.map((r) => (
              <button
                key={`${r.ref.tipo}:${r.ref.id}`}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void elegirMencion(r)}
                className="flex min-h-11 w-full cursor-pointer items-center gap-[10px] rounded-[9px] px-[10px] py-[6px] text-left text-tx hover:bg-bor"
              >
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: r.color }}
                />
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
                  {r.nombre}
                </span>
                <span className="font-mono text-[10px] tracking-[0.1em] text-tx4 uppercase">
                  {r.kind}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Estado */}
      <div className="mt-4">
        <div className={`${label} mb-2`}>Estado</div>
        <div className="flex gap-[2px] rounded-[11px] border border-bor bg-bg p-[3px]">
          {(['pendiente', 'proceso', 'listo'] as const).map((es) => (
            <button
              key={es}
              type="button"
              onClick={() => void elegirEstado(es)}
              aria-pressed={b.estado === es}
              // Alto visual 38px como el handoff, pero el botón mide 44 de alto:
              // el segmento entero respeta el mínimo táctil (spec §2).
              className={`grid min-h-11 flex-1 cursor-pointer place-items-center text-[12.5px] font-bold ${
                b.estado === es ? 'text-tx' : 'text-tx3'
              }`}
            >
              <span
                className={`flex h-[38px] w-full items-center justify-center gap-[6px] rounded-lg ${
                  b.estado === es ? 'bg-bor' : ''
                }`}
              >
                <span
                  aria-hidden
                  className="h-[7px] w-[7px] shrink-0 rounded-full"
                  style={{ background: COLOR_ESTADO[es] }}
                />
                {NOMBRE_ESTADO[es]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Formato */}
      <div className="mt-[14px]">
        <div className={`${label} mb-2`}>Formato</div>
        <div className="flex gap-2">
          {(
            [
              ['b', 'B', 'font-bold'],
              ['i', 'I', 'italic'],
              ['u', 'U', 'underline'],
              ['hl', '▍A', ''],
            ] as const
          ).map(([k, glifo, estilo]) => {
            const on = !!fmt[k];
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggleFmt(k)}
                aria-pressed={on}
                aria-label={`Formato ${glifo}`}
                // 44×40 visual dentro de un botón de 44×44 (spec §2).
                className="tactil grid h-11 w-11 cursor-pointer place-items-center"
              >
                <span
                  className={`grid h-10 w-11 place-items-center rounded-[10px] border border-bor text-[14px] transition-[background-color,color] duration-150 ${estilo} ${
                    // --acc-bg/--acc-fg son exactamente #fbbf24 sobre #221a00
                    // en los dos temas (CLAUDE.md).
                    on ? 'bg-acc-bg text-acc-fg' : 'bg-bg text-tx2'
                  }`}
                >
                  {glifo}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Referencia — el camino accesible al mismo dato que el `@`. */}
      <div className="mt-[14px]">
        <label className={`${label} mb-2`} htmlFor={`ref-${b.id}`}>
          Referencia
        </label>
        <select
          id={`ref-${b.id}`}
          value={b.ref ? `${b.ref.tipo}:${b.ref.id}` : ''}
          onChange={(e) => void elegirRef(e.target.value)}
          className={`${caja} px-3`}
        >
          <option value="">Sin referencia</option>
          {catalogo.map((r) => (
            <option key={`${r.ref.tipo}:${r.ref.id}`} value={`${r.ref.tipo}:${r.ref.id}`}>
              {r.ref.tipo === 'modulo' ? '📄 ' : r.ref.tipo === 'materia' ? '▣ ' : '! '}
              {r.nombre}
            </option>
          ))}
        </select>
      </div>

      {b.tipo === 'link' && (
        <div className="mt-[14px]">
          <label className={`${label} mb-2`} htmlFor={`url-${b.id}`}>
            URL
          </label>
          <input
            id={`url-${b.id}`}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            // `normalizarUrl` de la action le pone el https:// que falte.
            onBlur={() => {
              if (url !== b.url) void onGuardar({ url });
            }}
            placeholder="Pegá el link acá"
            inputMode="url"
            className={`${caja} px-[14px] font-mono text-[13px]`}
          />
        </div>
      )}

      {b.tipo === 'tarea' && (
        <button
          type="button"
          onClick={() => void toggleHecho()}
          aria-pressed={b.hecho}
          className={`${caja} mt-[14px] flex cursor-pointer items-center gap-[10px] px-[14px] text-left font-semibold`}
        >
          <span
            aria-hidden
            className={`grid h-[19px] w-[19px] shrink-0 place-items-center rounded-[7px] border-2 border-bor2 ${
              b.hecho ? 'bg-bor' : ''
            }`}
          >
            {b.hecho && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--acc)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            )}
          </span>
          {b.hecho ? 'Hecha — tocá para desmarcar' : 'Marcar como hecha'}
        </button>
      )}

      {onCrearAviso && (
        <div className="mt-[14px]">
          <span className={`${label} mb-2 block`}>Aviso</span>
          {aviso ? (
            <div className="flex items-center gap-[9px] rounded-xl border border-bor bg-bg px-[13px] py-[10px]">
              <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full bg-[#fb7185]" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-tx2">
                Aviso creado · {ddmmFecha(aviso.fecha)}
                {aviso.hecho ? ' · hecho' : ''}
              </span>
              <button
                type="button"
                onClick={onVerAviso}
                className="tactil cursor-pointer px-1 text-[12.5px] font-bold text-acc"
              >
                Ver
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="date"
                value={fechaAviso}
                onChange={(e) => setFechaAviso(e.target.value)}
                aria-label="Fecha del aviso"
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-bor bg-bg px-3 font-mono text-[13px] text-tx"
              />
              <button
                type="button"
                onClick={() => void crearAviso()}
                className="tactil inline-flex shrink-0 cursor-pointer items-center gap-[7px] rounded-xl border border-bor2 bg-bg px-[14px] text-[13px] font-bold text-tx hover:border-acc hover:text-acc"
              >
                <Bell size={14} strokeWidth={2} aria-hidden />
                Crear aviso
              </button>
            </div>
          )}
        </div>
      )}

      <div className="mt-5 flex gap-[10px]">
        <button
          type="button"
          onClick={borrar}
          className={`min-h-[46px] cursor-pointer rounded-xl px-4 text-[13.5px] font-bold transition-[background-color] duration-150 ${
            armado
              ? 'border border-[#fb7185] bg-[#fb7185] text-[#20060b]'
              : 'border border-[rgba(251,113,133,.45)] text-[#fb7185]'
          }`}
        >
          {armado ? '¿Seguro? Tocá de nuevo' : 'Borrar'}
        </button>
        <button
          type="button"
          onClick={onCerrar}
          className="min-h-[46px] flex-1 cursor-pointer rounded-xl bg-acc-bg text-[14.5px] font-bold text-acc-fg"
        >
          Listo
        </button>
      </div>
    </Modal>
  );
}
