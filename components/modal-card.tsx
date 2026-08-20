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
// Los helpers de presentación que comparte con el tablero (`ddmm`, `dominio`,
// colores y nombres de estado) viven en `components/modal-card-partes.ts`: este
// archivo exporta solo componentes.

import { useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import type { BloquePatch } from '@/app/actions';
import { Modal } from '@/components/modal';
import {
  COLOR_BADGE,
  COLOR_ESTADO,
  CONVERSIONES,
  type Conversion,
  MS_CONFIRMAR,
  NOMBRE_ESTADO,
  NOMBRE_TIPO_BADGE,
  ddmm,
  ddmmFecha,
  sinComando,
  verRef,
} from '@/components/modal-card-partes';
import { type ItemRef, buscarRefs, mencionEnCursor } from '@/lib/referencias';
import { lanzarToast } from '@/lib/toast';
import type { Bloque, EstadoBloque, FormatoBloque, RefBloque } from '@/lib/types';

const LABEL = 'block font-mono text-[10.5px] font-semibold tracking-[0.14em] text-tx3 uppercase';
const CAJA = 'w-full min-h-[46px] rounded-xl border border-bor bg-bg text-[14px] text-tx';

// ---------------------------------------------------------------------------
// Chip de referencia
// ---------------------------------------------------------------------------

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
// Partes del modal
// ---------------------------------------------------------------------------

/** Badges de tipo/estado, fecha y ✕ — reemplaza la fila de título del Modal. */
function Encabezado({
  bloque: b,
  estadoBadge,
  onCerrar,
}: {
  bloque: Bloque;
  estadoBadge: EstadoBloque;
  onCerrar: () => void;
}) {
  return (
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
  );
}

/** Menú `/`: convertir la card en otro tipo. */
function MenuConvertir({
  filtro,
  opciones,
  onElegir,
}: {
  filtro: string;
  opciones: Conversion[];
  onElegir: (c: Conversion) => void;
}) {
  return (
    <div className="mt-2 rounded-xl border border-bor2 bg-bg p-1">
      <div className="px-[10px] pt-2 pb-1 font-mono text-[10px] font-semibold tracking-[0.14em] text-tx4 uppercase">
        Convertir en
      </div>
      {opciones.length === 0 ? (
        <div className="px-3 py-[10px] text-[13px] text-tx3">No hay ningún tipo «/{filtro}».</div>
      ) : (
        opciones.map((c) => (
          <button
            key={c.cmd}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onElegir(c)}
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
  );
}

/** Menú `@`: vincular una referencia del catálogo. */
function MenuMenciones({
  consulta,
  opciones,
  onElegir,
}: {
  consulta: string;
  opciones: ItemRef[];
  onElegir: (item: ItemRef) => void;
}) {
  return (
    <div className="mt-2 rounded-xl border border-bor2 bg-bg p-1">
      <div className="px-[10px] pt-2 pb-1 font-mono text-[10px] font-semibold tracking-[0.14em] text-tx4 uppercase">
        Referenciar
      </div>
      {opciones.length === 0 ? (
        <div className="px-3 py-[10px] text-[13px] text-tx3">
          No hay nada para citar con «{consulta}».
        </div>
      ) : (
        opciones.map((r) => (
          <button
            key={`${r.ref.tipo}:${r.ref.id}`}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onElegir(r)}
            className="flex min-h-11 w-full cursor-pointer items-center gap-[10px] rounded-[9px] px-[10px] py-[6px] text-left text-tx hover:bg-bor"
          >
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: r.color }}
            />
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{r.nombre}</span>
            <span className="font-mono text-[10px] tracking-[0.1em] text-tx4 uppercase">
              {r.kind}
            </span>
          </button>
        ))
      )}
    </div>
  );
}

/** Segmentado Por hacer / En proceso / Listo. */
function SelectorEstado({
  estado,
  onElegir,
}: {
  estado: EstadoBloque;
  onElegir: (es: EstadoBloque) => void;
}) {
  return (
    <div className="mt-4">
      <div className={`${LABEL} mb-2`}>Estado</div>
      <div className="flex gap-[2px] rounded-[11px] border border-bor bg-bg p-[3px]">
        {(['pendiente', 'proceso', 'listo'] as const).map((es) => (
          <button
            key={es}
            type="button"
            onClick={() => onElegir(es)}
            aria-pressed={estado === es}
            // Alto visual 38px como el handoff, pero el botón mide 44 de alto:
            // el segmento entero respeta el mínimo táctil (spec §2).
            className={`grid min-h-11 flex-1 cursor-pointer place-items-center text-[12.5px] font-bold ${
              estado === es ? 'text-tx' : 'text-tx3'
            }`}
          >
            <span
              className={`flex h-[38px] w-full items-center justify-center gap-[6px] rounded-lg ${
                estado === es ? 'bg-bor' : ''
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
  );
}

/** Negrita / itálica / subrayado / resaltado. */
function BotonesFormato({
  fmt,
  onToggle,
}: {
  fmt: FormatoBloque;
  onToggle: (k: keyof FormatoBloque) => void;
}) {
  return (
    <div className="mt-[14px]">
      <div className={`${LABEL} mb-2`}>Formato</div>
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
              onClick={() => onToggle(k)}
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
  );
}

/** El camino accesible al mismo dato que el `@`. */
function SelectorReferencia({
  id,
  valor,
  catalogo,
  onElegir,
}: {
  id: string;
  valor: string;
  catalogo: ItemRef[];
  onElegir: (valor: string) => void;
}) {
  return (
    <div className="mt-[14px]">
      <label className={`${LABEL} mb-2`} htmlFor={`ref-${id}`}>
        Referencia
      </label>
      <select
        id={`ref-${id}`}
        value={valor}
        onChange={(e) => onElegir(e.target.value)}
        className={`${CAJA} px-3`}
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
  );
}

/**
 * URL del link. Lo tipeado vive en un borrador local; mientras no haya borrador
 * se muestra la prop (no una copia vieja de ella).
 */
function CampoUrl({
  id,
  url,
  onGuardar,
}: {
  id: string;
  url: string;
  onGuardar: (url: string) => void;
}) {
  const [borrador, setBorrador] = useState<string | null>(null);
  const valor = borrador ?? url;
  return (
    <div className="mt-[14px]">
      <label className={`${LABEL} mb-2`} htmlFor={`url-${id}`}>
        URL
      </label>
      <input
        id={`url-${id}`}
        value={valor}
        onChange={(e) => setBorrador(e.target.value)}
        // `normalizarUrl` de la action le pone el https:// que falte.
        onBlur={() => {
          if (valor !== url) onGuardar(valor);
        }}
        placeholder="Pegá el link acá"
        inputMode="url"
        className={`${CAJA} px-[14px] font-mono text-[13px]`}
      />
    </div>
  );
}

/** Checkbox grande de "hecha" para las tareas. */
function BotonHecha({ hecho, onToggle }: { hecho: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={hecho}
      className={`${CAJA} mt-[14px] flex cursor-pointer items-center gap-[10px] px-[14px] text-left font-semibold`}
    >
      <span
        aria-hidden
        className={`grid h-[19px] w-[19px] shrink-0 place-items-center rounded-[7px] border-2 border-bor2 ${
          hecho ? 'bg-bor' : ''
        }`}
      >
        {hecho && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--acc)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        )}
      </span>
      {hecho ? 'Hecha — tocá para desmarcar' : 'Marcar como hecha'}
    </button>
  );
}

/**
 * Aviso ligado a la nota: si ya existe se muestra y se puede abrir, si no se
 * elige la fecha y se crea. La fecha tipeada vive acá — abrir otra card no la
 * arrastra, porque este componente se monta con el modal.
 */
function SeccionAviso({
  aviso,
  hoyIso,
  onCrear,
  onVer,
}: {
  aviso: { fecha: string; hecho: boolean } | null;
  hoyIso: string;
  onCrear: (fecha: string) => void;
  onVer?: () => void;
}) {
  const [borrador, setBorrador] = useState<string | null>(null);
  const fecha = borrador ?? hoyIso;

  return (
    <div className="mt-[14px]">
      <span className={`${LABEL} mb-2 block`}>Aviso</span>
      {aviso ? (
        <div className="flex items-center gap-[9px] rounded-xl border border-bor bg-bg px-[13px] py-[10px]">
          <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full bg-[#fb7185]" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-tx2">
            Aviso creado · {ddmmFecha(aviso.fecha)}
            {aviso.hecho ? ' · hecho' : ''}
          </span>
          <button
            type="button"
            onClick={onVer}
            className="tactil cursor-pointer px-1 text-[12.5px] font-bold text-acc"
          >
            Ver
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="date"
            value={fecha}
            onChange={(e) => setBorrador(e.target.value)}
            aria-label="Fecha del aviso"
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-bor bg-bg px-3 font-mono text-[13px] text-tx"
          />
          <button
            type="button"
            onClick={() => onCrear(fecha)}
            className="tactil inline-flex shrink-0 cursor-pointer items-center gap-[7px] rounded-xl border border-bor2 bg-bg px-[14px] text-[13px] font-bold text-tx hover:border-acc hover:text-acc"
          >
            <Bell size={14} strokeWidth={2} aria-hidden />
            Crear aviso
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Borrar con doble toque. Timer PROPIO: armar el Borrar del modal no desarma
 * el tachito de la card.
 */
function BotonBorrar({ onBorrar }: { onBorrar: () => void }) {
  const [armado, setArmado] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const borrar = () => {
    if (!armado) {
      setArmado(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setArmado(false), MS_CONFIRMAR);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    setArmado(false);
    onBorrar();
  };

  return (
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

  // Autofoco solo en desktop: el sheet está anclado abajo y en móvil el teclado
  // lo taparía apenas se abre (spec §2). Va en un frame posterior porque el
  // `showModal()` del <dialog> (efecto del padre) también mueve el foco.
  useEffect(() => {
    if (!window.matchMedia('(min-width: 641px)').matches) return;
    const id = requestAnimationFrame(() => area.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  /** Crea el aviso ligado y avisa con el toast del handoff. */
  const crearAviso = async (fecha: string) => {
    if (!onCrearAviso || !fecha) return;
    if (await onCrearAviso(fecha)) lanzarToast('Aviso creado desde la nota', 'ok');
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

  return (
    <Modal
      abierto
      ancho="card"
      titulo="Detalle de la card"
      onCerrar={onCerrar}
      encabezado={<Encabezado bloque={b} estadoBadge={estadoBadge} onCerrar={onCerrar} />}
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
        <MenuConvertir
          filtro={filtro}
          opciones={opcionesSlash}
          onElegir={(c) => void convertir(c)}
        />
      )}

      {mencion && !slashAbierto && (
        <MenuMenciones
          consulta={mencion.consulta}
          opciones={opcionesAt}
          onElegir={(r) => void elegirMencion(r)}
        />
      )}

      <SelectorEstado estado={b.estado} onElegir={(es) => void elegirEstado(es)} />

      <BotonesFormato fmt={fmt} onToggle={toggleFmt} />

      <SelectorReferencia
        id={b.id}
        valor={b.ref ? `${b.ref.tipo}:${b.ref.id}` : ''}
        catalogo={catalogo}
        onElegir={(v) => void elegirRef(v)}
      />

      {b.tipo === 'link' && (
        <CampoUrl id={b.id} url={b.url} onGuardar={(url) => void onGuardar({ url })} />
      )}

      {b.tipo === 'tarea' && <BotonHecha hecho={b.hecho} onToggle={() => void toggleHecho()} />}

      {onCrearAviso && (
        <SeccionAviso
          aviso={aviso}
          hoyIso={hoyIso}
          onCrear={(fecha) => void crearAviso(fecha)}
          onVer={onVerAviso}
        />
      )}

      <div className="mt-5 flex gap-[10px]">
        <BotonBorrar onBorrar={onBorrar} />
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
