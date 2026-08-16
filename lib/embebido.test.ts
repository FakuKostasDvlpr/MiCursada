import { describe, expect, it } from 'vitest';
import {
  dominio,
  esLista,
  esPdf,
  tamanoLegible,
  tipoArchivo,
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
