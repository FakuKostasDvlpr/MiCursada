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
  Image as ImageIcon,
  Link2,
  MessagesSquare,
  Play,
  Trash2,
  Video as VideoIcon,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useId, useOptimistic, useRef, useState, useTransition } from 'react';
import {
  crearArchivo,
  crearAviso,
  crearBloque,
  eliminarArchivo,
  eliminarAviso,
  toggleAviso,
} from '@/app/actions';
import { useRouter, useSearchParams } from 'next/navigation';
import { Cargando } from '@/components/cargando';
import { NotasEditor } from '@/components/notas-editor';
import { estadoAviso, hoyISO } from '@/lib/cursada';
import { EVENTO_NOTA_CREADA } from '@/lib/logro';
import { marcador } from '@/lib/referencias';
import {
  dominio,
  esLista,
  miniaturaYoutube,
  playerEnHtml,
  tamanoLegible,
  tipoArchivo,
  tipoVisor,
  urlArchivo,
  urlEmbed,
  urlYoutube,
  type Visor,
} from '@/lib/embebido';
import {
  esManual,
  type ArchivoModulo,
  type Aviso,
  type Materia,
  type ModuloCurso,
  type Requisito,
  type Seccion,
} from '@/lib/types';

/** 'YYYY-MM-DD' → 'dd/mm'. */
const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

type Tab = 'curso' | 'notas' | 'archivos' | 'avisos';

type Props = {
  materia: Materia;
  /** Avisos de esta materia, ordenados por fecha ascendente. */
  avisos: Aviso[];
  /** Todas las materias: lo que se puede citar con `@` además del curso. */
  materiasRef?: { id: string; nombre: string; color: string }[];
  /** Todos los avisos de la cursada: `catalogoRefs` filtra los pendientes. */
  avisosRef?: Aviso[];
  /** Hoy en Buenos Aires ('YYYY-MM-DD'), calculado en el server. */
  hoyIso: string;
};

const claseInput =
  'w-full min-h-[46px] rounded-xl border border-bor bg-sup px-[14px] text-[14.5px] text-tx';

const claseVacio =
  'mt-[14px] rounded-[14px] border border-dashed border-bor p-5 text-center text-[13.5px] text-tx3';

/** Rótulo de un campo del alta inline: chico, en mayúsculas, como los kickers. */
const claseLabel = 'kicker';

// Defaults de props a nivel de módulo: un `[]` literal en la firma es un array
// NUEVO en cada render, así que los hijos memoizados se redibujan al vicio.
const SIN_MATERIAS: { id: string; nombre: string; color: string }[] = [];
const SIN_AVISOS: Aviso[] = [];

/** Tabs del detalle de materia: Curso (las unidades del aula virtual), Notas
 *  (editor de bloques con menú de comandos), Archivos (alta inline + lista) y
 *  Avisos (alta inline + lista con toggle). */
export function MateriaDetalle({
  materia,
  avisos,
  materiasRef = SIN_MATERIAS,
  avisosRef = SIN_AVISOS,
  hoyIso,
}: Props) {
  const router = useRouter();
  // Deep-links de la URL (los usa el grafo, entre otros): `?nota=` cae en la
  // tab Notas (el resalte lo hace NotasEditor), `?modulo=` abre ese módulo en
  // Curso y `?tab=` elige una tab directamente.
  const paramsUrl = useSearchParams();
  const moduloUrl = paramsUrl.get('modulo');
  const tabUrl = paramsUrl.get('tab');
  const [tab, setTab] = useState<Tab>(() => {
    if (paramsUrl.get('nota')) return 'notas';
    if (moduloUrl) return 'curso';
    if (tabUrl === 'notas' || tabUrl === 'archivos' || tabUrl === 'avisos') return tabUrl;
    return 'curso';
  });
  /**
   * Pedido de abrir un módulo en la tab Curso (de una nota o de la URL).
   *
   * Es un OBJETO y no el id pelado: cada pedido es una identidad nueva, así que
   * tocar dos veces la misma referencia vuelve a abrir el módulo sin que el
   * hijo tenga que avisar "ya lo atendí" (ese aviso era un efecto que llamaba a
   * un callback del padre). Se limpia acá, en el click de las tabs.
   */
  const [pedidoModulo, setPedidoModulo] = useState<{ id: string } | null>(() =>
    moduloUrl ? { id: moduloUrl } : null
  );

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
            onClick={() => {
              // Cambiar de tab a mano descarta el pedido pendiente: volver a
              // Curso desde acá muestra la lista plegada, como siempre.
              setPedidoModulo(null);
              setTab(t.id);
            }}
            aria-pressed={tab === t.id}
            className={`-mb-px min-h-12 flex-1 cursor-pointer border-b-2 px-1 py-3 text-[13.5px] font-bold ${
              tab === t.id ? 'border-acc text-acc' : 'border-transparent text-tx3'
            }`}
          >
            {t.label} <span className="font-mono text-[11px] opacity-85">{t.n}</span>
          </button>
        ))}
      </div>

      {tab === 'curso' && (
        <TabCurso secciones={secciones} materiaId={materia.id} pedidoModulo={pedidoModulo} />
      )}
      {tab === 'notas' && (
        <NotasEditor
          materiaId={materia.id}
          bloques={materia.bloques}
          secciones={secciones}
          materias={materiasRef}
          avisos={avisosRef}
          hoyIso={hoyIso}
          // El "Ver" de un aviso ya creado: lo lleva a la pantalla de Avisos.
          // El modal grande del aviso todavía no existe (spec 3).
          onVerAvisos={() => router.push('/avisos')}
          // Tocar una referencia en una nota abre ese módulo en la tab Curso.
          onIrAModulo={(id) => {
            setPedidoModulo({ id });
            setTab('curso');
          }}
        />
      )}
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
 * Chip "Hecho" al lado del nombre del material.
 *
 * Ámbar de fondo con texto oscuro: es el pill primario del handoff
 * (`--acc-bg` / `--acc-fg`), idéntico en tema claro y oscuro.
 */
function PillHecho() {
  return (
    <span className="ml-2 inline-flex translate-y-[-1px] items-center gap-1 rounded-full bg-acc-bg px-[7px] py-[2px] align-middle text-[10.5px] leading-none font-extrabold tracking-[0.04em] text-acc-fg uppercase">
      <Check size={10} strokeWidth={3.5} aria-hidden />
      Hecho
    </span>
  );
}

/**
 * El punto de finalización, igual que en el índice del aula virtual: relleno
 * cuando ya lo hiciste, contorno vacío cuando falta.
 *
 * DECISIÓN: se muestran los DOS estados, no solo lo hecho — un círculo vacío te
 * dice "esto te falta", que es la mitad de la información. Sin seguimiento no
 * se dibuja nada (lo decide quien lo renderiza): ahí "pendiente" no
 * significaría nada.
 */
function PuntoFinalizacion({ hecho, activo }: { hecho: boolean; activo: boolean }) {
  return (
    <span className="mt-[4px] flex items-center">
      <span
        aria-hidden
        className={`block h-[10px] w-[10px] rounded-full border-2 ${
          hecho ? 'border-acc bg-acc' : 'border-bor2'
        } ${activo ? 'ring-2 ring-acc/40' : ''}`}
      />
      {/* Lo que el lector de pantalla anuncia del botón. "Pendiente" no tiene
          chip que lo diga, y lo hecho igual necesita nombrar la acción. */}
      <span className="sr-only">
        {hecho ? 'Hecho' : 'Pendiente'} — {activo ? 'ocultar' : 'ver'} el detalle
      </span>
    </span>
  );
}

/** Las condiciones de finalización, con su tilde o su círculo. */
function ListaRequisitos({ requisitos }: { requisitos: Requisito[] }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1">
      {requisitos.map((r) => (
        <li
          key={r.texto}
          className={`flex items-center gap-[5px] text-[12px] ${
            r.cumplido ? 'text-acc' : 'text-tx3'
          }`}
        >
          {r.cumplido ? (
            <Check size={12} strokeWidth={3} aria-hidden />
          ) : (
            <span aria-hidden className="block h-[8px] w-[8px] rounded-full border-2 border-bor2" />
          )}
          {r.texto}
          <span className="sr-only">{r.cumplido ? '(cumplido)' : '(pendiente)'}</span>
        </li>
      ))}
    </ul>
  );
}

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
function TabCurso({
  secciones,
  materiaId,
  pedidoModulo = null,
}: {
  secciones: Seccion[];
  materiaId: string;
  /**
   * Módulo a abrir al entrar (lo pide una referencia de una nota o la URL).
   * Cada pedido es un objeto nuevo: alcanza con comparar identidades para
   * saber si hay uno sin atender, sin devolverle nada al padre.
   */
  pedidoModulo?: { id: string } | null;
}) {
  const idBase = useId();
  // Todo plegado al entrar: las unidades cerradas son el índice del curso, y
  // el deep-link (?modulo= o una referencia de nota) abre la suya solo.
  const [abiertas, setAbiertas] = useState<ReadonlySet<number>>(() => new Set());
  const [moduloAbierto, setModuloAbierto] = useState<string | null>(null);
  const refModulo = useRef<HTMLDivElement>(null);

  // Vino de una nota: se abre la unidad y se despliega el módulo. Se ajusta
  // DURANTE el render comparando con el pedido anterior guardado en estado, no
  // en un efecto: con un efecto se pintaba un frame con la lista todavía
  // plegada antes de abrirse (react.dev/learn/you-might-not-need-an-effect).
  const [atendido, setAtendido] = useState<{ id: string } | null>(null);
  if (pedidoModulo !== atendido) {
    setAtendido(pedidoModulo);
    if (pedidoModulo) {
      const id = pedidoModulo.id;
      const i = secciones.findIndex((s) => s.modulos.some((m) => m.id === id));
      const esUnidad = id.startsWith('sec:');
      const indiceUnidad = esUnidad ? Number(id.slice(4)) : i;
      if (indiceUnidad >= 0) setAbiertas((prev) => new Set(prev).add(indiceUnidad));
      setModuloAbierto(esUnidad ? null : id);
    }
  }

  // El scroll va en su propio efecto: recién después de que el módulo se abrió.
  useEffect(() => {
    if (!moduloAbierto) return;
    refModulo.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [moduloAbierto]);

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
            // Una unidad de Moodle NO tiene id: su identidad en toda la app ES el índice
            // (las notas la citan como `sec:{indice}`, ver lib/referencias.ts, y el
            // estado `abiertas` es un Set de índices). La lista es el `secciones` del
            // snapshot renderizado tal cual: no se filtra, no se ordena y no se
            // reordena en el cliente, así que el índice es estable.
            // react-doctor-disable-next-line react-doctor/no-array-index-as-key
            <section key={`${s.nombre}-${i}`}>
              <button
                type="button"
                onClick={() => alternar(i)}
                aria-expanded={abierta}
                aria-controls={idPanel}
                className="flex min-h-[44px] w-full cursor-pointer items-center gap-2 py-2 text-left"
              >
                <span className="kicker min-w-0 flex-1 truncate">{s.nombre || 'Sin título'}</span>
                {(() => {
                  // "2/5" solo si la unidad tiene algún módulo con seguimiento;
                  // si el profe no lo usa, se sigue viendo el total pelado.
                  const conSeguimiento = s.modulos.filter((m) => m.hecho !== undefined);
                  const hechos = conSeguimiento.filter((m) => m.hecho).length;
                  return conSeguimiento.length > 0 ? (
                    <span
                      className={`font-mono text-[11px] ${hechos > 0 ? 'text-acc' : 'text-tx3'}`}
                      title={`${hechos} de ${conSeguimiento.length} hechas`}
                    >
                      {hechos}/{conSeguimiento.length}
                    </span>
                  ) : (
                    <span className="font-mono text-[11px] text-tx3">{s.modulos.length}</span>
                  );
                })()}
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
                    unidad={s.nombre}
                    materiaId={materiaId}
                    abierto={moduloAbierto === m.id}
                    anclaRef={moduloAbierto === m.id ? refModulo : undefined}
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
  unidad,
  materiaId,
  abierto,
  anclaRef,
  onAlternar,
}: {
  modulo: ModuloCurso;
  unidad: string;
  materiaId: string;
  abierto: boolean;
  /** Se lo pone el módulo al que hay que scrollear al venir de una nota. */
  anclaRef?: React.RefObject<HTMLDivElement | null>;
  onAlternar: () => void;
}) {
  const idBase = useId();
  const idPanel = `${idBase}-mod`;
  const idEstado = `${idBase}-estado`;
  /** Detalle de finalización abierto (se despliega al tocar el punto). */
  const [verEstado, setVerEstado] = useState(false);
  const Icono = ICONO_MODULO[modulo.tipo] ?? File;
  const archivos = modulo.archivos ?? [];
  // Si el html del profe ya trae ese player, no se repite la celda.
  const hayVideo = Boolean(modulo.video) && !playerEnHtml(modulo.video ?? '', modulo.html ?? '');
  const hayAlgo = Boolean(modulo.html || modulo.video || modulo.enlace || archivos.length > 0);

  return (
    <div ref={anclaRef} className="rounded-[13px] border border-bor bg-sup">
      {/* El punto es su PROPIO botón, hermano del acordeón y no hijo: un
          <button> adentro de otro <button> es HTML inválido y el navegador lo
          desarma. Por eso la fila es un flex con los dos al lado. */}
      <div className="flex items-start">
        {modulo.hecho !== undefined && (
          <button
            type="button"
            onClick={() => setVerEstado((v) => !v)}
            aria-expanded={verEstado}
            aria-controls={idEstado}
            className="tactil flex min-h-[54px] shrink-0 cursor-pointer items-start py-3 pl-[14px] pr-0"
          >
            <PuntoFinalizacion hecho={modulo.hecho} activo={verEstado} />
          </button>
        )}
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={abierto}
          aria-controls={idPanel}
          className={`flex min-h-[54px] flex-1 cursor-pointer items-start gap-3 py-3 pr-[14px] text-left ${
            modulo.hecho === undefined ? 'pl-[14px]' : 'pl-[10px]'
          }`}
        >
          <Icono size={16} strokeWidth={2} aria-hidden className="mt-[2px] shrink-0 text-tx3" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-acc">
              {modulo.nombre}
              {/* Badge VISIBLE y no un tooltip: el `title` nativo tarda ~1s, no
                  existe en touch y obliga a apuntarle fino. Solo va en lo hecho
                  — ponerle "Pendiente" a los otros 220 sería ruido, y para eso
                  ya está el círculo vacío. */}
              {modulo.hecho === true && <PillHecho />}
            </span>
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
      </div>

      {/* Detalle del estado, desplegado por CLICK en el punto. Va inline y no
          flotando: un popover absoluto se recorta contra el borde de la tarjeta
          y en móvil termina medio afuera de la pantalla. */}
      {modulo.hecho !== undefined && verEstado && (
        <div id={idEstado} className="border-t border-bor px-[14px] py-[10px]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-[6px]">
            <span
              className={`kicker ${modulo.hecho ? 'text-acc' : 'text-tx3'}`}
            >
              {modulo.hecho ? 'Ya lo hiciste' : 'Todavía te falta'}
            </span>
            {modulo.requisitos && modulo.requisitos.length > 0 && (
              <ListaRequisitos requisitos={modulo.requisitos} />
            )}
          </div>
          {(!modulo.requisitos || modulo.requisitos.length === 0) && (
            <p className="mt-1 text-[12px] text-tx3">
              El aula virtual no dice qué condición usa para este material.
            </p>
          )}
          <p className="mt-[6px] text-[12px] text-tx3">
            Lo marca el aula virtual sola. Abrirlo acá no lo tilda.
          </p>
        </div>
      )}

      <div
        id={idPanel}
        hidden={!abierto}
        className="flex flex-col gap-3 border-t border-bor px-[14px] py-3"
      >
        {/* Los requisitos NO se repiten acá: viven en el detalle del punto, que
            se abre con un click y no obliga a desplegar el material entero. */}

        {modulo.html && (
          // Sanitizado en el server con whitelist (lib/moodle/contenido.ts):
          // sin script, sin on*, sin javascript: y solo iframes de YouTube
          // (nocookie) o Vimeo. El cliente NO vuelve a sanitizar.
          <div className="prosa" dangerouslySetInnerHTML={{ __html: modulo.html }} />
        )}

        {(hayVideo || archivos.length > 0) && (
          // Bento: los archivos van en grilla y no apilados. Una materia con 17
          // adjuntos, cada uno a ancho completo y a su alto natural, era un
          // scroll de varias pantallas. `auto-fill` decide solo cuántas
          // columnas entran, así que es la misma grilla en 390px y en desktop.
          // El mínimo baja en móvil a propósito: con 190px a 390px de ancho
          // entraba UNA sola columna y 23 adjuntos daban 9000px de scroll. Con
          // 148px entran dos, y en desktop siguen entrando cuatro.
          <div className="grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-2 min-[641px]:grid-cols-[repeat(auto-fill,minmax(190px,1fr))]">
            {/* El video de YouTube es una celda más de la grilla, al lado de las
                imágenes: antes iba suelto a ancho completo arriba y rompía la
                lectura del módulo. */}
            {hayVideo && modulo.video && <VideoCelda video={modulo.video} />}
            {archivos.map((a) => (
              // `abierto` NO es cosmético: el panel se renderiza siempre (con
              // `hidden`), así que sin esto las 35 imágenes y los 26 videos del
              // aula saldrían a pedirse por el proxy apenas se abre la materia.
              <ArchivoEmbebido key={a.ref} archivo={a} activo={abierto} />
            ))}
          </div>
        )}

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

        <div className="flex flex-wrap items-center gap-2">
          <LinkAula url={modulo.url} />
          <AccionesNota modulo={modulo} unidad={unidad} materiaId={materiaId} />
        </div>
      </div>
    </div>
  );
}

/**
 * Mandar un módulo a las notas sin salir del curso: "Anotar" lo deja como
 * bloque `ref`, "Realizar" como tarea en Por hacer. Las dos guardan el marcador
 * de lib/referencias.ts, así que después se ven como chip/card y linkean acá.
 */
function AccionesNota({
  modulo,
  unidad,
  materiaId,
}: {
  modulo: ModuloCurso;
  unidad: string;
  materiaId: string;
}) {
  const [hecho, setHecho] = useState<'nota' | 'tarea' | null>(null);
  const [pendiente, empezar] = useTransition();

  const mandar = (tipo: 'ref' | 'tarea') => {
    const marca = marcador({ id: modulo.id, nombre: modulo.nombre });
    empezar(async () => {
      const r = await crearBloque(materiaId, { tipo, texto: marca });
      if (!r.ok) return;
      setHecho(tipo === 'ref' ? 'nota' : 'tarea');
      window.dispatchEvent(new CustomEvent(EVENTO_NOTA_CREADA));
    });
  };

  if (hecho) {
    return (
      <span className="ml-auto inline-flex items-center gap-1 font-mono text-[11px] text-sync-ok">
        <Check size={12} strokeWidth={3} aria-hidden />
        {hecho === 'nota' ? 'Anotado' : 'A tus tareas'}
      </span>
    );
  }

  const clase =
    'inline-flex min-h-[30px] cursor-pointer items-center gap-1 rounded-full border border-bor px-[10px] font-mono text-[11px] text-tx3 hover:border-acc hover:text-acc disabled:opacity-50';

  return (
    <span className="ml-auto flex gap-2">
      <button
        type="button"
        disabled={pendiente}
        onClick={() => mandar('ref')}
        title={`Guardar "${modulo.nombre}" en las notas de ${unidad}`}
        className={clase}
      >
        + Anotar
      </button>
      <button
        type="button"
        disabled={pendiente}
        onClick={() => mandar('tarea')}
        title={`Agregar "${modulo.nombre}" como tarea por hacer`}
        className={clase}
      >
        ☑ Realizar
      </button>
    </span>
  );
}

/** Reproductor 16:9 de youtube-nocookie (o el link, si es una playlist). */
/**
 * El video de YouTube como una celda más del bento, igual que una imagen:
 * miniatura + botón de play. Recién al tocarlo se carga el reproductor, y ahí
 * la celda pasa a ocupar la fila entera (un player de 148px no se puede mirar).
 *
 * DECISIÓN: no se monta el `<iframe>` de entrada. Un módulo con varios videos
 * cargaba un iframe de YouTube por cada uno apenas lo abrías — cientos de KB y
 * las cookies de YouTube sin que nadie le hubiera dado play. Con la miniatura
 * no sale ni un request a YouTube hasta que querés ver algo.
 */
function VideoCelda({ video }: { video: string }) {
  const [reproduciendo, setReproduciendo] = useState(false);
  const [miniaturaRota, setMiniaturaRota] = useState(false);
  const lista = esLista(video);
  const titulo = lista ? 'Lista de reproducción de YouTube' : 'Video de YouTube';
  const miniatura = miniaturaYoutube(video);

  if (reproduciendo) {
    return (
      <div className="col-span-full flex flex-col gap-2">
        {/* Sandbox con lo mínimo que necesita el player de youtube-nocookie:
            `allow-scripts` (el player ES un script), `allow-same-origin` para su
            PROPIO origen (youtube-nocookie.com, no el nuestro: sin esto no
            guarda ni el volumen), `allow-presentation` para el botón de
            fullscreen y los `allow-popups*` para "Ver en YouTube" del propio
            player, que sin escapar del sandbox abre una pestaña rota. Quedan
            bloqueados formularios, navegación del top y descargas. */}
        {/* `allow-scripts` + `allow-same-origin` es una vía de escape del
            sandbox SOLO cuando el documento embebido es del mismo origen que
            el embebedor (ahí puede sacarse su propio atributo `sandbox`). Acá
            no aplica: `urlEmbed()` (lib/embebido.ts) arma SIEMPRE una URL de
            www.youtube-nocookie.com con el host escrito a mano y el id pasado
            por encodeURIComponent, así que el src nunca es de nuestro origen ni
            de una URL que venga del contenido del aula. `allow-same-origin` le
            devuelve el origen de YouTube, no el nuestro: no alcanza nuestro DOM
            ni nuestras cookies. */}
        {/* react-doctor-disable-next-line react-doctor/iframe-missing-sandbox */}
        <iframe
          src={urlEmbed(video)}
          title={titulo}
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
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

  return (
    <button
      type="button"
      onClick={() => setReproduciendo(true)}
      // Misma relación que las imágenes: la grilla queda pareja.
      className="tactil relative block aspect-[4/3] cursor-pointer overflow-hidden rounded-xl border border-bor bg-bg"
    >
      {miniatura && !miniaturaRota ? (
        // La miniatura viene de i.ytimg.com: next/image no la puede optimizar
        // y no aporta nada sobre un jpg ya chico.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={miniatura}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setMiniaturaRota(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        // Las playlists no tienen miniatura derivable del id, y un video puede
        // no tenerla: en vez de una celda vacía, el fondo con el ícono.
        <span aria-hidden className="absolute inset-0 bg-bor" />
      )}
      <span
        aria-hidden
        className="absolute inset-0 grid place-items-center bg-black/25 transition-colors"
      >
        <span className="grid h-11 w-11 place-items-center rounded-full bg-acc-bg text-acc-fg">
          <Play size={18} strokeWidth={2.5} className="ml-[2px]" />
        </span>
      </span>
      <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-2 py-1 text-left font-mono text-[10.5px] text-white">
        {lista ? 'Lista de YouTube' : 'Video de YouTube'}
      </span>
      <span className="sr-only">Reproducir {titulo}</span>
    </button>
  );
}

// --- visores de archivo ----------------------------------------------------
//
// Todo lo que se ve acá pasa por /api/archivo?ref=… (el proxy es el único que
// tiene el token). El usuario NO debería tener que descargar nada para mirar
// una imagen o un video: por eso el visor se elige por mimetype y, cuando el
// mime no dice nada, por extensión (ver `tipoVisor`).

/** En qué anda un recurso que se está trayendo de la red. */
type EstadoCarga = 'cargando' | 'listo' | 'error';

/** Cartel de "no cargó": el archivo puede seguir sirviendo bajándolo. */
function FalloCarga() {
  return (
    <div className="rounded-xl border border-dashed border-bor p-4 text-center text-[13px] text-tx2">
      No se pudo cargar. Probá descargarlo.
    </div>
  );
}

/** Botón de descarga con señal de vida: "Descargando…" → "Listo" → normal. */
function BotonDescargar({ archivo, url }: { archivo: ArchivoModulo; url: string }) {
  const [estado, setEstado] = useState<'normal' | 'bajando' | 'listo' | 'error'>('normal');
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Si el módulo se cierra mientras corre el "Listo", el timer no puede
  // setear estado sobre un componente desmontado.
  useEffect(
    () => () => {
      if (reloj.current !== null) clearTimeout(reloj.current);
    },
    []
  );

  const descargar = async () => {
    if (estado === 'bajando') return;
    setEstado('bajando');
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('no ok');
      const blob = await r.blob();
      // El <a download> nativo no avisa nada; con el blob en la mano sabemos
      // que el archivo YA está y recién ahí disparamos el guardado.
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = archivo.nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      setEstado('listo');
      reloj.current = setTimeout(() => setEstado('normal'), 2000);
    } catch {
      setEstado('error');
    }
  };

  const texto =
    estado === 'bajando'
      ? 'Descargando…'
      : estado === 'listo'
        ? 'Listo'
        : estado === 'error'
          ? 'Reintentar'
          : 'Descargar';

  return (
    <>
      <button
        type="button"
        onClick={descargar}
        disabled={estado === 'bajando'}
        className="tactil flex min-h-[44px] cursor-pointer items-center gap-[6px] rounded-xl border border-bor2 px-3 text-[12.5px] font-bold text-tx2 disabled:opacity-60"
      >
        {estado === 'listo' ? (
          <Check size={13} strokeWidth={2.5} aria-hidden />
        ) : (
          <Download size={13} strokeWidth={2.5} aria-hidden />
        )}
        {texto}
      </button>
      {estado === 'error' && (
        <span role="status" className="w-full text-[12.5px] text-vencido">
          No se pudo descargar.
        </span>
      )}
    </>
  );
}

/** Ícono de la fila del archivo, según con qué se va a ver. */
const ICONO_VISOR: Record<Visor, LucideIcon> = {
  pdf: FileText,
  imagen: ImageIcon,
  video: VideoIcon,
  ninguno: File,
};

/**
 * Un archivo del módulo: nombre, "PDF · 161 KB" y su visor.
 *
 * - imagen → se ve SOLA, sin tocar nada (es lo que el usuario espera de una
 *   captura pegada en la clase)
 * - video → `<video controls preload="metadata">` contra el proxy, que soporta
 *   Range (206) para poder adelantar
 * - pdf → visor embebido detrás de "Ver" (70vh: pesa, no se abre solo)
 * - el resto (zip, docx…) → solo "Descargar"
 *
 * `activo` = el módulo está desplegado. El panel del acordeón se renderiza
 * siempre (solo se le pone `hidden`), así que la imagen y el video se montan
 * únicamente cuando el módulo está abierto: si no, entrar a una materia
 * dispararía decenas de descargas por el proxy sin que nadie las mire.
 */
function ArchivoEmbebido({ archivo, activo }: { archivo: ArchivoModulo; activo: boolean }) {
  const [viendo, setViendo] = useState(false);
  const [estado, setEstado] = useState<EstadoCarga>('cargando');
  const idVisor = `${useId()}-visor`;
  const url = urlArchivo(archivo.ref);
  const visor = tipoVisor(archivo.mime, archivo.nombre);
  const tamano = tamanoLegible(archivo.tamano);
  const Icono = ICONO_VISOR[visor];

  const listo = () => setEstado('listo');
  const fallo = () => setEstado('error');

  return (
    // Al abrir el visor de PDF la celda pasa a ocupar la fila entera: leer un
    // PDF en una columna de 190px no tiene sentido.
    <div
      className={`flex flex-col rounded-xl border border-bor bg-bg p-[10px] ${
        visor === 'pdf' && viendo ? 'col-span-full' : ''
      }`}
    >
      <div className="flex min-w-0 items-start gap-2">
        <Icono size={15} strokeWidth={2} aria-hidden className="mt-[3px] shrink-0 text-tx3" />
        <div className="min-w-0 flex-1">
          {/* line-clamp-2: en una celda angosta un nombre largo se comía la
              altura de todas las demás. El completo queda en el title. */}
          <div
            title={archivo.nombre}
            className="line-clamp-2 text-[13.5px] leading-[1.35] font-semibold break-words text-tx"
          >
            {archivo.nombre}
          </div>
          <div className="mt-[2px] font-mono text-[11px] text-tx3">
            {tipoArchivo(archivo.mime, archivo.nombre)}
            {tamano && ` · ${tamano}`}
          </div>
        </div>
      </div>

      {visor === 'imagen' &&
        activo &&
        (estado === 'error' ? (
          <div className="mt-[10px]">
            <FalloCarga />
          </div>
        ) : (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir a tamaño completo"
            // Relación fija en vez del alto natural: una foto vertical del
            // pizarrón medía 1500px y empujaba todo lo de abajo.
            className="relative mt-[10px] block aspect-[4/3] overflow-hidden rounded-xl border border-bor bg-bg"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- el proxy
                sirve bytes opacos por ref: next/image no puede optimizarlos. */}
            <img
              src={url}
              alt={archivo.nombre}
              // Con la grilla entran muchas más celdas por módulo: que el
              // navegador pida solo las que se acercan a la pantalla.
              loading="lazy"
              decoding="async"
              onLoad={listo}
              onError={fallo}
              className={`h-full w-full object-cover ${estado === 'listo' ? '' : 'opacity-0'}`}
            />
            {estado === 'cargando' && <Cargando />}
          </a>
        ))}

      {visor === 'video' &&
        activo &&
        (estado === 'error' ? (
          <div className="mt-[10px]">
            <FalloCarga />
          </div>
        ) : (
          <div className="relative mt-[10px] aspect-video overflow-hidden rounded-xl border border-bor bg-bg">
            {/* Sin <track>: son los videos que subió el profe, no hay
                subtítulos para ofrecer. */}
            <video
              src={url}
              controls
              preload="metadata"
              playsInline
              onLoadedMetadata={listo}
              onError={fallo}
              className={`h-full w-full object-contain ${estado === 'listo' ? '' : 'opacity-0'}`}
            />
            {estado === 'cargando' && <Cargando />}
          </div>
        ))}

      {/* mt-auto: los botones se apoyan abajo, así todas las celdas de la fila
          terminan alineadas aunque los nombres ocupen distinta cantidad de líneas. */}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-[10px]">
        {visor === 'pdf' && (
          <button
            type="button"
            onClick={() => setViendo((v) => !v)}
            aria-expanded={viendo}
            aria-controls={idVisor}
            className="tactil flex min-h-[44px] cursor-pointer items-center gap-[6px] rounded-xl bg-acc-bg px-3 text-[12.5px] font-bold text-acc-fg"
          >
            <Eye size={13} strokeWidth={2.5} aria-hidden />
            {viendo ? 'Cerrar' : 'Ver'}
          </button>
        )}
        <BotonDescargar archivo={archivo} url={url} />
      </div>

      {/* El visor va con un tope además del 70vh: en un monitor alto eran
          900px de iframe y el resto del módulo quedaba fuera de la pantalla. */}
      {visor === 'pdf' && viendo && activo && (
        <div id={idVisor} className="mt-[10px]">
          {estado === 'error' ? (
            <FalloCarga />
          ) : (
            <div className="relative h-[min(70vh,540px)]">
              {/* Acá adentro van BYTES del aula virtual servidos por nuestro
                  proxy, así que la URL es same-origin pero el contenido es
                  ajeno. `allow-scripts` porque el visor de PDF del navegador es
                  una app JS y sin eso queda en blanco, y `allow-downloads` para
                  el botón de guardar de su barra. A propósito SIN
                  `allow-same-origin`: el archivo corre en un origen opaco, así
                  que aunque el aula devolviera un HTML en vez de un PDF no
                  puede leer nuestras cookies ni nuestro DOM. */}
              <iframe
                src={url}
                title={archivo.nombre}
                sandbox="allow-scripts allow-downloads"
                onLoad={listo}
                onError={fallo}
                className={`h-full w-full rounded-xl border border-bor bg-sup ${
                  estado === 'listo' ? '' : 'opacity-0'
                }`}
              />
              {estado === 'cargando' && <Cargando />}
            </div>
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
  const idBase = useId();
  const idNombre = `${idBase}-nombre`;
  const idUrl = `${idBase}-url`;
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
        {/* El placeholder no alcanza como rótulo: se borra en cuanto escribís. */}
        <div className="flex flex-col gap-[5px]">
          <label htmlFor={idNombre} className={claseLabel}>
            Nombre
          </label>
          <input
            id={idNombre}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre (ej: Guía 5 PDF)"
            className={claseInput}
          />
        </div>
        <div className="flex flex-col gap-[5px]">
          <label htmlFor={idUrl} className={claseLabel}>
            Link
          </label>
          <div className="flex gap-2">
            <input
              id={idUrl}
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
  const idBase = useId();
  const idTitulo = `${idBase}-titulo`;
  const idFecha = `${idBase}-fecha`;
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
        {/* El placeholder no alcanza como rótulo: se borra en cuanto escribís. */}
        <div className="flex flex-col gap-[5px]">
          <label htmlFor={idTitulo} className={claseLabel}>
            Título
          </label>
          <input
            id={idTitulo}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Título (ej: Entrega del TP)"
            className={claseInput}
          />
        </div>
        <div className="flex flex-col gap-[5px]">
          <label htmlFor={idFecha} className={claseLabel}>
            Fecha
          </label>
          <div className="flex gap-2">
            <input
              id={idFecha}
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
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
