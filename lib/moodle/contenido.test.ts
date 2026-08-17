// El HTML lo escriben los docentes en el editor de Moodle: acá se prueba que
// nada peligroso (script, on*, javascript:, iframes de terceros) sobreviva, y
// que lo que sí queremos embeber (YouTube, imágenes de Moodle, archivos)
// termine con la forma que espera el cliente.
import { describe, expect, it } from 'vitest';
import {
  RE_REF,
  RegistroRefs,
  armarRef,
  embedDeLink,
  embeberLinksDeVideo,
  esPluginfile,
  segundosDesdeT,
  nombreDesdeUrl,
  sanitizar,
  tieneContenido,
  urlSinTokenQuery,
  videoDesdeHtml,
  videoVimeo,
  videoYoutube,
  type RefArchivo,
} from './contenido';

describe('sanitizar', () => {
  it('elimina <script> con todo su contenido', () => {
    const salida = sanitizar('<p>Hola</p><script>alert(1)</script>');
    expect(salida).toBe('<p>Hola</p>');
    expect(salida).not.toMatch(/alert/);
    expect(salida).not.toMatch(/script/i);
  });

  it('elimina <style> con todo su contenido', () => {
    expect(sanitizar('<style>body{display:none}</style><p>ok</p>')).toBe('<p>ok</p>');
  });

  it('elimina los handlers on* pero deja el elemento', () => {
    const salida = sanitizar('<p onerror="robar()" onclick="x()">texto</p>');
    expect(salida).toBe('<p>texto</p>');
    expect(salida).not.toMatch(/onerror|onclick|robar/i);
  });

  it('elimina onerror de una <img> externa (el clásico XSS)', () => {
    const salida = sanitizar('<img src="https://x.test/a.png" onerror="alert(1)" alt="a">');
    expect(salida).toMatch(/<img/);
    expect(salida).not.toMatch(/onerror/i);
  });

  it('elimina href="javascript:…" y deja el link sin destino', () => {
    const salida = sanitizar('<a href="javascript:alert(1)">click</a>');
    expect(salida).not.toMatch(/javascript:/i);
    expect(salida).toMatch(/>click</);
  });

  it('a los links les fuerza target=_blank y rel="noopener noreferrer"', () => {
    const salida = sanitizar('<a href="https://x.test/a" target="_self">ir</a>');
    expect(salida).toContain('href="https://x.test/a"');
    expect(salida).toContain('target="_blank"');
    expect(salida).toContain('rel="noopener noreferrer"');
    expect(salida).not.toContain('_self');
  });

  it('permite un iframe de YouTube y lo reescribe a youtube-nocookie', () => {
    const salida = sanitizar(
      '<p>mirá</p><iframe src="https://www.youtube.com/embed/TMeaRPvj_rA?rel=0" width="560"></iframe>'
    );
    expect(salida).toContain('https://www.youtube-nocookie.com/embed/TMeaRPvj_rA?rel=0');
    expect(salida).not.toContain('://www.youtube.com/');
  });

  it('elimina un iframe de cualquier otro dominio', () => {
    const salida = sanitizar('<p>a</p><iframe src="https://evil.test/panel"></iframe><p>b</p>');
    expect(salida).not.toMatch(/iframe/i);
    expect(salida).not.toMatch(/evil\.test/);
    expect(salida).toBe('<p>a</p><p>b</p>');
  });

  it('deja pasar un iframe de Vimeo', () => {
    const salida = sanitizar('<iframe src="https://player.vimeo.com/video/12345"></iframe>');
    expect(salida).toContain('https://player.vimeo.com/video/12345');
  });

  it('reescribe una <img> de pluginfile al proxy y registra la ref', () => {
    const refs: Record<string, RefArchivo> = {};
    const registro = new RegistroRefs(99, refs);
    const salida = sanitizar(
      '<p><img src="https://aula.test/webservice/pluginfile.php/1/mod_page/content/1/diagrama.png" alt="diagrama"></p>',
      { registrarArchivo: (src) => registro.registrar(src) }
    );
    expect(salida).toContain('src="/api/archivo?ref=99%3A0"');
    expect(salida).toContain('alt="diagrama"');
    expect(refs['99:0']?.url).toContain('/pluginfile.php/1/mod_page/content/1/diagrama.png');
    expect(salida).not.toContain('pluginfile');
  });

  it('un <a> a pluginfile.php se manda al proxy (sin token daría 403)', () => {
    const refs: Record<string, RefArchivo> = {};
    const registro = new RegistroRefs(77, refs);
    const salida = sanitizar(
      '<a href="https://aula.test/webservice/pluginfile.php/1/mod_page/content/2/U1-Enunciado.pdf?time=1">Enunciado</a>',
      { registrarArchivo: (src) => registro.registrar(src) }
    );
    expect(salida).toContain('href="/api/archivo?ref=77%3A0"');
    expect(salida).not.toContain('pluginfile');
    expect(refs['77:0']?.nombre).toBe('U1-Enunciado.pdf');
  });

  it('un <a> externo NO se toca (solo se le fuerza target/rel)', () => {
    const salida = sanitizar('<a href="https://docs.test/guia">guía</a>', {
      registrarArchivo: () => '1:0',
    });
    expect(salida).toContain('href="https://docs.test/guia"');
  });

  it('sin registrador, la imagen de Moodle se cambia por su alt (nada roto)', () => {
    const salida = sanitizar(
      '<p><img src="https://aula.test/pluginfile.php/1/x/foto.png" alt="El esquema"></p>'
    );
    expect(salida).not.toMatch(/<img/);
    expect(salida).toContain('El esquema');
  });

  it('deja las tablas y el código de la whitelist', () => {
    const salida = sanitizar(
      '<table><thead><tr><th>a</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table><pre><code>x=1</code></pre>'
    );
    expect(salida).toContain('<table>');
    expect(salida).toContain('<th>a</th>');
    expect(salida).toContain('<code>x=1</code>');
  });

  it('descarta tags fuera de la whitelist pero conserva su texto', () => {
    expect(sanitizar('<marquee>hola</marquee><form><input></form>')).toBe('hola');
  });

  it('recorta y cierra los tags si pasa el largo máximo', () => {
    const largo = `<p>${'a'.repeat(500)}</p><p>final</p>`;
    const salida = sanitizar(largo, { maxLargo: 100 });
    expect(salida.length).toBeLessThan(200);
    expect(salida.endsWith('<p>…</p>')).toBe(true);
    expect(salida).toContain('</p>');
  });

  it('null/undefined/vacío dan string vacío', () => {
    expect(sanitizar(null)).toBe('');
    expect(sanitizar(undefined)).toBe('');
    expect(sanitizar('')).toBe('');
  });
});

describe('videoYoutube', () => {
  it('watch?v=', () => {
    expect(videoYoutube('https://www.youtube.com/watch?v=TMeaRPvj_rA')).toBe('TMeaRPvj_rA');
  });

  it('youtu.be/', () => {
    expect(videoYoutube('https://youtu.be/TMeaRPvj_rA?t=30')).toBe('TMeaRPvj_rA');
  });

  it('embed/ (y nocookie)', () => {
    expect(videoYoutube('https://www.youtube.com/embed/TMeaRPvj_rA?rel=0')).toBe('TMeaRPvj_rA');
    expect(videoYoutube('https://www.youtube-nocookie.com/embed/TMeaRPvj_rA')).toBe('TMeaRPvj_rA');
  });

  it('playlist?list= → "lista:{id}"', () => {
    expect(videoYoutube('https://www.youtube.com/playlist?list=PLabc123DEF')).toBe(
      'lista:PLabc123DEF'
    );
  });

  it('embed/videoseries?list= también es lista', () => {
    expect(videoYoutube('https://www.youtube.com/embed/videoseries?list=PLabc123DEF')).toBe(
      'lista:PLabc123DEF'
    );
  });

  it('con video Y lista gana el video (es lo embebible directo)', () => {
    expect(videoYoutube('https://www.youtube.com/watch?v=TMeaRPvj_rA&list=PLabc123DEF')).toBe(
      'TMeaRPvj_rA'
    );
  });

  it('otro dominio o basura → null', () => {
    expect(videoYoutube('https://vimeo.com/12345')).toBeNull();
    expect(videoYoutube('no soy una url')).toBeNull();
    expect(videoYoutube('')).toBeNull();
    expect(videoYoutube(null)).toBeNull();
  });

  it('un dominio que solo TERMINA parecido no cuenta', () => {
    expect(videoYoutube('https://notyoutube.com/watch?v=TMeaRPvj_rA')).toBeNull();
  });
});

describe('videoDesdeHtml', () => {
  it('encuentra el iframe de YouTube del contenido de una page', () => {
    const html =
      '<p>Mirá el video</p><iframe src="https://www.youtube.com/embed/TMeaRPvj_rA?rel=0"></iframe>';
    expect(videoDesdeHtml(html)).toBe('TMeaRPvj_rA');
  });

  it('ignora iframes que no son de YouTube', () => {
    expect(videoDesdeHtml('<iframe src="https://player.vimeo.com/video/1"></iframe>')).toBeNull();
  });

  it('sin iframes → null', () => {
    expect(videoDesdeHtml('<p>nada</p>')).toBeNull();
  });
});

describe('urlSinTokenQuery', () => {
  it('saca token y wstoken de la fileurl', () => {
    const u = urlSinTokenQuery(
      'https://aula.test/webservice/pluginfile.php/1/x/tp1.pdf?forcedownload=1&token=SECRETO123'
    );
    expect(u).not.toContain('token=');
    expect(u).not.toContain('SECRETO123');
    expect(u).toContain('forcedownload=1');
  });

  it('rechaza lo que no es http(s)', () => {
    expect(urlSinTokenQuery('javascript:alert(1)')).toBeNull();
    expect(urlSinTokenQuery('data:text/html,<b>x')).toBeNull();
    expect(urlSinTokenQuery('/relativa/x.pdf')).toBeNull();
    expect(urlSinTokenQuery(null)).toBeNull();
  });
});

describe('RegistroRefs (armado de archivos[])', () => {
  it('reparte refs correlativas y NUNCA guarda el token', () => {
    const refs: Record<string, RefArchivo> = {};
    const registro = new RegistroRefs(4321, refs);
    const a = registro.registrar(
      'https://aula.test/webservice/pluginfile.php/1/mod_assign/introattachment/0/2022C2-ORT-FPROG-TP1.pdf?token=SECRETO',
      '2022C2-ORT-FPROG-TP1.pdf',
      'application/pdf'
    );
    const b = registro.registrar(
      'https://aula.test/webservice/pluginfile.php/1/mod_resource/content/1/guia.zip?token=SECRETO',
      'guia.zip',
      'application/zip'
    );
    expect(a).toBe('4321:0');
    expect(b).toBe('4321:1');
    expect(RE_REF.test(a!)).toBe(true);
    expect(JSON.stringify(refs)).not.toContain('token=');
    expect(JSON.stringify(refs)).not.toContain('SECRETO');
    expect(refs['4321:0']?.mime).toBe('application/pdf');
    expect(refs['4321:0']?.nombre).toBe('2022C2-ORT-FPROG-TP1.pdf');
  });

  it('la misma URL dos veces devuelve la misma ref', () => {
    const refs: Record<string, RefArchivo> = {};
    const registro = new RegistroRefs(1, refs);
    const url = 'https://aula.test/pluginfile.php/1/x/foto.png';
    expect(registro.registrar(url)).toBe(registro.registrar(url));
    expect(Object.keys(refs)).toHaveLength(1);
  });

  it('una URL inválida no ocupa índice', () => {
    const refs: Record<string, RefArchivo> = {};
    const registro = new RegistroRefs(1, refs);
    expect(registro.registrar(null)).toBeNull();
    expect(registro.registrar('https://aula.test/a.pdf')).toBe('1:0');
  });
});

describe('RE_REF', () => {
  it('acepta "{cmid}:{indice}" y nada más', () => {
    expect(RE_REF.test('123:0')).toBe(true);
    expect(RE_REF.test(armarRef(9, 12))).toBe(true);
    expect(RE_REF.test('123')).toBe(false);
    expect(RE_REF.test('123:0:0')).toBe(false);
    expect(RE_REF.test('../../etc/passwd')).toBe(false);
    expect(RE_REF.test('https://evil.test/x')).toBe(false);
    expect(RE_REF.test('123:a')).toBe(false);
  });
});

describe('helpers varios', () => {
  it('esPluginfile reconoce las URLs de archivos de Moodle', () => {
    expect(esPluginfile('https://a.test/webservice/pluginfile.php/1/x.png')).toBe(true);
    expect(esPluginfile('https://a.test/pluginfile.php/1/x.png')).toBe(true);
    expect(esPluginfile('https://a.test/draftfile.php/1/x.png')).toBe(true);
    expect(esPluginfile('https://cdn.test/x.png')).toBe(false);
  });

  it('nombreDesdeUrl toma el último segmento', () => {
    expect(nombreDesdeUrl('https://a.test/x/y/gu%C3%ADa%201.pdf?token=x')).toBe('guía 1.pdf');
  });

  it('tieneContenido distingue el HTML vacío del que muestra algo', () => {
    expect(tieneContenido('<p></p>')).toBe(false);
    expect(tieneContenido('<p>&nbsp;</p>')).toBe(false);
    expect(tieneContenido('<p>hola</p>')).toBe(true);
    expect(tieneContenido('<p></p><img src="/api/archivo?ref=1%3A0">')).toBe(true);
  });
});

// Los profes pegan los videos como links ("Uno", "Dos"), no como iframe: acá se
// prueba que cada uno termine siendo un player embebido dentro de la app.
describe('embedDeLink', () => {
  it('youtu.be → embed nocookie', () => {
    expect(embedDeLink('https://youtu.be/lCBwntpmCeo')).toBe(
      'https://www.youtube-nocookie.com/embed/lCBwntpmCeo?rel=0'
    );
  });

  it('watch?v= con &t= conserva el arranque como start=', () => {
    expect(embedDeLink('https://www.youtube.com/watch?v=TMeaRPvj_rA&t=90')).toBe(
      'https://www.youtube-nocookie.com/embed/TMeaRPvj_rA?rel=0&start=90'
    );
    expect(embedDeLink('https://youtu.be/TMeaRPvj_rA?t=1m30s')).toContain('start=90');
    expect(embedDeLink('https://www.youtube.com/watch?v=TMeaRPvj_rA&start=15')).toContain(
      'start=15'
    );
  });

  it('playlist → videoseries?list=', () => {
    expect(embedDeLink('https://www.youtube.com/playlist?list=PL1234567890')).toBe(
      'https://www.youtube-nocookie.com/embed/videoseries?list=PL1234567890&rel=0'
    );
  });

  it('shorts y embed también', () => {
    expect(embedDeLink('https://www.youtube.com/shorts/TMeaRPvj_rA')).toContain(
      '/embed/TMeaRPvj_rA'
    );
    expect(embedDeLink('https://www.youtube.com/embed/TMeaRPvj_rA')).toContain(
      '/embed/TMeaRPvj_rA'
    );
  });

  it('vimeo → player.vimeo', () => {
    expect(embedDeLink('https://vimeo.com/76979871')).toBe('https://player.vimeo.com/video/76979871');
    expect(embedDeLink('https://player.vimeo.com/video/76979871')).toBe(
      'https://player.vimeo.com/video/76979871'
    );
  });

  it('lo que no es video da null', () => {
    expect(embedDeLink('https://docs.test/guia.pdf')).toBeNull();
    expect(embedDeLink('https://vimeo.com/canal/algo')).toBeNull();
    expect(embedDeLink('javascript:alert(1)')).toBeNull();
    expect(embedDeLink('')).toBeNull();
    expect(embedDeLink(null)).toBeNull();
  });

  it('segundosDesdeT entiende los formatos de YouTube', () => {
    expect(segundosDesdeT('90')).toBe(90);
    expect(segundosDesdeT('90s')).toBe(90);
    expect(segundosDesdeT('1m30s')).toBe(90);
    expect(segundosDesdeT('1h2m3s')).toBe(3723);
    expect(segundosDesdeT('mañana')).toBeNull();
    expect(segundosDesdeT(null)).toBeNull();
  });

  it('videoVimeo solo acepta ids numéricos de vimeo', () => {
    expect(videoVimeo('https://vimeo.com/76979871')).toBe('76979871');
    expect(videoVimeo('https://otro.test/76979871')).toBeNull();
    expect(videoVimeo('no es una url')).toBeNull();
  });
});

describe('embeberLinksDeVideo (dentro de sanitizar)', () => {
  it('el caso real: dos links de video en el mismo módulo → dos players', () => {
    const salida = sanitizar(
      '<p></p><ul><li>Explicación por el Prof Nasuti</li></ul><p></p>' +
        '<p><a href="https://youtu.be/lCBwntpmCeo">Uno</a></p>' +
        '<p><a href="https://youtu.be/UGFxn_sf6kw">Dos</a></p>'
    );
    expect(salida.match(/<figure class="video">/g)).toHaveLength(2);
    expect(salida.match(/youtube-nocookie\.com\/embed\//g)).toHaveLength(2);
    expect(salida).toContain('src="https://www.youtube-nocookie.com/embed/lCBwntpmCeo?rel=0"');
    expect(salida).toContain('src="https://www.youtube-nocookie.com/embed/UGFxn_sf6kw?rel=0"');
    // El texto del link queda como leyenda, tal cual lo escribió el profe.
    expect(salida).toContain('<figcaption>Uno</figcaption>');
    expect(salida).toContain('<figcaption>Dos</figcaption>');
    // Y ya no queda ningún link suelto a YouTube.
    expect(salida).not.toMatch(/<a [^>]*youtu\.be/);
    expect(salida).toContain('Explicación por el Prof Nasuti');
  });

  it('el player lleva title y loading=lazy', () => {
    const salida = sanitizar('<p><a href="https://youtu.be/lCBwntpmCeo">Uno</a></p>');
    expect(salida).toContain('title="Uno"');
    expect(salida).toContain('allowfullscreen');
    expect(salida).toContain('loading="lazy"');
  });

  it('un link inline queda donde estaba y el player va DESPUÉS del párrafo', () => {
    const salida = sanitizar(
      '<p>Mirá <a href="https://youtu.be/lCBwntpmCeo">este video</a> antes del TP.</p><p>Chau</p>'
    );
    expect(salida).toContain('antes del TP.');
    expect(salida).toMatch(/<\/p><figure class="video">/);
    // el <figure> nunca queda adentro del <p>: arranca recién después del cierre
    expect(salida.indexOf('<figure')).toBeGreaterThan(salida.indexOf('</p>'));
    expect(salida).toContain('<figcaption>este video</figcaption>');
    expect(salida.indexOf('<figure')).toBeLessThan(salida.indexOf('<p>Chau'));
  });

  it('un link dentro de una lista pone el player después de la lista', () => {
    const salida = sanitizar(
      '<ul><li>Teoría: <a href="https://youtu.be/lCBwntpmCeo">acá</a></li><li>otra cosa</li></ul>'
    );
    expect(salida).toMatch(/<\/ul><figure class="video">/);
    expect(salida).toContain('<figcaption>acá</figcaption>');
  });

  it('playlist y vimeo también se embeben', () => {
    const lista = sanitizar('<p><a href="https://www.youtube.com/playlist?list=PLabc123">Curso</a></p>');
    expect(lista).toContain('/embed/videoseries?list=PLabc123');
    const vimeo = sanitizar('<p><a href="https://vimeo.com/76979871">Clase</a></p>');
    expect(vimeo).toContain('src="https://player.vimeo.com/video/76979871"');
  });

  it('un link con &t= arranca donde apuntaba el profe', () => {
    const salida = sanitizar(
      '<p><a href="https://www.youtube.com/watch?v=TMeaRPvj_rA&amp;t=90">Desde el minuto</a></p>'
    );
    expect(salida).toContain('start=90');
  });

  it('los links que NO son de video quedan intactos', () => {
    const salida = sanitizar('<p><a href="https://docs.test/guia.pdf">La guía</a></p>');
    expect(salida).toContain('<a href="https://docs.test/guia.pdf"');
    expect(salida).toContain('>La guía</a>');
    expect(salida).not.toContain('<figure');
  });

  it('javascript: sigue muriendo aunque el texto diga video', () => {
    const salida = sanitizar('<p><a href="javascript:alert(1)">Ver el video</a></p>');
    expect(salida).not.toMatch(/javascript:/i);
    expect(salida).not.toContain('<figure');
  });

  it('el player detectado alimenta a videoDesdeHtml (badge de video del módulo)', () => {
    expect(videoDesdeHtml(sanitizar('<p><a href="https://youtu.be/lCBwntpmCeo">Uno</a></p>'))).toBe(
      'lCBwntpmCeo'
    );
  });

  it('sin links no toca nada', () => {
    expect(embeberLinksDeVideo('<p>hola</p>')).toBe('<p>hola</p>');
    expect(embeberLinksDeVideo('')).toBe('');
  });
});
