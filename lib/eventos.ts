// Log de eventos para métricas — SOLO SERVIDOR. Guarda el hash del usuario,
// nunca contenido. Nunca rompe el flujo que lo llama.
import { hashUsuario } from '@/lib/cifrado';
import { adminClient, adminConfigurado } from '@/lib/supabase/admin';

export async function registrarEvento(
  evento: string,
  userId?: string,
  datos: Record<string, unknown> = {}
): Promise<void> {
  if (!adminConfigurado()) return;
  try {
    const admin = adminClient();
    await admin.from('eventos').insert({
      evento,
      usuario_hash: userId ? hashUsuario(userId) : null,
      datos,
    });
  } catch (e) {
    console.error('registrarEvento:', e instanceof Error ? e.message : e); // nunca rompe el flujo
  }
}
