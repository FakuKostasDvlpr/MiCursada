import { describe, expect, it } from 'vitest';
import {
  dominio,
  esLista,
  esPdf,
  miniaturaYoutube,
  playerEnHtml,
  tamanoLegible,
  tipoArchivo,
  tipoVisor,
  urlArchivo,
  urlEmbed,
  urlYoutube,
} from './embebido';

describe('urlEmbed', () => {
  it('un video se embebe siempre en youtube-nocookie', () => {
    expect(urlEmbed('TMeaRPvj_rA')).toBe(
      'https://www.youtube-nocookie.com/embed/TMeaRPvj_rA?rel=0'
    );
  });

  it('una lista se embebe como videoseries', () => {
    expect(urlEmbed('lista:PLabc')).toBe(
      'https://www.youtube-nocookie.com/embed/videoseries?list=PLabc&rel=0'
    );
  });

  it('nunca apunta a youtube.com a secas', () => {
    expect(urlEmbed('TMeaRPvj_rA')).not.toContain('://www.youtube.com');
  });
});

describe('urlYoutube / esLista', () => {
  it('distingue video de lista', () => {
    expect(esLista('lista:PLabc')).toBe(true);
    expect(esLista('TMeaRPvj_rA')).toBe(false);
    expect(urlYoutube('TMeaRPvj_rA')).toBe('https://www.youtube.com/watch?v=TMeaRPvj_rA');
    expect(urlYoutube('lista:PLabc')).toBe('https://www.youtube.com/playlist?list=PLabc');
  });
});

describe('urlArchivo', () => {
  it('apunta al proxy con la ref escapada y sin ninguna URL de Moodle', () => {
    expect(urlArchivo('4321:0')).toBe('/api/archivo?ref=4321%3A0');
  });
});

describe('tipoArchivo / esPdf', () => {
  it('usa el mime cuando lo conoce', () => {
    expect(tipoArchivo('application/pdf', 'tp1.pdf')).toBe('PDF');
    expect(tipoArchivo('application/zip', 'guias.zip')).toBe('ZIP');
  });

  it('cae a la extensión del nombre', () => {
    expect(tipoArchivo('application/octet-stream', 'programa.py')).toBe('PY');
    expect(tipoArchivo('', 'sin-extension')).toBe('Archivo');
  });

  it('esPdf reconoce por mime o por extensión', () => {
    expect(esPdf('application/pdf', 'x')).toBe(true);
    expect(esPdf('application/octet-stream', 'TP1.PDF')).toBe(true);
    expect(esPdf('application/zip', 'x.zip')).toBe(false);
  });
});

describe('tamanoLegible', () => {
  it('formatea el tamaño real de un adjunto de la cursada', () => {
    expect(tamanoLegible(164_864)).toBe('161 KB');
    expect(tamanoLegible(500)).toBe('500 B');
    expect(tamanoLegible(2_411_724)).toBe('2,3 MB');
  });

  it('0 o desconocido no muestra nada', () => {
    expect(tamanoLegible(0)).toBe('');
    expect(tamanoLegible(Number.NaN)).toBe('');
  });
});

describe('dominio', () => {
  it('saca el www', () => {
    expect(dominio('https://www.youtube.com/playlist?list=PL')).toBe('youtube.com');
  });
});

describe('tipoVisor', () => {
  it('elige el visor por mimetype', () => {
    expect(tipoVisor('application/pdf', 'tp1.pdf')).toBe('pdf');
    expect(tipoVisor('image/png', 'captura.png')).toBe('imagen');
    expect(tipoVisor('image/jpeg', 'foto.jpg')).toBe('imagen');
    expect(tipoVisor('image/gif', 'anim.gif')).toBe('imagen');
    expect(tipoVisor('video/mp4', 'clase.mp4')).toBe('video');
    expect(tipoVisor('application/zip', 'guias.zip')).toBe('ninguno');
    expect(tipoVisor('application/vnd.ms-excel', 'notas.xls')).toBe('ninguno');
  });

  it('el mime puede traer charset y no rompe', () => {
    expect(tipoVisor('image/png; charset=binary', 'x.png')).toBe('imagen');
  });

  it('cae a la extensión cuando Moodle informa octet-stream (14 casos reales)', () => {
    // Estos son nombres textuales del snapshot: Moodle los da como
    // application/octet-stream y sin el fallback quedarían "solo descargar".
    expect(tipoVisor('application/octet-stream', 'U1-Enunciado_y_consignas.pdf')).toBe('pdf');
    expect(tipoVisor('application/octet-stream', 'linkers.png')).toBe('imagen');
    expect(tipoVisor('application/octet-stream', 'a82ddf86-e39b-4205-9dd.jpg')).toBe('imagen');
    expect(tipoVisor('application/octet-stream', 'Unidad 6 - 2018.mp4')).toBe('video');
  });

  it('sin mime ni extensión conocida no inventa visor', () => {
    expect(tipoVisor('', 'sin-extension')).toBe('ninguno');
    expect(tipoVisor('application/octet-stream', 'programa.py')).toBe('ninguno');
  });
});

describe('playerEnHtml', () => {
  it('detecta el player de un video ya embebido en el html del profe', () => {
    const html = '<figure class="video"><iframe src="https://www.youtube-nocookie.com/embed/abc123?rel=0"></iframe></figure>';
    expect(playerEnHtml('abc123', html)).toBe(true);
    expect(playerEnHtml('otro99', html)).toBe(false);
  });

  it('detecta una playlist por su list=', () => {
    const html = '<iframe src="https://www.youtube-nocookie.com/embed/videoseries?list=PL123&rel=0"></iframe>';
    expect(playerEnHtml('lista:PL123', html)).toBe(true);
    expect(playerEnHtml('lista:PL999', html)).toBe(false);
  });

  it('con html vacío nunca hay player', () => {
    expect(playerEnHtml('abc123', '')).toBe(false);
  });
});

describe('miniaturaYoutube', () => {
  it('usa hqdefault, que existe siempre (maxresdefault da 404 en videos viejos)', () => {
    expect(miniaturaYoutube('abc123')).toBe('https://i.ytimg.com/vi/abc123/hqdefault.jpg');
  });

  it('una playlist no tiene miniatura propia derivable del id', () => {
    expect(miniaturaYoutube('lista:PL123')).toBeNull();
  });

  it('escapa el id en la URL', () => {
    expect(miniaturaYoutube('a/b')).toBe('https://i.ytimg.com/vi/a%2Fb/hqdefault.jpg');
  });
});
