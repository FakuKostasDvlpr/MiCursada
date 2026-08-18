'use client';

// Tab Notas — editor de bloques estilo Notion (HANDOFF.md §"Tab Notas").
// Sin drag & drop ni vista Tablero todavía: eso queda para después.
//
// Bitácora: los bloques se muestran agrupados por día calendario de Buenos
// Aires (derivado de `createdAt`, ver lib/bitacora.ts). No hay ningún proceso a
// medianoche: lo que se escribe después de las 00:00 simplemente cae en el día
// siguiente. El día de hoy va primero y abierto; los anteriores, colapsados.
//
// Persistencia: Server Actions de app/actions.ts. El texto se guarda con
// debounce (~600ms) para no escribir el overlay en cada tecla; crear, borrar,
// cambiar estado y togglear tareas guardan al instante. Todo con update
// optimista sobre el estado local, que se re-siembra desde el server cuando no
// hay ediciones en vuelo.

import {
  ArrowUpRight,
  ChevronRight,
  GripVertical,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  type BloquePatch,
  actualizarBloque,
  crearAvisoDesdeNota,
  crearBloque,
  eliminarBloque,
} from '@/app/actions';
import { CampoNota } from '@/components/campo-nota';
import {
  COLOR_ESTADO,
  ChipRef,
  MS_CONFIRMAR,
  ModalCard,
  NOMBRE_ESTADO,
  ddmm,
  dominio,
} from '@/components/modal-card';
import { CardRef, TextoConRefs } from '@/components/ref-curso';
import { EVENTO_NOTA_CREADA } from '@/lib/logro';
import { lanzarToast } from '@/lib/toast';
import { agruparPorDia, coincide, type GrupoDia } from '@/lib/bitacora';
import {
  type ItemCurso,
  type ItemRef,
  buscarEnCatalogo,
  buscarRefs,
  catalogoCurso,
  catalogoRefs,
  marcador,
  mencionEnCursor,
  refUnica,
} from '@/lib/referencias';
import {
  ESTADOS_BLOQUE,
  type Bloque,
  type EstadoBloque,
  type FormatoBloque,
  type Seccion,
  type TipoBloque,
} from '@/lib/types';

/**
 * Comandos del menú `/`, con los nombres y glifos del prototipo. `claves` son
 * las palabras por las que también se filtra: escribir `/kanban` encuentra "Ver
 * tablero" aunque el comando sea `/tablero`.
 *
 * Los que traen `tipo` crean un bloque; `/tablero` solo cambia de vista.
 */
type Comando = {
  tipo?: TipoBloque;
  glifo: string;
  nombre: string;
  cmd: string;
  claves: string;
  vista?: Vista;
};

const COMANDOS: Comando[] = [
  { tipo: 'texto', glifo: 'T', nombre: 'Texto', cmd: '/texto', claves: 'texto nota parrafo' },
  { tipo: 'titulo', glifo: '#', nombre: 'Título', cmd: '/titulo', claves: 'titulo encabezado' },
  {
    tipo: 'tarea',
    glifo: '✓',
    nombre: 'To-do (checkbox)',
    cmd: '/todo',
    // "tarea" sigue como keyword: quien venía escribiendo /tarea lo encuentra igual.
    claves: 'tarea pendiente check todo to-do checkbox',
  },
  {
    tipo: 'link',
    glifo: '↗',
    nombre: 'Link con preview',
    cmd: '/link',
    claves: 'link url preview',
  },
  { tipo: 'divisor', glifo: '—', nombre: 'Divisor', cmd: '/divisor', claves: 'divisor separador linea' },
  {
    glifo: '▦',
    nombre: 'Ver tablero',
    cmd: '/tablero',
    claves: 'tablero kanban board columnas',
    vista: 'tablero',
  },
];

type Vista = 'documento' | 'tablero';

/** Columnas del tablero, en orden. */
const COLUMNAS: { estado: EstadoBloque; nombre: string }[] = [
  { estado: 'pendiente', nombre: 'Por hacer' },
  { estado: 'proceso', nombre: 'En proceso' },
  { estado: 'listo', nombre: 'Listo' },
];

/** Cómo se llama cada tipo en el pie de una card del tablero. */
const NOMBRE_TIPO: Record<TipoBloque, string> = {
  texto: 'nota',
  titulo: 'título',
  tarea: 'tarea',
  link: 'link',
  ref: 'del curso',
  divisor: 'divisor',
};

/**
 * Clases con las que se pinta el formato de un bloque en el documento: peso
 * 700, itálica, subrayado (más tachado si está hecho) y resaltado ámbar.
 */
function clasesFmt(fmt: FormatoBloque | undefined, hecho: boolean): string {
  const f = fmt ?? {};
  const deco =
    f.u && hecho ? '[text-decoration:underline_line-through]' : f.u ? 'underline' : hecho ? 'line-through' : '';
  return [
    f.b ? 'font-bold' : '',
    f.i ? 'italic' : '',
    deco,
    f.hl ? 'rounded-[5px] bg-[rgba(251,191,36,.16)] px-1' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Lo que se lee en una card del tablero (`.html:1612`). */
function textoCard(b: Bloque): string {
  const t = b.texto.trim();
  if (t) return t;
  if (b.tipo === 'link') return dominio(b.url) || 'Link';
  return 'Sin título';
}

// ---------------------------------------------------------------------------

type Props = {
  materiaId: string;
  bloques: Bloque[];
  /** Unidades del aula virtual: lo que se puede citar con `@` o con `/curso`. */
  secciones?: Seccion[];
  /**
   * Las otras materias y los avisos también se pueden citar (`ref` del bloque).
   * Son opcionales: sin ellos el catálogo del `@` es solo el curso.
   */
  materias?: { id: string; nombre: string; color: string }[];
  avisos?: { id: string; titulo: string; hecho: boolean; fecha: string; notaId?: string | null }[];
  /** Hoy en Buenos Aires ('YYYY-MM-DD'), calculado en el server. */
  hoyIso: string;
  /** Abre un módulo en la tab Curso. Sin esto las referencias no navegan. */
  onIrAModulo?: (id: string) => void;
  /** Lleva a la pantalla de Avisos (el "Ver" del aviso ya creado). */
  onVerAvisos?: () => void;
};

export function NotasEditor({
  materiaId,
  bloques,
  secciones = [],
  materias = [],
  avisos = [],
  hoyIso,
  onIrAModulo,
  onVerAvisos,
}: Props) {
  const [items, setItems] = useState<Bloque[]>(bloques);
  const [valor, setValor] = useState('');
  const [error, setError] = useState('');
  const [vista, setVista] = useState<Vista>('documento');
  /** Card abierta en el modal de detalle. */
  const [cardId, setCardId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const catalogo = useMemo(() => catalogoCurso(secciones), [secciones]);
  const refs = useMemo(
    () => catalogoRefs({ secciones, materias, materiaActualId: materiaId, avisos }),
    [secciones, materias, materiaId, avisos]
  );

  /** Timers de debounce del texto, por bloque. */
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  /** Ediciones de texto sin confirmar: mientras haya, no pisamos con el server. */
  const enVuelo = useRef(0);
  /**
   * Columna del "+ Nueva card" que estamos esperando. `crearBloque` no devuelve
   * el id, así que la card recién nacida se reconoce cuando el server revalida:
   * es la última vacía de esa columna.
   */
  const nuevaEn = useRef<EstadoBloque | null>(null);

  // El server manda bloques nuevos cada vez que una action revalida. Los
  // adoptamos salvo que estemos en medio de una edición de texto.
  useEffect(() => {
    if (enVuelo.current === 0) setItems(bloques);

    const estado = nuevaEn.current;
    if (!estado) return;
    const nueva = bloques
      .filter((b) => b.tipo === 'tarea' && b.texto === '' && b.estado === estado)
      .reduce<Bloque | null>((a, b) => (!a || b.orden > a.orden ? b : a), null);
    if (!nueva) return;
    nuevaEn.current = null;
    setCardId(nueva.id);
    // Nacer en "Listo" es nacer hecha, como al soltar una card ahí.
    if (estado === 'listo' && !nueva.hecho) {
      setItems((prev) => prev.map((b) => (b.id === nueva.id ? { ...b, hecho: true } : b)));
      void actualizarBloque(nueva.id, { hecho: true });
    }
  }, [bloques]);

  const parche = (id: string, cambio: Partial<Bloque>) =>
    setItems((prev) => prev.map((b) => (b.id === id ? { ...b, ...cambio } : b)));

  const correr = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    startTransition(async () => {
      const resultado = await fn();
      if (!resultado.ok) setError(resultado.error);
    });
  };

  // --- Composer ---

  const menuAbierto = valor.startsWith('/');
  const filtro = valor.slice(1).trim().toLowerCase();
  // Como el prototipo: filtra por el comando Y por las palabras clave, así
  // /kanban encuentra "Ver tablero" y /parrafo encuentra "Texto".
  const opciones = menuAbierto
    ? COMANDOS.filter((c) => c.cmd.includes(filtro) || c.claves.includes(filtro))
    : [];

  // --- Referencias del composer (`@`) ---
  //
  // El `@` no escribe nada en el texto: adjunta la cita al bloque que está por
  // nacer (campo `ref`). Se muestra como chip arriba del input hasta que se
  // crea el bloque.

  const [refAdjunta, setRefAdjunta] = useState<ItemRef | null>(null);
  /** Posición del cursor en el input, para saber si el `@` está pegado a él. */
  const [cursor, setCursor] = useState(0);

  const mencion = menuAbierto ? null : mencionEnCursor(valor, cursor);
  const opcionesRef = mencion ? buscarRefs(refs, mencion.consulta, 7) : [];

  /** Adjunta la cita y saca el `@…` del texto, conservando el resto. */
  const elegirRefComposer = (item: ItemRef) => {
    if (!mencion) return;
    setRefAdjunta(item);
    setValor(valor.slice(0, mencion.desde) + valor.slice(mencion.hasta));
    setCursor(mencion.desde);
  };

  const agregar = (tipo: TipoBloque, texto = '', estado?: EstadoBloque) => {
    setError('');
    setValor('');
    const ref = refAdjunta?.ref;
    setRefAdjunta(null);
    correr(() =>
      crearBloque(materiaId, {
        tipo,
        texto,
        ...(estado ? { estado } : {}),
        ...(ref ? { ref } : {}),
      })
    );
    // El toast de logro vive en el layout (el hito cuenta las notas de toda la
    // cursada, no las de esta materia). Un divisor no es una nota.
    if (tipo !== 'divisor') {
      window.dispatchEvent(new CustomEvent(EVENTO_NOTA_CREADA));
    }
  };

  /** Ejecuta una opción del menú `/`: crear un bloque, o cambiar de vista. */
  const correrComando = (c: Comando) => {
    if (c.vista) {
      setValor('');
      setVista(c.vista);
      return;
    }
    if (c.tipo) agregar(c.tipo);
  };

  const enterComposer = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setValor('');
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (menuAbierto) {
      const primera = opciones[0];
      if (primera) correrComando(primera);
      return;
    }
    const texto = valor.trim();
    if (texto) agregar('texto', texto);
  };

  const botonMas = () => {
    if (menuAbierto) {
      const primera = opciones[0];
      if (primera) correrComando(primera);
      return;
    }
    const texto = valor.trim();
    if (texto) agregar('texto', texto);
  };

  // --- Guardado del texto con debounce ---

  const guardarTexto = (id: string, campos: { texto?: string; url?: string }) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    else enVuelo.current += 1; // primera tecla de la ráfaga
    timers.current.set(
      id,
      setTimeout(async () => {
        timers.current.delete(id);
        try {
          const resultado = await actualizarBloque(id, campos);
          if (!resultado.ok) setError(resultado.error);
        } finally {
          enVuelo.current -= 1;
        }
      }, 600)
    );
  };

  /**
   * Descarta el guardado de texto pendiente de un bloque. Lo usa el modal antes
   * de escribir un texto nuevo (convertir, elegir una mención): si no, el
   * debounce viejo repone lo que había 600ms después.
   */
  const cancelarTexto = (id: string) => {
    const timer = timers.current.get(id);
    if (!timer) return;
    clearTimeout(timer);
    timers.current.delete(id);
    enVuelo.current -= 1;
  };

  /**
   * Guarda un patch al instante (optimista) y dice si salió bien: quien llama
   * recién ahí lanza su toast.
   */
  const guardarBloque = async (id: string, patch: BloquePatch): Promise<boolean> => {
    if (patch.texto !== undefined) cancelarTexto(id);
    setError('');
    parche(id, patch as Partial<Bloque>);
    const resultado = await actualizarBloque(id, patch);
    if (!resultado.ok) {
      setError(resultado.error);
      return false;
    }
    return true;
  };

  /** Guarda ya (sin esperar el debounce): lo usa el blur de los campos. */
  const flush = (id: string, campos: { texto?: string; url?: string }) => {
    const timer = timers.current.get(id);
    if (!timer) return;
    clearTimeout(timer);
    timers.current.delete(id);
    void actualizarBloque(id, campos)
      .then((r) => {
        if (!r.ok) setError(r.error);
      })
      .finally(() => {
        enVuelo.current -= 1;
      });
  };

  const editarTexto = (id: string, texto: string) => {
    parche(id, { texto });
    guardarTexto(id, { texto });
  };

  // --- Acciones instantáneas ---

  const borrar = (id: string, mensaje: string) => {
    setError('');
    cancelarTexto(id);
    setItems((prev) => prev.filter((b) => b.id !== id));
    if (cardId === id) setCardId(null);
    startTransition(async () => {
      const resultado = await eliminarBloque(id);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      lanzarToast(mensaje, 'delete');
    });
  };

  const ciclarEstado = (b: Bloque) => {
    const siguiente =
      ESTADOS_BLOQUE[(ESTADOS_BLOQUE.indexOf(b.estado) + 1) % ESTADOS_BLOQUE.length]!;
    const hecho = b.tipo === 'tarea' ? siguiente === 'listo' : b.hecho;
    setError('');
    parche(b.id, { estado: siguiente, hecho });
    correr(() => actualizarBloque(b.id, { estado: siguiente, hecho }));
  };

  const toggleTarea = (b: Bloque) => {
    const hecho = !b.hecho;
    const estado: EstadoBloque = hecho ? 'listo' : 'pendiente';
    setError('');
    parche(b.id, { hecho, estado });
    correr(() => actualizarBloque(b.id, { hecho, estado }));
  };

  const guardarLink = (id: string, texto: string, url: string) => {
    setError('');
    parche(id, { texto, url });
    correr(() => actualizarBloque(id, { texto, url }));
  };

  // --- Bitácora: agrupado por día + buscador ---

  const [consulta, setConsulta] = useState('');
  /** Solo los días que el usuario abrió/cerró a mano (el resto usa el default). */
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});

  const grupos = useMemo(() => agruparPorDia(items, new Date()), [items]);

  const buscando = consulta.trim() !== '';
  const visibles: GrupoDia[] = buscando
    ? grupos
        .map((g) => ({ ...g, bloques: g.bloques.filter((b) => coincide(b, consulta)) }))
        .filter((g) => g.bloques.length > 0)
    : grupos;

  /** Con un solo día (o ninguno) la vista es la de siempre: sin encabezados. */
  const conEncabezados = grupos.length > 1;

  const fila = (b: Bloque) => (
    <FilaBloque
      key={b.id}
      bloque={b}
      catalogo={catalogo}
      refs={refs}
      secciones={secciones}
      onIr={onIrAModulo}
      onTexto={(t) => editarTexto(b.id, t)}
      onBlurTexto={(t) => flush(b.id, { texto: t })}
      onBorrar={() => borrar(b.id, 'Bloque eliminado')}
      onEstado={() => ciclarEstado(b)}
      onToggle={() => toggleTarea(b)}
      onLink={(texto, url) => guardarLink(b.id, texto, url)}
      onDetalle={() => setCardId(b.id)}
    />
  );

  const card = items.find((b) => b.id === cardId) ?? null;

  // --- Tablero: mover una card de columna ---

  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [columnaEncima, setColumnaEncima] = useState<EstadoBloque | null>(null);

  const soltarEn = (estado: EstadoBloque) => {
    const id = arrastrando;
    setArrastrando(null);
    setColumnaEncima(null);
    if (!id) return;
    const b = items.find((x) => x.id === id);
    if (!b || b.estado === estado) return;
    // Como el prototipo: llegar a "Listo" también marca la tarea hecha.
    const hecho = estado === 'listo';
    setError('');
    parche(id, { estado, hecho });
    correr(() => actualizarBloque(id, { estado, hecho }));
  };

  return (
    <div className="mt-4">
      {/* Documento | Tablero */}
      <div className="flex flex-wrap items-center justify-between gap-[10px]">
        <div className="inline-flex gap-[2px] rounded-[10px] border border-bor bg-sup p-[3px]">
          {(
            [
              ['documento', 'Documento'],
              ['tablero', 'Tablero'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setVista(v)}
              aria-pressed={vista === v}
              className={`min-h-9 cursor-pointer rounded-lg px-[14px] text-[12.5px] font-bold ${
                vista === v ? 'bg-bor text-acc' : 'text-tx3'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="font-mono text-[11px] text-tx4">
          {vista === 'tablero' ? 'arrastrá entre columnas' : '/ bloques · @ referencias'}
        </span>
      </div>

      {vista === 'tablero' ? (
        <Tablero
          items={items}
          refs={refs}
          secciones={secciones}
          onIr={onIrAModulo}
          arrastrando={arrastrando}
          columnaEncima={columnaEncima}
          onArrastrar={setArrastrando}
          onEncima={setColumnaEncima}
          onSoltar={soltarEn}
          onAgregar={(estado) => {
            // El "+ Nueva card" crea una tarea vacía y abre su modal.
            nuevaEn.current = estado;
            agregar('tarea', '', estado);
          }}
          onAbrir={setCardId}
          onBorrar={(id) => borrar(id, 'Card eliminada del tablero')}
        />
      ) : (
        <>
      {/* Composer */}
      <div className={`relative ${refAdjunta ? 'mt-2' : 'mt-[14px]'}`}>
        {refAdjunta && (
          <div className="mb-2 flex">
            <span className="inline-flex items-center gap-2 rounded-full border border-bor2 bg-sup py-[5px] pr-[6px] pl-3">
              <span
                aria-hidden
                className="h-[7px] w-[7px] shrink-0 rounded-full"
                style={{ background: refAdjunta.color }}
              />
              <span className="max-w-[240px] truncate font-mono text-[11.5px] text-tx">
                {refAdjunta.nombre}
              </span>
              <button
                type="button"
                onClick={() => setRefAdjunta(null)}
                aria-label={`Quitar la referencia a ${refAdjunta.nombre}`}
                className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-full text-tx3"
              >
                <X size={13} strokeWidth={2.2} aria-hidden />
              </button>
            </span>
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={valor}
            onChange={(e) => {
              setValor(e.target.value);
              setCursor(e.target.selectionStart ?? e.target.value.length);
            }}
            onKeyUp={(e) => setCursor(e.currentTarget.selectionStart ?? 0)}
            onClick={(e) => setCursor(e.currentTarget.selectionStart ?? 0)}
            onKeyDown={enterComposer}
            placeholder="Anotá lo que dice el profe · / bloques · @ referencias"
            aria-label="Nueva nota"
            className="min-h-[46px] min-w-0 flex-1 rounded-xl border border-bor bg-sup px-[14px] text-[14.5px] text-tx"
          />
          <button
            type="button"
            onClick={botonMas}
            aria-label="Agregar bloque"
            className="tactil grid h-[46px] w-[46px] shrink-0 cursor-pointer place-items-center rounded-xl bg-acc-bg text-acc-fg"
          >
            <Plus size={18} strokeWidth={2.5} aria-hidden />
          </button>
        </div>

        {/* Menú de referencias (`@`) */}
        {mencion && (
          <div className="absolute right-0 left-0 z-10 overflow-hidden rounded-xl border border-bor2 bg-sup p-1" style={{ top: refAdjunta ? '90px' : '52px' }}>
            <div className="kicker px-[10px] pt-2 pb-1 !text-tx4">Referenciar</div>
            {opcionesRef.length === 0 ? (
              <div className="px-3 py-[10px] text-[13px] text-tx3">
                Nada que referenciar con «{mencion.consulta}».
              </div>
            ) : (
              opcionesRef.map((r) => (
                <button
                  key={`${r.ref.tipo}:${r.ref.id}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => elegirRefComposer(r)}
                  className="flex min-h-[44px] w-full cursor-pointer items-center gap-[10px] rounded-[9px] px-[10px] py-1 text-left hover:bg-bor"
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: r.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-tx">
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

        {/* Menú de comandos */}
        {menuAbierto && (
          <div className="absolute top-[52px] right-0 left-0 z-10 overflow-hidden rounded-xl border border-bor2 bg-sup p-1">
            <div className="kicker px-[10px] pt-2 pb-1 !text-tx4">Bloques</div>
            {opciones.length === 0 ? (
              <div className="px-3 py-[10px] text-[13px] text-tx3">
                No hay ningún comando «/{filtro}».
              </div>
            ) : (
              opciones.map((c) => (
                <button
                  key={c.cmd}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => correrComando(c)}
                  className="flex min-h-[44px] w-full cursor-pointer items-center gap-[10px] rounded-[9px] px-[10px] py-1 text-left hover:bg-bor"
                >
                  <span
                    aria-hidden
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-bor font-mono text-[13px] text-acc"
                  >
                    {c.glifo}
                  </span>
                  <span className="flex-1 text-[14px] font-semibold text-tx">{c.nombre}</span>
                  <span className="font-mono text-[11px] text-tx3">{c.cmd}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {error && <div className="mt-[10px] text-[13px] text-vencido">{error}</div>}

      {/* Bloques */}
      {items.length === 0 ? (
        <div className="mt-[14px] rounded-[14px] border border-dashed border-bor p-5 text-center text-[13.5px] text-tx3">
          Sin notas todavía. Anotá lo que dice el profe acá — con / agregás títulos, tareas, links
          y divisores.
        </div>
      ) : !conEncabezados ? (
        <div className="mt-[14px] flex flex-col">
          {grupos.flatMap((g) => g.bloques).map(fila)}
        </div>
      ) : (
        <>
          {/* Buscador — aparece recién cuando hay más de un día de notas */}
          <div className="relative mt-[14px]">
            <Search
              size={15}
              strokeWidth={2}
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-tx3"
            />
            <input
              value={consulta}
              onChange={(e) => setConsulta(e.target.value)}
              placeholder="Buscar en tus notas…"
              aria-label="Buscar en tus notas"
              type="text"
              className="min-h-11 w-full rounded-xl border border-bor bg-sup pr-11 pl-9 text-[14px] text-tx"
            />
            {buscando && (
              <button
                type="button"
                onClick={() => setConsulta('')}
                aria-label="Limpiar búsqueda"
                className="tactil absolute top-1/2 right-0 grid h-11 w-11 -translate-y-1/2 cursor-pointer place-items-center rounded-xl text-tx3"
              >
                <X size={15} strokeWidth={2.5} aria-hidden />
              </button>
            )}
          </div>

          {visibles.length === 0 ? (
            <div className="mt-[14px] rounded-[14px] border border-dashed border-bor p-5 text-center text-[13.5px] text-tx3">
              No encontramos nada con eso.
            </div>
          ) : (
            <div className="mt-1 flex flex-col">
              {visibles.map((g, i) => {
                const clave = g.dia || 'sin-fecha';
                const panelId = `dia-${clave}`;
                // Mientras se busca, los días con coincidencias se abren solos.
                const abierto = buscando || (abiertos[clave] ?? i === 0);
                const n = g.bloques.filter((b) => b.tipo !== 'divisor').length;
                return (
                  <section key={clave}>
                    <h3>
                      <button
                        type="button"
                        onClick={() =>
                          setAbiertos((prev) => ({ ...prev, [clave]: !abierto }))
                        }
                        aria-expanded={abierto}
                        aria-controls={panelId}
                        className="tactil flex min-h-11 w-full cursor-pointer items-center gap-2 border-b border-bor py-2 text-left"
                      >
                        <ChevronRight
                          size={14}
                          strokeWidth={2.5}
                          aria-hidden
                          className={`shrink-0 text-tx3 transition-transform ${
                            abierto ? 'rotate-90' : ''
                          }`}
                        />
                        <span className="kicker flex-1">{g.etiqueta}</span>
                        <span className="font-mono text-[11px] text-tx3">
                          {n === 1 ? '1 nota' : `${n} notas`}
                        </span>
                      </button>
                    </h3>
                    <div id={panelId} className={abierto ? 'flex flex-col pb-2' : 'hidden'}>
                      {abierto && g.bloques.map(fila)}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
        </>
      )}

      {card && (
        <ModalCard
          bloque={card}
          catalogo={refs}
          onCerrar={() => setCardId(null)}
          onGuardar={(patch) => guardarBloque(card.id, patch)}
          onTexto={(t) => editarTexto(card.id, t)}
          onBlurTexto={(t) => flush(card.id, { texto: t })}
          onBorrar={() => borrar(card.id, 'Card eliminada')}
          aviso={avisos.find((a) => a.notaId === card.id) ?? null}
          hoyIso={hoyIso}
          onCrearAviso={async (fecha) => {
            const r = await crearAvisoDesdeNota({ materiaId, bloqueId: card.id, fecha });
            if (!r.ok) setError(r.error);
            return r.ok;
          }}
          onVerAviso={onVerAvisos}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tablero — las mismas notas, repartidas por estado
// ---------------------------------------------------------------------------

type TableroProps = {
  items: Bloque[];
  refs: ItemRef[];
  secciones: Seccion[];
  onIr?: (id: string) => void;
  arrastrando: string | null;
  columnaEncima: EstadoBloque | null;
  onArrastrar: (id: string | null) => void;
  onEncima: (estado: EstadoBloque | null) => void;
  onSoltar: (estado: EstadoBloque) => void;
  onAgregar: (estado: EstadoBloque) => void;
  onAbrir: (id: string) => void;
  onBorrar: (id: string) => void;
};

function Tablero({
  items,
  refs,
  secciones,
  onIr,
  arrastrando,
  columnaEncima,
  onArrastrar,
  onEncima,
  onSoltar,
  onAgregar,
  onAbrir,
  onBorrar,
}: TableroProps) {
  /** Card con el tachito armado. Timer propio: no lo comparte con el modal. */
  const [armado, setArmado] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const tocarBorrar = (id: string) => {
    if (armado !== id) {
      setArmado(id);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setArmado(null), MS_CONFIRMAR);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    setArmado(null);
    onBorrar(id);
  };

  return (
    // Las tres columnas no se apilan en móvil: la grilla mantiene su ancho y el
    // contenedor scrollea, como en el prototipo.
    <div className="mt-[14px] overflow-x-auto pb-[6px]">
      <div className="grid min-w-[680px] grid-cols-[repeat(3,minmax(218px,1fr))] gap-[10px]">
        {COLUMNAS.map(({ estado, nombre }) => {
          const cards = items.filter((b) => b.tipo !== 'divisor' && b.estado === estado);
          return (
            <div
              key={estado}
              onDragOver={(e) => {
                e.preventDefault();
                if (columnaEncima !== estado) onEncima(estado);
              }}
              onDragLeave={() => onEncima(null)}
              onDrop={(e) => {
                e.preventDefault();
                onSoltar(estado);
              }}
              className={`flex min-h-[190px] flex-col gap-2 rounded-[14px] border bg-sup p-[10px] ${
                columnaEncima === estado ? 'border-acc' : 'border-bor'
              }`}
            >
              <div className="flex items-center gap-2 px-1 py-[2px]">
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: COLOR_ESTADO[estado] }}
                />
                <span className="font-mono text-[10.5px] font-semibold tracking-[0.12em] text-tx2 uppercase">
                  {nombre}
                </span>
                <span className="ml-auto font-mono text-[11px] text-tx4">{cards.length}</span>
              </div>

              {cards.map((b) => {
                const f = b.fmt ?? {};
                const esLink = b.tipo === 'link' && /^https?:\/\//i.test(b.url);
                const host = dominio(b.url);
                return (
                  <div
                    key={b.id}
                    onClick={() => onAbrir(b.id)}
                    className={`cursor-pointer rounded-[11px] border border-bor bg-bg px-[10px] py-2 hover:border-bor2 ${
                      arrastrando === b.id ? 'opacity-50' : ''
                    }`}
                  >
                    <div
                      className={`rounded-[5px] px-1 py-[2px] text-[13.5px] leading-[1.45] ${
                        b.hecho ? 'text-tx3' : 'text-tx'
                      }`}
                      style={{
                        fontWeight: f.b ? 800 : 600,
                        fontStyle: f.i ? 'italic' : 'normal',
                        textDecoration:
                          [f.u ? 'underline' : '', b.hecho ? 'line-through' : '']
                            .filter(Boolean)
                            .join(' ') || 'none',
                        background: f.hl ? 'rgba(251,191,36,.16)' : 'transparent',
                      }}
                    >
                      {b.texto.includes('[[') ? (
                        <TextoConRefs texto={b.texto} secciones={secciones} onIr={onIr} />
                      ) : (
                        textoCard(b)
                      )}
                    </div>

                    {esLink && (
                      <a
                        href={b.url}
                        target="_blank"
                        rel="noopener"
                        onClick={(e) => e.stopPropagation()}
                        className="mt-[6px] flex min-h-11 items-center gap-2 rounded-[9px] border border-bor bg-sup px-[9px] py-[7px]"
                      >
                        <span
                          aria-hidden
                          className="block h-4 w-4 shrink-0 rounded bg-bor bg-cover bg-center bg-no-repeat"
                          style={{
                            backgroundImage: `url(https://www.google.com/s2/favicons?domain=${encodeURIComponent(
                              host
                            )}&sz=64)`,
                          }}
                        />
                        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-acc">
                          {host}
                        </span>
                        <ArrowUpRight size={12} strokeWidth={2} aria-hidden className="shrink-0 text-tx3" />
                      </a>
                    )}

                    {b.ref && (
                      <div>
                        <ChipRef cita={b.ref} catalogo={refs} chico />
                      </div>
                    )}

                    <div className="mt-[6px] flex items-center gap-2">
                      <span className="font-mono text-[10.5px] text-tx4">
                        {ddmm(b.createdAt)} · {NOMBRE_TIPO[b.tipo]}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          tocarBorrar(b.id);
                        }}
                        aria-label={armado === b.id ? '¿Seguro? Tocá de nuevo' : 'Eliminar card'}
                        title="Eliminar"
                        // 24px de alto visual; el ::after invisible le da los 44
                        // táctiles sin estirar el pie de la card (spec §2).
                        className={`relative ml-auto inline-flex h-6 min-w-7 cursor-pointer items-center justify-center gap-[5px] px-[2px] after:absolute after:top-1/2 after:left-1/2 after:h-11 after:w-full after:min-w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] hover:text-[#fb7185] ${
                          armado === b.id ? 'text-[#fb7185]' : 'text-bor2'
                        }`}
                      >
                        {armado === b.id && (
                          <span className="font-mono text-[9.5px] font-semibold tracking-[0.06em]">
                            ¿SEGURO?
                          </span>
                        )}
                        <Trash2 size={13} strokeWidth={2} aria-hidden />
                      </button>
                      <span
                        draggable
                        onClick={(e) => e.stopPropagation()}
                        onDragStart={(e) => {
                          e.stopPropagation();
                          onArrastrar(b.id);
                        }}
                        onDragEnd={() => {
                          onArrastrar(null);
                          onEncima(null);
                        }}
                        title="Arrastrá a otra columna"
                        aria-hidden
                        className="grid h-6 w-7 cursor-grab place-items-center text-bor2"
                      >
                        <GripVertical size={12} strokeWidth={2.5} />
                      </span>
                    </div>
                    {/* Mover sin arrastrar: en touch no hay drag nativo. */}
                    <div className="mt-1 flex gap-1">
                      {COLUMNAS.filter((c) => c.estado !== estado).map((c) => (
                        <button
                          key={c.estado}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onArrastrar(b.id);
                            onSoltar(c.estado);
                          }}
                          className="cursor-pointer rounded-md px-[6px] py-[2px] font-mono text-[10px] text-tx4 hover:bg-bor hover:text-tx2"
                        >
                          → {c.nombre.toLowerCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => onAgregar(estado)}
                className="min-h-10 cursor-pointer rounded-[10px] border border-dashed border-bor2 text-[12.5px] font-semibold text-tx3 hover:border-acc hover:text-acc active:border-acc active:text-acc"
              >
                + Nueva card
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

type FilaProps = {
  bloque: Bloque;
  catalogo: ReturnType<typeof catalogoCurso>;
  refs: ItemRef[];
  secciones: Seccion[];
  onIr?: (id: string) => void;
  onTexto: (texto: string) => void;
  onBlurTexto: (texto: string) => void;
  onBorrar: () => void;
  onEstado: () => void;
  onToggle: () => void;
  onLink: (texto: string, url: string) => void;
  onDetalle: () => void;
};

function FilaBloque({
  bloque: b,
  catalogo,
  refs,
  secciones,
  onIr,
  onTexto,
  onBlurTexto,
  onBorrar,
  onEstado,
  onToggle,
  onLink,
  onDetalle,
}: FilaProps) {
  /**
   * El campo del bloque con su chip de referencia colgado abajo. El formato
   * (negrita, itálica, subrayado, resaltado) se pinta sobre el texto.
   */
  const campo = (placeholder: string, etiqueta: string, className: string) => (
    <div className="min-w-0 flex-1">
      <CampoNota
        valor={b.texto}
        onCambio={onTexto}
        onBlur={onBlurTexto}
        placeholder={placeholder}
        etiqueta={etiqueta}
        className={`${className} ${clasesFmt(b.fmt, b.hecho)}`}
        catalogo={catalogo}
        secciones={secciones}
        onIr={onIr}
      />
      {b.ref && <ChipRef cita={b.ref} catalogo={refs} />}
    </div>
  );

  const detalle = (
    <button
      type="button"
      onClick={onDetalle}
      aria-label="Abrir detalle de la nota"
      className="tactil grid h-11 w-11 shrink-0 cursor-pointer place-items-center text-tx3"
    >
      <span
        aria-hidden
        className="grid h-[34px] w-[26px] place-items-center rounded-lg hover:bg-bor"
      >
        <MoreHorizontal size={15} strokeWidth={2.5} />
      </span>
    </button>
  );

  const controles = (
    <>
      <button
        type="button"
        onClick={onEstado}
        aria-label={`Estado: ${NOMBRE_ESTADO[b.estado]}`}
        title={NOMBRE_ESTADO[b.estado]}
        className="tactil grid h-11 w-8 shrink-0 cursor-pointer place-items-center"
      >
        <span
          aria-hidden
          className="block h-[9px] w-[9px] rounded-full"
          style={{ background: COLOR_ESTADO[b.estado] }}
        />
      </button>
      <button
        type="button"
        onClick={onBorrar}
        aria-label="Borrar bloque"
        className="tactil grid h-11 w-9 shrink-0 cursor-pointer place-items-center rounded-xl text-tx3"
      >
        <X size={15} strokeWidth={2.5} aria-hidden />
      </button>
    </>
  );

  if (b.tipo === 'divisor') {
    return (
      <div className="flex items-center gap-1 py-1">
        <hr className="flex-1 border-0 border-t border-bor" />
        {controles}
      </div>
    );
  }

  if (b.tipo === 'link') {
    return (
      <div className="flex items-start gap-1 py-[3px]">
        <div className="min-w-0 flex-1">
          <BloqueLink bloque={b} onLink={onLink} />
          {b.ref && <ChipRef cita={b.ref} catalogo={refs} />}
        </div>
        <div className="flex items-center">
          {detalle}
          {controles}
        </div>
      </div>
    );
  }

  if (b.tipo === 'ref') {
    const ref = refUnica(b.texto);
    return (
      <div className="flex items-start gap-1 py-[3px]">
        <div className="min-w-0 flex-1">
          {ref ? (
            <CardRef id={ref.id} nombre={ref.nombre} secciones={secciones} onIr={onIr} />
          ) : (
            // Recién creado desde /curso: todavía no eligió qué citar.
            <ElegirRef catalogo={catalogo} onElegir={(item) => onBlurTexto(marcador(item))} />
          )}
          {b.ref && <ChipRef cita={b.ref} catalogo={refs} />}
        </div>
        <div className="flex items-center">
          {detalle}
          {controles}
        </div>
      </div>
    );
  }

  if (b.tipo === 'tarea') {
    return (
      <div className="flex items-start gap-1 py-[4px]">
        <button
          type="button"
          onClick={onToggle}
          aria-label={b.hecho ? 'Desmarcar tarea' : 'Marcar tarea'}
          aria-pressed={b.hecho}
          className="tactil grid h-11 w-8 shrink-0 cursor-pointer place-items-center"
        >
          <span
            aria-hidden
            className={`grid h-5 w-5 place-items-center rounded-[7px] border-2 border-bor2 ${
              b.hecho ? 'bg-bor' : ''
            }`}
          >
            {b.hecho && (
              <span className="font-mono text-[11px] leading-none font-bold text-acc">✓</span>
            )}
          </span>
        </button>
        {campo(
          'To-do… (Enter crea otro)',
          'To-do',
          // El tachado lo pone `clasesFmt`, que sabe combinarlo con el subrayado.
          `mt-[11px] text-[14.5px] leading-normal ${b.hecho ? 'text-tx3' : ''}`
        )}
        <div className="flex items-center">
          {detalle}
          {controles}
        </div>
      </div>
    );
  }

  // texto y titulo
  return (
    <div className="flex items-start gap-1 py-[4px]">
      {b.tipo === 'titulo'
        ? campo('Título…', 'Título', 'mt-[9px] text-[17.5px] leading-[1.35] font-extrabold')
        : campo('Escribí…', 'Texto', 'mt-[11px] text-[14.5px] leading-normal')}
      <div className="flex items-center">
        {detalle}
        {controles}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Buscador que llena un bloque `ref` recién creado con `/curso`. */
function ElegirRef({
  catalogo,
  onElegir,
}: {
  catalogo: ItemCurso[];
  onElegir: (item: ItemCurso) => void;
}) {
  const [consulta, setConsulta] = useState('');
  const opciones = buscarEnCatalogo(catalogo, consulta).slice(0, 6);

  if (catalogo.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-bor bg-sup p-3 text-[13px] text-tx3">
        Esta materia todavía no trajo contenido del aula virtual.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-dashed border-bor bg-sup p-3">
      <input
        value={consulta}
        onChange={(e) => setConsulta(e.target.value)}
        autoFocus
        placeholder="Buscá un TP, un cuestionario, una unidad…"
        aria-label="Buscar en el curso"
        className="min-h-11 w-full rounded-lg border border-bor bg-bg px-3 text-[14px] text-tx"
      />
      {opciones.length === 0 ? (
        <div className="px-1 py-1 text-[13px] text-tx3">No hay nada del curso con eso.</div>
      ) : (
        opciones.map((op) => (
          <button
            key={op.id}
            type="button"
            onClick={() => onElegir(op)}
            className="flex min-h-[44px] w-full cursor-pointer items-center gap-[10px] rounded-[9px] px-1 text-left hover:bg-bor"
          >
            <span
              aria-hidden
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-bor font-mono text-[13px] text-acc"
            >
              {op.tipo === 'unidad' ? '▤' : '▸'}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold text-tx">{op.nombre}</span>
              <span className="kicker mt-[1px] block truncate">
                {op.tipo === 'modulo' && op.unidad ? `${op.unidad} · ` : ''}
                {op.etiqueta}
              </span>
            </span>
          </button>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Link: card punteada con inputs mientras no hay URL; preview cuando la hay. */
function BloqueLink({
  bloque: b,
  onLink,
}: {
  bloque: Bloque;
  onLink: (texto: string, url: string) => void;
}) {
  const [nombre, setNombre] = useState(b.texto);
  const [url, setUrl] = useState(b.url);

  if (b.url) {
    const host = dominio(b.url);
    return (
      <a
        href={b.url}
        target="_blank"
        rel="noopener"
        className="flex min-h-[52px] items-center gap-[10px] rounded-xl border border-bor bg-sup px-3 py-[10px]"
      >
        <span
          aria-hidden
          className="block h-5 w-5 shrink-0 rounded-md bg-bor bg-contain bg-center bg-no-repeat"
          style={{
            backgroundImage: `url(https://www.google.com/s2/favicons?domain=${encodeURIComponent(
              host
            )}&sz=64)`,
          }}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-acc">{b.texto || b.url}</span>
          <span className="mt-[2px] block truncate font-mono text-[11px] text-tx3">{host}</span>
        </span>
        <ArrowUpRight size={14} strokeWidth={2} aria-hidden className="shrink-0 text-tx3" />
      </a>
    );
  }

  const confirmar = () => {
    if (!url.trim()) return;
    onLink(nombre.trim(), url.trim());
  };

  const enter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    confirmar();
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-dashed border-bor bg-sup p-3">
      <input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        onBlur={confirmar}
        onKeyDown={enter}
        placeholder="Nombre del link"
        aria-label="Nombre del link"
        className="min-h-11 w-full rounded-lg border border-bor bg-bg px-3 text-[14px] text-tx"
      />
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onBlur={confirmar}
        onKeyDown={enter}
        placeholder="Pegá el link acá"
        aria-label="URL del link"
        inputMode="url"
        className="min-h-11 w-full rounded-lg border border-bor bg-bg px-3 font-mono text-[13px] text-tx"
      />
    </div>
  );
}
