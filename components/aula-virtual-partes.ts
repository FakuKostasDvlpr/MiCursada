// Lecturas del estado del aula virtual que la UI muestra como texto.
//
// Viven separadas de `components/aula-virtual.tsx` para que ese archivo exporte
// solo componentes (y su hook), así Fast Refresh puede preservar el estado del
// panel al editarlo.

import type { EstadoToken } from '@/app/actions-moodle';
import { hace } from '@/lib/cursada';

/** Fechas anteriores a 2000 son el placeholder del token por variable de entorno. */
function fechaUtil(iso: string | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && d.getUTCFullYear() > 2000;
}

/** Nombre real del titular del token, si el estado ya lo verificó. */
export function nombreAula(estado: EstadoToken | null): string | null {
  return estado?.configurado ? (estado.nombre ?? null) : null;
}

/** Líneas de detalle del estado: verificación, generación y última sincronización. */
export function detallesAula(
  estado: EstadoToken | null,
  ahora: Date,
  syncIso: string | null
): string[] {
  const out: string[] = [];
  if (estado?.configurado) {
    if (fechaUtil(estado.verificadoEn)) out.push(`Verificado ${hace(estado.verificadoEn, ahora)}`);
    // "guardado", no "generado": solo sabemos cuándo entró el token a la app.
    // Si lo generaste en el aula virtual y lo pegaste, la fecha real es anterior.
    if (fechaUtil(estado.guardadoEn)) out.push(`Token guardado ${hace(estado.guardadoEn, ahora)}`);
  }
  if (fechaUtil(syncIso ?? undefined)) {
    out.push(`Datos sincronizados ${hace(syncIso as string, ahora)}`);
  }
  return out;
}
