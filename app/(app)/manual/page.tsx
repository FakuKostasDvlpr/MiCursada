import Link from 'next/link';
import { FRANJA_DEFECTO } from '@/lib/franjas';
import { MAX_FOTOS_BIBLIOTECA } from '@/lib/avatares';

export const metadata = { title: 'Mi Cursada · Manual' };

/**
 * Manual de uso (mejoras.md, "Manual de uso"): qué hace cada pantalla y cómo
 * se usa lo que no se descubre solo — los comandos `/` de las notas, las
 * referencias con `@`, y sobre todo que los horarios los carga cada persona
 * porque el aula virtual no los publica.
 *
 * Es contenido estático: no hay nada que traer del server, así que la página
 * no toca la base y se puede leer aunque el aula virtual esté caída.
 */

type Bloque = { titulo: string; texto: string };
type Seccion = { kicker: string; titulo: string; intro?: string; bloques: Bloque[] };

const SECCIONES: Seccion[] = [
  {
    kicker: 'Para empezar',
    titulo: 'Tus materias y tus horarios',
    intro:
      'Las materias llegan solas del aula virtual cuando entrás. Los horarios NO: el aula virtual no los publica en ningún lado, así que los cargás vos una vez y quedan.',
    bloques: [
      {
        titulo: 'Armá tu semana',
        texto: `En Semana, el panel "Armá tu semana" te deja marcar en qué días cursás cada materia. Un toque en L M M J V S marca el día de ${FRANJA_DEFECTO.inicio} a ${FRANJA_DEFECTO.fin}. Si una clase va en otro rango, cambiás la hora en los campos de abajo.`,
      },
      {
        titulo: 'Varias clases el mismo día',
        texto:
          '"Agregar horario" suma una franja más a esa materia. Así podés tener, por ejemplo, Matemáticas de 19:00 a 21:40 e Inglés de 21:40 a 23:00 el mismo miércoles.',
      },
      {
        titulo: 'Si te falta una materia',
        texto:
          'En Materias, "Agregar materia" la crea a mano. Sirve para lo que no figura en el aula virtual o no se recuperó en la sincronización. El sync no te la borra.',
      },
      {
        titulo: 'Si alguien de tu curso ya los cargó',
        texto:
          'Cuando entrás por primera vez, si otra persona de tu misma comisión ya cargó los horarios de esas materias, los heredás. Siempre podés cambiarlos después: a partir de ahí la grilla es tuya y ninguna sincronización te la pisa.',
      },
    ],
  },
  {
    kicker: 'Día a día',
    titulo: 'Las pantallas',
    bloques: [
      {
        titulo: 'Hoy',
        texto:
          'Lo que cursás hoy, con el horario y cuánto falta para entrar. Abajo, los avisos que vencen pronto y el estado de la última sincronización.',
      },
      { titulo: 'Semana', texto: 'Tu grilla de lunes a sábado. El día de hoy va resaltado.' },
      {
        titulo: 'Materias',
        texto:
          'Todas tus materias. Entrando a una tenés cuatro solapas: Curso (el contenido del aula virtual), Notas (lo tuyo), Archivos y Avisos.',
      },
      {
        titulo: 'Avisos',
        texto:
          'Entregas y fechas del aula virtual, más los que agregues a mano. Marcarlos como hechos los saca de los pendientes.',
      },
      {
        titulo: 'Grafo',
        texto:
          'Tu cursada como una red: vos al centro, tus materias alrededor y colgando de cada una sus notas, archivos y avisos. Un click en cualquier punto te lleva ahí — y si es una nota, te la abre y te la resalta.',
      },
    ],
  },
  {
    kicker: 'Notas',
    titulo: 'Escribir en una materia',
    intro:
      'Cada materia tiene su bloc. Escribís y se guarda solo; las notas quedan agrupadas por día.',
    bloques: [
      {
        titulo: 'Los comandos con /',
        texto:
          'Escribí / al principio para elegir qué crear. Podés escribir el contenido en la misma línea: "/todo Traer el TP" crea el to-do ya con su título, sin pasos extra.',
      },
      {
        titulo: 'Qué podés crear',
        texto:
          '/texto una nota común · /titulo un encabezado · /todo un checkbox que se tacha al marcarlo · /link un enlace con vista previa · /divisor una línea · /tablero cambia a la vista de columnas.',
      },
      {
        titulo: 'Citar con @',
        texto:
          'Escribiendo @ dentro de una nota podés citar un ítem del aula virtual, otra materia o un aviso. Queda como un chip que lleva ahí de un click.',
      },
      {
        titulo: 'Tablero',
        texto:
          'La misma información en tres columnas: Por hacer, En proceso y Listo. Mover una card a Listo la marca como hecha.',
      },
    ],
  },
  {
    kicker: 'Tu cuenta',
    titulo: 'Perfil y datos',
    bloques: [
      {
        titulo: 'Cómo entrás',
        texto:
          'Con el mismo usuario y contraseña del aula virtual. Tu contraseña no se guarda en ningún lado y nunca sale del momento del login.',
      },
      {
        titulo: 'Tu avatar',
        texto: `En el perfil podés elegir uno de los avatares de la app o subir una foto tuya con el botón +. Las fotos que subís quedan en tu biblioteca (hasta ${MAX_FOTOS_BIBLIOTECA}) y las volvés a elegir sin subirlas de nuevo. La ✕ de cada una la borra.`,
      },
      {
        titulo: 'Sincronización',
        texto:
          'El contenido del aula virtual se actualiza al entrar y una vez por día. También podés forzarlo con "Sincronizar ahora". Tus notas, horarios y avisos propios no se tocan nunca: son tuyos y el sync no los pisa.',
      },
      {
        titulo: 'Borrar tu cuenta',
        texto:
          'Desde el perfil, "Borrar mi cuenta" elimina todo lo tuyo: perfil, notas, horarios, avisos y tu foto. No se puede deshacer.',
      },
    ],
  },
];

export default function PaginaManual() {
  return (
    <main>
      <header>
        <div className="kicker tracking-[0.16em]">Manual</div>
        <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.015em]">Cómo usar Mi Cursada</h1>
        <p className="mt-2 max-w-[62ch] text-[14px] leading-[1.55] text-tx3">
          Qué hace cada pantalla y cómo se usa lo que no se descubre solo.
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-5">
        {SECCIONES.map((s) => (
          <section key={s.titulo} className="rounded-[14px] border border-bor bg-sup px-[18px] py-[16px]">
            <div className="kicker text-[10px] text-tx3">{s.kicker}</div>
            <h2 className="mt-1.5 text-[17px] font-extrabold tracking-[-0.01em]">{s.titulo}</h2>
            {s.intro ? (
              <p className="mt-2 max-w-[62ch] text-[13.5px] leading-[1.55] text-tx2">{s.intro}</p>
            ) : null}

            <dl className="mt-3.5 flex flex-col gap-3">
              {s.bloques.map((b) => (
                <div key={b.titulo} className="rounded-[11px] border border-bor bg-bg px-3.5 py-3">
                  <dt className="text-[13.5px] font-bold text-tx">{b.titulo}</dt>
                  <dd className="mt-1 max-w-[62ch] text-[13px] leading-[1.55] text-tx2">
                    {b.texto}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <p className="mt-6 text-center text-[13px] text-tx3">
        ¿Algo no funciona como esperabas?{' '}
        <Link href="/" className="font-semibold text-acc underline">
          Volvé a Hoy
        </Link>{' '}
        y contale a quien te pasó la app.
      </p>
    </main>
  );
}
