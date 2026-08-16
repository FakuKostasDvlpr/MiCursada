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

import { ArrowUpRight, ChevronRight, Plus, Search, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react';
import { actualizarBloque, crearBloque, eliminarBloque } from '@/app/actions';
import { agruparPorDia, coincide, type GrupoDia } from '@/lib/bitacora';
import { ESTADOS_BLOQUE, type Bloque, type EstadoBloque, type TipoBloque } from '@/lib/types';

const COLOR_ESTADO: Record<EstadoBloque, string> = {
  pendiente: '#64748b',
  proceso: '#38bdf8',
  listo: '#34d399',
};

const NOMBRE_ESTADO: Record<EstadoBloque, string> = {
  pendiente: 'Por hacer',
  proceso: 'En proceso',
  listo: 'Listo',
};

type Comando = { tipo: TipoBloque; glifo: string; nombre: string; cmd: string };

const COMANDOS: Comando[] = [
  { tipo: 'texto', glifo: 'T', nombre: 'Texto', cmd: '/texto' },
  { tipo: 'titulo', glifo: 'H', nombre: 'Título', cmd: '/titulo' },
  { tipo: 'tarea', glifo: '☑', nombre: 'Tarea', cmd: '/tarea' },
  { tipo: 'link', glifo: '↗', nombre: 'Link', cmd: '/link' },
  { tipo: 'divisor', glifo: '—', nombre: 'Divisor', cmd: '/divisor' },
];

/** Dominio de una URL para el favicon y la subfila mono. */
function dominio(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------

/** Textarea sin borde que crece con el contenido (no scrollea). */
function AutoTextarea(props: React.ComponentProps<'textarea'>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const ajustar = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useLayoutEffect(ajustar, [props.value]);

  return (
    <textarea
      {...props}
      ref={ref}
      rows={1}
      onInput={ajustar}
      className={`w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-tx outline-none ${
        props.className ?? ''
      }`}
    />
  );
}

// ---------------------------------------------------------------------------

type Props = {
  materiaId: string;
  bloques: Bloque[];
};

export function NotasEditor({ materiaId, bloques }: Props) {
  const [items, setItems] = useState<Bloque[]>(bloques);
  const [valor, setValor] = useState('');
  const [error, setError] = useState('');
  const [, startTransition] = useTransition();

  /** Timers de debounce del texto, por bloque. */
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  /** Ediciones de texto sin confirmar: mientras haya, no pisamos con el server. */
  const enVuelo = useRef(0);

  // El server manda bloques nuevos cada vez que una action revalida. Los
  // adoptamos salvo que estemos en medio de una edición de texto.
  useEffect(() => {
    if (enVuelo.current === 0) setItems(bloques);
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
  const opciones = menuAbierto
    ? COMANDOS.filter((c) => c.cmd.slice(1).startsWith(filtro))
    : [];

  const agregar = (tipo: TipoBloque, texto = '') => {
    setError('');
    setValor('');
    correr(() => crearBloque(materiaId, { tipo, texto }));
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
      if (primera) agregar(primera.tipo);
      return;
    }
    const texto = valor.trim();
    if (texto) agregar('texto', texto);
  };

  const botonMas = () => {
    if (menuAbierto) {
      const primera = opciones[0];
      if (primera) agregar(primera.tipo);
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

  const borrar = (id: string) => {
    setError('');
    setItems((prev) => prev.filter((b) => b.id !== id));
    correr(() => eliminarBloque(id));
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
      onTexto={(t) => editarTexto(b.id, t)}
      onBlurTexto={(t) => flush(b.id, { texto: t })}
      onBorrar={() => borrar(b.id)}
      onEstado={() => ciclarEstado(b)}
      onToggle={() => toggleTarea(b)}
      onLink={(texto, url) => guardarLink(b.id, texto, url)}
    />
  );

  return (
    <div className="mt-4">
      {/* Composer */}
      <div className="relative">
        <div className="flex gap-2">
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={enterComposer}
            placeholder="Anotá algo… (tocá / para bloques)"
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

        {/* Menú de comandos */}
        {menuAbierto && opciones.length > 0 && (
          <div className="absolute top-[52px] right-0 left-0 z-10 overflow-hidden rounded-xl border border-bor bg-sup">
            {opciones.map((c) => (
              <button
                key={c.cmd}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => agregar(c.tipo)}
                className="tactil flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left"
              >
                <span
                  aria-hidden
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-bor font-mono text-[13px] text-tx2"
                >
                  {c.glifo}
                </span>
                <span className="flex-1 text-[14px] font-semibold text-tx">{c.nombre}</span>
                <span className="font-mono text-[11px] text-tx3">{c.cmd}</span>
              </button>
            ))}
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
    </div>
  );
}

// ---------------------------------------------------------------------------

type FilaProps = {
  bloque: Bloque;
  onTexto: (texto: string) => void;
  onBlurTexto: (texto: string) => void;
  onBorrar: () => void;
  onEstado: () => void;
  onToggle: () => void;
  onLink: (texto: string, url: string) => void;
};

function FilaBloque({
  bloque: b,
  onTexto,
  onBlurTexto,
  onBorrar,
  onEstado,
  onToggle,
  onLink,
}: FilaProps) {
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
        </div>
        <div className="flex items-center">{controles}</div>
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
        <AutoTextarea
          value={b.texto}
          onChange={(e) => onTexto(e.target.value)}
          onBlur={(e) => onBlurTexto(e.target.value)}
          placeholder="Tarea…"
          aria-label="Tarea"
          className={`mt-[11px] min-w-0 flex-1 text-[14.5px] leading-normal ${
            b.hecho ? 'text-tx3 line-through' : ''
          }`}
        />
        <div className="flex items-center">{controles}</div>
      </div>
    );
  }

  // texto y titulo
  return (
    <div className="flex items-start gap-1 py-[4px]">
      <AutoTextarea
        value={b.texto}
        onChange={(e) => onTexto(e.target.value)}
        onBlur={(e) => onBlurTexto(e.target.value)}
        placeholder={b.tipo === 'titulo' ? 'Título…' : 'Escribí acá…'}
        aria-label={b.tipo === 'titulo' ? 'Título' : 'Texto'}
        className={
          b.tipo === 'titulo'
            ? 'mt-[9px] min-w-0 flex-1 text-[17.5px] leading-[1.35] font-extrabold'
            : 'mt-[11px] min-w-0 flex-1 text-[14.5px] leading-normal'
        }
      />
      <div className="flex items-center">{controles}</div>
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
