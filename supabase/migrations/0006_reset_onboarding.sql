-- Reset del onboarding para TODAS las cuentas (pedido del 19/08).
--
-- La 0005 nació nullable justamente para que las cuentas ya existentes vieran
-- el onboarding una vez. Pero entre que se aplicó y hoy hubo pruebas que le
-- escribieron el timestamp a algunas cuentas (entre ellas la del dueño), así
-- que nunca lo verían. Esto las devuelve a `null`.
--
-- Es una migración de DATOS, no de esquema: se corre una sola vez y en un
-- proyecto nuevo no toca nada (no hay filas). Va como migración porque es la
-- única vía versionada que tenemos para escribir en el remoto, y así queda
-- registrado en el repo por qué todos volvieron a ver la presentación.
--
-- NO borra el consentimiento: son dos cosas distintas y el consentimiento no se
-- vuelve a pedir a quien ya lo dio.

update public.perfiles
   set onboarding_en = null
 where onboarding_en is not null;
