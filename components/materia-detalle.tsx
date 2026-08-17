'use client';

import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  ClipboardList,
  Download,
  Eye,
  File,
  FileText,
  Folder,
  HelpCircle,
  Link2,
  MessagesSquare,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { useId, useOptimistic, useState, useTransition } from 'react';
import {
  crearArchivo,
  crearAviso,
  eliminarArchivo,
  eliminarAviso,
  toggleAviso,
} from '@/app/actions';
import { NotasEditor } from '@/components/notas-editor';
import { estadoAviso, hoyISO } from '@/lib/cursada';
import {
  dominio,
  esLista,
  esPdf,
  idLista,
  tamanoLegible,
  tipoArchivo,
  urlArchivo,
  urlEmbed,
  urlYoutube,
} from '@/lib/embebido';
import {
  esManual,
  type ArchivoModulo,
  type Aviso,
  type Materia,
  type ModuloCurso,
  type Seccion,
} from '@/lib/types';

/** 'YYYY-MM-DD' → 'dd/mm'. */
const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

type Tab = 'curso' | 'notas' | 'archivos' | 'avisos';

type Props = {
  materia: Materia;
  /** Avisos de esta materia, ordenados por fecha ascendente. */
  avisos: Aviso[];
};

const claseInput =
  'w-full min-h-[46px] rounded-xl border border-bor bg-sup px-[14px] text-[14.5px] text-tx';

const claseVacio =
  'mt-[14px] rounded-[14px] border border-dashed border-bor p-5 text-center text-[13.5px] text-tx3';

/** Tabs del detalle de materia: Curso (las unidades del aula virtual), Notas
 *  (editor de bloques con menú de comandos), Archivos (alta inline + lista) y
 *  Avisos (alta inline + lista con toggle). */
export function MateriaDetalle({ materia, avisos }: Props) {
  const [tab, setTab] = useState<Tab>('curso');

  const secciones = materia.secciones ?? [];
  const modulos = secciones.reduce((n, s) => n + s.modulos.length, 0);
  const notas = materia.bloques.filter((b) => b.tipo !== 'divisor').length;
  const pendientes = avisos.filter((a) => !a.hecho).length;

  const tabs: { id: Tab; label: string; n: number }[] = [
    { id: 'curso', label: 'Curso', n: modulos },
    { id: 'notas', label: 'Notas', n: notas },
    { id: 'archivos', label: 'Archivos', n: materia.archivos.length },
    { id: 'avisos', label: 'Avisos', n: pendientes },
  ];

  return (
    <>
      <div className="mt-6 flex border-b border-bor">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={`-mb-px min-h-12 flex-1 cursor-pointer border-b-2 px-1 py-3 text-[13.5px] font-bold ${
              tab === t.id ? 'border-acc text-acc' : 'border-transparent text-tx3'
            }`}
          >
            {t.label} <span className="font-mono text-[11px] opacity-85">{t.n}</span>
          </button>
        ))}
      </div>

      {tab === 'curso' && <TabCurso secciones={secciones} />}
      {tab === 'notas' && <NotasEditor materiaId={materia.id} bloques={materia.bloques} />}
      {tab === 'archivos' && <TabArchivos materia={materia} />}
      {tab === 'avisos' && <TabAvisos materiaId={materia.id} avisos={avisos} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Curso — las unidades del aula virtual con sus materiales
// ---------------------------------------------------------------------------

/** Ícono por `modname` de Moodle. Lo que no reconocemos cae en File. */
const ICONO_MODULO: Record<string, LucideIcon> = {
  resource: FileText,
  page: FileText,
  url: Link2,
  assign: ClipboardList,
  quiz: HelpCircle,
  forum: MessagesSquare,
  lesson: BookOpen,
  folder: Folder,
};

/**
 * Con pocas unidades se ven todas de una; a partir de acá se abre solo la
 * primera, para que la pantalla no arranque con una lista interminable.
 */
const MAX_TODAS_ABIERTAS = 3;

/**
 * Las unidades del aula virtual, con cada módulo desplegable para LEER el
 * material adentro de la app (el contenido ya viene sanitizado en el snapshot,
 * así que abrir es instantáneo y anda sin conexión; solo los archivos salen a
 * la red al tocar "Ver"/"Descargar").
 *
 * DECISIÓN: un solo módulo abierto a la vez en toda la tab. A 390px un módulo
 * desplegado ocupa media pantalla o más (un video 16:9 son ~220px y el visor de
 * PDF 70vh), así que permitir varios abiertos convertiría la lista en un scroll
 * infinito donde no se encuentra nada. Las UNIDADES sí admiten varias abiertas:
 * plegadas son una sola línea y sirven de índice.
 */
function TabCurso({ secciones }: { secciones: Seccion[] }) {
  const idBase = useId();
  const [abiertas, setAbiertas] = useState<ReadonlySet<number>>(() =>
    secciones.length <= MAX_TODAS_ABIERTAS
      ? new Set(secciones.map((_, i) => i))
      : new Set(secciones.length > 0 ? [0] : [])
  );
  const [moduloAbierto, setModuloAbierto] = useState<string | null>(null);

  const alternar = (i: number) =>
    setAbiertas((prev) => {
      const proximo = new Set(prev);
      if (!proximo.delete(i)) proximo.add(i);
      return proximo;
    });

  if (secciones.length === 0) {
    return <div className={claseVacio}>Todavía no hay contenido cargado en el aula virtual.</div>;
  }

  return (
    <div className="mt-4">
      <div className="font-mono text-[11px] text-tx3">Tocá un material para leerlo acá</div>

      <div className="mt-3 flex flex-col gap-3">
        {secciones.map((s, i) => {
          const abierta = abiertas.has(i);
          const idPanel = `${idBase}-seccion-${i}`;
          return (
            <section key={`${s.nombre}-${i}`}>
              <button
                type="button"
                onClick={() => alternar(i)}
                aria-expanded={abierta}
                aria-controls={idPanel}
                className="flex min-h-[44px] w-full cursor-pointer items-center gap-2 py-2 text-left"
              >
                <span className="kicker min-w-0 flex-1 truncate">{s.nombre || 'Sin título'}</span>
                <span className="font-mono text-[11px] text-tx3">{s.modulos.length}</span>
                <ChevronDown
                  size={15}
                  strokeWidth={2}
                  aria-hidden
                  className={`shrink-0 text-tx3 ${abierta ? 'rotate-180' : ''}`}
                />
              </button>

              <div id={idPanel} hidden={!abierta} className="flex flex-col gap-2">
                {s.modulos.map((m) => (
                  <ModuloAcordeon
                    key={m.id}
                    modulo={m}
                    abierto={moduloAbierto === m.id}
                    onAlternar={() => setModuloAbierto((prev) => (prev === m.id ? null : m.id))}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Link chico "Ver en el aula virtual", presente en TODO módulo desplegado. */
function LinkAula({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 self-start font-mono text-[11px] text-tx3"
    >
      Ver en el aula virtual
      <ArrowUpRight size={12} strokeWidth={2} aria-hidden />
    </a>
  );
}

/** Cabecera clickeable + panel con el material del módulo. */
function ModuloAcordeon({
  modulo,
  abierto,
  onAlternar,
}: {
  modulo: ModuloCurso;
  abierto: boolean;
  onAlternar: () => void;
}) {
  const idPanel = `${useId()}-mod`;
  const Icono = ICONO_MODULO[modulo.tipo] ?? File;
  const archivos = modulo.archivos ?? [];
  const hayAlgo = Boolean(modulo.html || modulo.video || modulo.enlace || archivos.length > 0);

  return (
    <div className="rounded-[13px] border border-bor bg-sup">
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={abierto}
        aria-controls={idPanel}
        className="flex min-h-[54px] w-full cursor-pointer items-start gap-3 px-[14px] py-3 text-left"
      >
        <Icono size={16} strokeWidth={2} aria-hidden className="mt-[2px] shrink-0 text-tx3" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-acc">{modulo.nombre}</span>
          {/* line-clamp-2 ya pone display:-webkit-box: sumarle `block` lo pisa
              y la descripción se vería entera. */}
          {modulo.descripcion && !abierto && (
            <span className="mt-[3px] line-clamp-2 text-[13px] leading-[1.45] text-tx2">
              {modulo.descripcion}
            </span>
          )}
        </span>
        <ChevronDown
          size={15}
          strokeWidth={2}
          aria-hidden
          className={`mt-[2px] shrink-0 text-tx3 ${abierto ? 'rotate-180' : ''}`}
        />
      </button>

      <div
        id={idPanel}
        hidden={!abierto}
        className="flex flex-col gap-3 border-t border-bor px-[14px] py-3"
      >
        {modulo.html && (
          // Sanitizado en el server con whitelist (lib/moodle/contenido.ts):
          // sin script, sin on*, sin javascript: y solo iframes de YouTube
          // (nocookie) o Vimeo. El cliente NO vuelve a sanitizar.
          <div className="prosa" dangerouslySetInnerHTML={{ __html: modulo.html }} />
        )}

        {modulo.video && <Video video={modulo.video} html={modulo.html ?? ''} />}

        {archivos.map((a) => (
          <ArchivoEmbebido key={a.ref} archivo={a} />
        ))}

        {modulo.enlace && (
          <a
            href={modulo.enlace}
            target="_blank"
            rel="noopener noreferrer"
            className="tactil flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-acc-bg px-4 text-sm font-bold !text-acc-fg"
          >
            Abrir enlace
            <span className="font-mono text-[11px] font-semibold opacity-80">
              {dominio(modulo.enlace)}
            </span>
            <ArrowUpRight size={14} strokeWidth={2.5} aria-hidden className="shrink-0" />
          </a>
        )}

        {!hayAlgo && (
          <p className="text-[13px] leading-[1.5] text-tx2">
            Este material se abre en el aula virtual.
          </p>
        )}

        <LinkAula url={modulo.url} />
      </div>
    </div>
  );
}

/** Reproductor 16:9 de youtube-nocookie (o el link, si es una playlist). */
function Video({ video, html }: { video: string; html: string }) {
  const lista = esLista(video);
  // Si el html ya trae ESE player (venía como iframe o como link de video que
  // el sanitizador convirtió) no lo repetimos.
  if (html.includes(lista ? `list=${idLista(video)}` : `/embed/${video}`)) return null;

  return (
    <div className="flex flex-col gap-2">
      <iframe
        src={urlEmbed(video)}
        title={lista ? 'Lista de reproducción de YouTube' : 'Video de YouTube'}
        allowFullScreen
        className="aspect-video w-full rounded-xl border-0 bg-bg"
      />
      <a
        href={urlYoutube(video)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 self-start font-mono text-[11px] text-tx3"
      >
        {lista ? 'Abrir la lista en YouTube' : 'Abrir en YouTube'}
        <ArrowUpRight size={12} strokeWidth={2} aria-hidden />
      </a>
    </div>
  );
}

/**
 * Un archivo del módulo: nombre, "PDF · 161 KB" y los botones. Los PDFs se
 * previsualizan en un visor embebido; el resto solo se descarga (un .zip o un
 * .docx en un iframe no muestra nada).
 */
function ArchivoEmbebido({ archivo }: { archivo: ArchivoModulo }) {
  const [viendo, setViendo] = useState(false);
  const idVisor = `${useId()}-visor`;
  const url = urlArchivo(archivo.ref);
  const pdf = esPdf(archivo.mime, archivo.nombre);
  const tamano = tamanoLegible(archivo.tamano);

  return (
    <div className="rounded-xl border border-bor bg-bg p-[10px]">
      <div className="flex min-w-0 items-start gap-2">
        <FileText size={15} strokeWidth={2} aria-hidden className="mt-[3px] shrink-0 text-tx3" />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] leading-[1.35] font-semibold break-words text-tx">
            {archivo.nombre}
          </div>
          <div className="mt-[2px] font-mono text-[11px] text-tx3">
            {tipoArchivo(archivo.mime, archivo.nombre)}
            {tamano && ` · ${tamano}`}
          </div>
        </div>
      </div>
      <div className="mt-[10px] flex flex-wrap gap-2">
        {pdf && (
          <button
            type="button"
            onClick={() => setViendo((v) => !v)}
            aria-expanded={viendo}
            aria-controls={idVisor}
            className="tactil flex min-h-[38px] cursor-pointer items-center gap-[6px] rounded-xl bg-acc-bg px-3 text-[12.5px] font-bold text-acc-fg"
          >
            <Eye size={13} strokeWidth={2.5} aria-hidden />
            {viendo ? 'Cerrar' : 'Ver'}
          </button>
        )}
        <a
          href={url}
          download={archivo.nombre}
          className="tactil flex min-h-[38px] items-center gap-[6px] rounded-xl border border-bor2 px-3 text-[12.5px] font-bold !text-tx2"
        >
          <Download size={13} strokeWidth={2.5} aria-hidden />
          Descargar
        </a>
      </div>
      {pdf && (
        <div id={idVisor} hidden={!viendo} className="mt-[10px]">
          {viendo && (
            <iframe
              src={url}
              title={archivo.nombre}
              className="h-[70vh] w-full rounded-xl border border-bor bg-sup"
            />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Archivos — alta inline + lista de links
// ---------------------------------------------------------------------------

function TabArchivos({ materia }: { materia: Materia }) {
  const [nombre, setNombre] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const agregar = async () => {
    setGuardando(true);
    setError('');
    const resultado = await crearArchivo(materia.id, { nombre: nombre.trim(), url: url.trim() });
    setGuardando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setNombre('');
    setUrl('');
  };

  const borrar = async (id: string) => {
    setError('');
    const resultado = await eliminarArchivo(id);
    if (!resultado.ok) setError(resultado.error);
  };

  return (
    <div className="mt-4">
      <div className="flex flex-col gap-2">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre (ej: Guía 5 PDF)"
          className={claseInput}
        />
        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Pegá el link acá"
            className={`${claseInput} min-w-0 flex-1`}
          />
          <button
            type="button"
            onClick={agregar}
            disabled={guardando}
            className="min-h-[46px] shrink-0 cursor-pointer rounded-xl bg-acc-bg px-4 text-sm font-bold text-acc-fg disabled:opacity-60"
          >
            Agregar
          </button>
        </div>
        {error && <div className="text-[13px] text-vencido">{error}</div>}
      </div>

      {materia.archivos.length === 0 ? (
        <div className={claseVacio}>
          Sin archivos todavía. Guardá los PDFs y links de la materia acá.
        </div>
      ) : (
        <div className="mt-[14px] flex flex-col gap-2">
          {materia.archivos.map((f) => (
            <div
              key={f.id}
              className="flex min-h-[54px] items-center rounded-xl border border-bor bg-sup"
            >
              <a
                href={f.url}
                target="_blank"
                rel="noopener"
                className="flex min-w-0 flex-1 items-center gap-3 px-[14px] py-3"
              >
                <FileText size={16} strokeWidth={2} aria-hidden className="shrink-0 text-tx3" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-acc">{f.nombre}</span>
                  <span className="mt-[2px] block truncate font-mono text-[11px] text-tx3">
                    {f.url}
                  </span>
                </span>
                <ArrowUpRight size={15} strokeWidth={2} aria-hidden className="shrink-0 text-tx3" />
              </a>
              {/* Los archivos del aula virtual los regenera el sync: no se borran. */}
              {esManual(f.id) && (
                <button
                  type="button"
                  onClick={() => borrar(f.id)}
                  aria-label={`Eliminar ${f.nombre}`}
                  className="tactil mr-[6px] grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-xl text-tx3"
                >
                  <Trash2 size={15} strokeWidth={2} aria-hidden />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Avisos — alta inline + lista (sin subfila de materia), hechos al final
// ---------------------------------------------------------------------------

function TabAvisos({ materiaId, avisos }: { materiaId: string; avisos: Aviso[] }) {
  const [titulo, setTitulo] = useState('');
  const [fecha, setFecha] = useState(() => hoyISO(new Date()));
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const [, startTransition] = useTransition();
  const [optimistas, aplicar] = useOptimistic(
    avisos,
    (prev, cambio: { id: string; hecho: boolean }) =>
      prev.map((a) => (a.id === cambio.id ? { ...a, hecho: cambio.hecho } : a))
  );

  const ahora = new Date();
  const pendientes = optimistas.filter((a) => !a.hecho);
  const hechos = optimistas.filter((a) => a.hecho).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

  const alternar = (aviso: Aviso) => {
    startTransition(async () => {
      aplicar({ id: aviso.id, hecho: !aviso.hecho });
      await toggleAviso(aviso.id, !aviso.hecho);
    });
  };

  const agregar = async () => {
    if (!titulo.trim() || !fecha) {
      setError('Poné un título y una fecha.');
      return;
    }
    setGuardando(true);
    setError('');
    const resultado = await crearAviso({ titulo: titulo.trim(), materiaId, fecha });
    setGuardando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setTitulo('');
    setFecha(hoyISO(new Date()));
  };

  const borrar = async (id: string) => {
    setError('');
    const resultado = await eliminarAviso(id);
    if (!resultado.ok) setError(resultado.error);
  };

  const fila = (a: Aviso, hecho: boolean) => {
    const estado = estadoAviso(a, ahora);
    return (
      <div
        key={a.id}
        className={`flex min-h-[54px] items-center rounded-[13px] border border-bor bg-sup ${
          hecho ? 'opacity-50' : ''
        }`}
      >
      <button
        type="button"
        onClick={() => alternar(a)}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-[14px] py-[10px] text-left text-tx"
      >
        {hecho ? (
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-bor2 bg-bor2">
            <Check size={11} strokeWidth={3.5} aria-hidden className="text-sup" />
          </span>
        ) : (
          <span aria-hidden className="h-5 w-5 shrink-0 rounded-full border-2 border-bor2" />
        )}
        <span
          className={`min-w-0 flex-1 truncate text-[14.5px] font-semibold ${
            hecho ? 'line-through' : ''
          }`}
        >
          {a.titulo}
        </span>
        <span
          className={`font-mono text-xs whitespace-nowrap ${
            !hecho && estado === 'vencido'
              ? 'text-vencido'
              : !hecho && estado === 'hoy'
                ? 'text-acc'
                : 'text-tx3'
          }`}
        >
          {ddmm(a.fecha)}
          {!hecho && (estado === 'vencido' ? ' · vencido' : estado === 'hoy' ? ' · hoy' : '')}
        </span>
      </button>
        {/* Los avisos del aula virtual los regenera el sync: no se borran. */}
        {esManual(a.id) && (
          <button
            type="button"
            onClick={() => borrar(a.id)}
            aria-label={`Eliminar ${a.titulo}`}
            className="tactil mr-[6px] grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-xl text-tx3"
          >
            <Trash2 size={15} strokeWidth={2} aria-hidden />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="mt-4">
      <div className="flex flex-col gap-2">
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Título (ej: Entrega del TP)"
          className={claseInput}
        />
        <div className="flex gap-2">
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            aria-label="Fecha"
            className="min-h-[46px] min-w-0 flex-1 rounded-xl border border-bor bg-sup px-[14px] font-mono text-sm text-tx"
          />
          <button
            type="button"
            onClick={agregar}
            disabled={guardando}
            className="min-h-[46px] shrink-0 cursor-pointer rounded-xl bg-acc-bg px-4 text-sm font-bold text-acc-fg disabled:opacity-60"
          >
            Agregar
          </button>
        </div>
        {error && <div className="text-[13px] text-vencido">{error}</div>}
      </div>

      {pendientes.length === 0 ? (
        <div className={claseVacio}>Nada pendiente para esta materia.</div>
      ) : (
        <div className="mt-[14px] flex flex-col gap-2">{pendientes.map((a) => fila(a, false))}</div>
      )}

      {hechos.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">{hechos.map((a) => fila(a, true))}</div>
      )}
    </div>
  );
}
