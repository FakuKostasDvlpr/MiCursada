import { describe, expect, it } from 'vitest';
import { partirComando } from '@/lib/comandos-nota';

describe('partirComando', () => {
  it('separa el comando de su contenido', () => {
    expect(partirComando('/todo Traer el TP')).toEqual({ cmd: 'todo', resto: 'Traer el TP' });
  });

  it('un comando solo no trae contenido', () => {
    expect(partirComando('/todo')).toEqual({ cmd: 'todo', resto: '' });
  });

  it('la barra sola abre el menú sin filtrar nada', () => {
    expect(partirComando('/')).toEqual({ cmd: '', resto: '' });
  });

  it('normaliza el comando a minúsculas pero respeta el texto', () => {
    expect(partirComando('/TODO Leer Física')).toEqual({ cmd: 'todo', resto: 'Leer Física' });
  });

  it('tolera espacios de más entre el comando y el texto', () => {
    expect(partirComando('/titulo    Unidad 3   ')).toEqual({ cmd: 'titulo', resto: 'Unidad 3' });
  });

  it('conserva los espacios internos del contenido', () => {
    expect(partirComando('/texto repasar  dos  temas').resto).toBe('repasar  dos  temas');
  });

  it('deja pasar una URL entera como contenido', () => {
    expect(partirComando('/link https://x.com/a?b=1&c=2')).toEqual({
      cmd: 'link',
      resto: 'https://x.com/a?b=1&c=2',
    });
  });

  it('un comando inexistente igual se parsea (el filtro decide después)', () => {
    expect(partirComando('/noexiste algo')).toEqual({ cmd: 'noexiste', resto: 'algo' });
  });
});
