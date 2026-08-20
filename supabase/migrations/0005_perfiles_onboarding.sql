-- Onboarding de 3 pasos + loader (spec `specs/onboarding-y-salida`).
--
-- El prototipo del handoff no persiste nada y muestra el onboarding en CADA
-- login; su propio README recomienda un flag por usuario en el backend. Acá va
-- esa columna: se muestra una sola vez por persona, y nunca en localStorage
-- (una persona con dos dispositivos lo vería dos veces).
--
-- Nullable a propósito: `null` = todavía no lo vio. No hay default `now()`
-- porque las cuentas que YA existen tienen que verlo una vez.
--
-- Sin policies nuevas: `perfiles` ya tiene RLS por auth.uid() para select y
-- update, y esta columna vive en la misma fila.

alter table public.perfiles
  add column onboarding_en timestamptz;
