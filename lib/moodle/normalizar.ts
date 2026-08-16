/**
 * Normalización de los datos crudos de Moodle (portado de cursada-sync,
 * ver MOODLE-API-REFERENCE.md: "Trampas confirmadas").
 *
 * Todas las funciones de este archivo son PURAS: sin I/O, sin estado, sin
 * dependencias externas. Es la capa que traduce lo que devuelve la API a lo
 * que la app puede guardar y mostrar.
 *
 * SOLO SERVIDOR (por convención, como el resto de lib/moodle/): ningún client
 * component debe importar este módulo — los que sí hablan con la red o el
 * disco (cliente.ts, credenciales.ts, plan.ts) filtrarían el token.
 */

/** Entidades HTML nombradas que aparecen en la práctica en los campos de Moodle. */
const ENTIDADES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ntilde: 'ñ',
  Ntilde: 'Ñ',
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  uuml: 'ü',
  Uuml: 'Ü',
  deg: '°',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
};

/** `&#039;` / `&#x27;` / `&aacute;` — todas las formas, en una sola alternancia. */
const RE_ENTIDAD = /&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z]+);/g;

/**
 * Decodifica entidades HTML numéricas y nombradas.
 *
 * POR QUÉ una sola pasada con un único regex: si se reemplazara entidad por
 * entidad (o `&amp;` primero), un texto ya escapado dos veces como
 * `&amp;#039;` se decodificaría de más y terminaría en `'`. Al recorrer el
 * string una única vez, `&amp;` se consume y el `#039;` que queda detrás ya no
 * vuelve a mirarse: el resultado correcto es `&#039;` literal.
 */
export function decodificarHtml(s: string): string {
  return s.replace(RE_ENTIDAD, (completo, cuerpo: string): string => {
    if (cuerpo.startsWith('#')) {
      const hex = cuerpo[1] === 'x' || cuerpo[1] === 'X';
      const codigo = Number.parseInt(hex ? cuerpo.slice(2) : cuerpo.slice(1), hex ? 16 : 10);
      if (!Number.isFinite(codigo) || codigo < 0 || codigo > 0x10ffff) return completo;
      try {
        return String.fromCodePoint(codigo);
      } catch {
        return completo;
      }
    }
    return ENTIDADES[cuerpo] ?? completo;
  });
}

/**
 * HTML → texto plano legible. Para `intro` (consignas de TP), `description`
 * de eventos y `message` de las discusiones del foro (trampa #6).
 */
export function aTextoPlano(html: string): string {
  let t = html;
  // <script>/<style> se van CON su contenido: si solo se quitaran los tags,
  // el código JS/CSS quedaría como texto visible.
  t = t.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  t = t.replace(/<\s*(br|hr)\s*\/?\s*>/gi, '\n');
  // `<li>`/`<tr>` abren la línea; por eso sus cierres NO agregan otro salto
  // (si no, cada ítem quedaría separado por una línea en blanco).
  t = t.replace(/<\s*li\b[^>]*>/gi, '\n• ');
  t = t.replace(/<\s*tr\b[^>]*>/gi, '\n');
  t = t.replace(/<\s*\/\s*(p|div|h[1-6]|ul|ol|table|blockquote)\s*>/gi, '\n');
  t = t.replace(/<[^>]*>/g, '');
  // Decodificar DESPUÉS de sacar los tags: así un `&lt;b&gt;` escrito por el
  // profe se muestra como texto y no se lo confunde con marcado real.
  t = decodificarHtml(t);
  t = t.replace(/\r\n?/g, '\n');
  t = t.replace(/[^\S\n]+/g, ' '); // colapsa espacios horizontales, respeta \n
  t = t
    .split('\n')
    .map((linea) => linea.trim())
    .join('\n');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

/** Sufijo final entre () o [] candidato a código de comisión. */
const RE_SUFIJO = /^([\s\S]*?)[ \t]*[([]([^()[\]]+)[)\]]$/;
/** Un código no tiene espacios y es alfanumérico con separadores. */
const RE_CODIGO = /^[A-Z0-9][A-Z0-9\-._/]*$/i;

/**
 * Separa el código de comisión pegado al final del nombre del curso.
 *
 * Criterio deliberadamente CONSERVADOR (trampa #4): solo se considera código
 * un sufijo entre paréntesis/corchetes al final que no tenga espacios y que
 * matchee `RE_CODIGO`. Así "Programación I (INF-101-A)" se separa, pero
 * "Análisis Matemático (Comisión de la tarde)" queda intacto: ante la duda,
 * preferimos no mutilar el nombre.
 */
export function separarNombreCodigo(s: string): { nombre: string; codigo: string | null } {
  const limpio = quitarComillasEnvolventes(decodificarHtml(s).replace(/\s+/g, ' ').trim());
  const m = RE_SUFIJO.exec(limpio);
  if (m === null) return { nombre: limpio, codigo: null };
  const nombre = (m[1] ?? '').trim();
  const candidato = (m[2] ?? '').trim();
  if (nombre === '' || !RE_CODIGO.test(candidato)) return { nombre: limpio, codigo: null };
  return { nombre, codigo: candidato };
}

/**
 * Quita UNA comilla envolvente (' o ") si el string decodificado empieza Y
 * termina con la MISMA comilla. Caso real de la instancia de ORT: los
 * `fullname` llegan como `&#039;Fundamentos de Programación …&#039;`, que tras
 * decodificar queda `'Fundamentos de Programación …'` con comillas literales.
 * Solo se quita el par exterior y solo si son iguales: un apóstrofo interno
 * ("D'Angelo") o una comilla suelta quedan intactos.
 */
function quitarComillasEnvolventes(s: string): string {
  const primera = s[0];
  if (s.length >= 2 && (primera === "'" || primera === '"') && s.endsWith(primera)) {
    return s.slice(1, -1).trim();
  }
  return s;
}

/** `fullname`/`shortname` de cursos: entidades decodificadas, espacios colapsados, sin comillas envolventes ni código. */
export function limpiarNombre(s: string): string {
  return separarNombreCodigo(s).nombre;
}

/**
 * Epoch en SEGUNDOS → Date (trampa #2: hay que multiplicar por 1000).
 *
 * `0` es el "sin fecha" de Moodle (`duedate`, `enddate`) — devolver el 1/1/1970
 * es el bug clásico, así que 0, negativos, null y undefined dan `null`.
 */
export function epochADate(seg: number | null | undefined): Date | null {
  if (seg === null || seg === undefined) return null;
  if (!Number.isFinite(seg) || seg <= 0) return null;
  return new Date(seg * 1000);
}

/** Timezone de la app: las fechas se muestran y se guardan como día de Buenos Aires. */
const TZ = 'America/Argentina/Buenos_Aires';

// en-CA formatea justo como 'YYYY-MM-DD', que es el formato de `fecha` en los
// avisos de la app. Intl evita sumar una dependencia de fechas.
const FORMATO_ISO = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Epoch en SEGUNDOS → 'YYYY-MM-DD' en hora de Buenos Aires (UTC-3).
 *
 * Se calcula el día LOCAL, no el UTC: un evento del 1/3 a las 23:00 de Buenos
 * Aires es 2/3 en UTC, y guardarlo como 2 lo correría un día en toda la app.
 */
export function epochAIso(seg: number | null | undefined): string | null {
  const d = epochADate(seg);
  if (d === null) return null;
  return FORMATO_ISO.format(d);
}

/**
 * URL relativa al módulo: `/mod/{modname}/view.php?id={cmid}`.
 *
 * NUNCA usar el `fileurl` que devuelve la API (trampa #5): trae el `wstoken`
 * embebido como query param, así que guardarlo en el snapshot o en un link
 * sería filtrar una credencial de la cuenta real. Esta URL, en cambio, abre
 * normal con la sesión del navegador y no contiene ningún secreto.
 */
export function urlModulo(modname: string, cmid: number): string {
  return `/mod/${modname}/view.php?id=${cmid}`;
}

/** Une la URL relativa del módulo con la base, sin duplicar barras. */
export function urlModuloAbsoluta(base: string, modname: string, cmid: number): string {
  return `${base.replace(/\/+$/, '')}${urlModulo(modname, cmid)}`;
}

/** `token=` / `wstoken=` / `authtoken=` con su valor, en URLs o en texto suelto. */
const RE_TOKEN_PARAM = /\b((?:ws|auth)?token)(=|["']?\s*:\s*["']?)([A-Za-z0-9._~+/-]+=*)/gi;

/**
 * Redacta cualquier token que aparezca en un string (URL, log, JSON serializado).
 *
 * Defensa en profundidad: el token no debería llegar acá nunca, pero `fileurl`
 * y el `authtoken` del feed .ics lo traen embebido, así que todo lo que se
 * escribe a disco o a la consola pasa por esta función.
 */
export function sinToken(s: string): string {
  return s.replace(RE_TOKEN_PARAM, (_m, clave: string, sep: string) => `${clave}${sep}***`);
}
