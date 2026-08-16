# Plan de despliegue en Vercel — Mi Cursada para ~20 personas

Objetivo: que la app viva en una URL pública, que la usen unas 20 personas de distintas
carreras del instituto, y que el costo sea **$0 por mes**. Incluye un panel para ver
cuánta gente la usa.

Estado: **plan, no implementado.** Los números de límites están verificados contra la
documentación vigente (agosto 2026).

---

## 1. Por qué hoy no se puede subir tal cual

La app guarda todo en archivos dentro de `datos/`. Vercel corre sin disco propio: cada
visita puede caer en una máquina distinta y lo que se escribe se pierde. No es un
problema de Vercel, es que el modelo de archivos no viaja.

Además, hoy la app es de un solo usuario: los overlays (`horarios.json`,
`bloques.json`, …) no distinguen de quién es cada dato.

Los dos cambios necesarios son, entonces: **base de datos** y **multiusuario**.

---

## 2. Arquitectura propuesta

```
Navegador (celular)
      │
      ▼
Vercel (Next.js)  ── login con credenciales del aula virtual
      │              (el token de cada persona se cifra antes de guardarse)
      ├──► Postgres (Supabase free)   datos de todos, separados por usuario
      └──► Aula Virtual ORT (API)     solo lectura, ya funciona
```

Sin servidores propios, sin Docker, sin que tu PC quede prendida.

---

## 3. Costo real: $0, y qué lo rompería

| Servicio | Plan | Qué da | Costo |
|---|---|---|---|
| **Vercel** | Hobby | 1M invocaciones/mes, 100 GB de transferencia, funciones de hasta 300 s | **$0** |
| **Vercel Web Analytics** | Hobby | 50.000 eventos/mes | **$0** |
| **Supabase** | Free | 500 MB de base, autenticación, backups | **$0** |
| Dominio propio | opcional | `micursada.vercel.app` es gratis | $0 (o ~US$12/año) |

Con 20 personas entrando algunas veces por día, el consumo queda **muy por debajo** de
todos esos techos: 50.000 eventos de analítica alcanzan para unas 80 visitas diarias por
persona.

**Las tres cosas que romperían el $0:**

1. **Uso comercial.** El plan Hobby es solo para proyectos no comerciales. Mientras sea
   entre compañeros y sin cobrar, está en regla. Si algún día se cobra, hay que pasar a
   Pro (US$20/mes).
2. **Crecer mucho.** A partir de ~200 usuarios activos conviene revisar; 20 no mueve la aguja.
3. **Guardar los PDFs.** Si se cachean los archivos del aula en la base, los 500 MB se
   consumen rápido. **Decisión: no cachearlos** — se sirven a demanda desde Moodle, como ya hace el proxy.

---

## 4. Multiusuario: el contenido se comparte, lo tuyo es tuyo

La idea que abarata todo: **si cinco personas cursan Fundamentos, el contenido de la
materia es el mismo**. No hay que guardarlo ni sincronizarlo cinco veces.

```
cursos            (compartido)  id_moodle, nombre, secciones, módulos, contenido
inscripciones     usuario ←→ curso
avisos            (compartido)  fechas de entrega del curso
─────────────────────────────────────────────────────────────────
usuarios          id_moodle, nombre, carrera, alta, última_visita
credenciales      usuario, token_cifrado
horarios          usuario, curso, día, inicio, fin
bloques           usuario, curso, contenido de las notas
avisos_estado     usuario, aviso, hecho
perfil            usuario, nombre, instituto, avatar
```

Beneficios: menos espacio, menos llamadas al servidor del instituto (importante: es el
servidor de ORT, no conviene golpearlo 20 veces por lo mismo), y sincronización más rápida.

---

## 5. Seguridad: la parte que no es opcional

Guardar los tokens de 20 personas es asumir responsabilidad sobre sus cuentas. Cada token
da acceso de lectura a la cuenta de esa persona en el aula virtual.

**Requisitos mínimos, no negociables:**

1. **Cifrar los tokens en la base** (AES-GCM) con una clave que viva solo en las variables
   de entorno de Vercel. Si alguien se lleva un dump de la base, se lleva ruido.
2. **La contraseña nunca se guarda.** Ya funciona así: se usa para pedir el token y se descarta.
3. **Pantalla de consentimiento en el primer ingreso**, en castellano y clara: qué se
   guarda, para qué, quién lo administra (vos) y cómo borrar la cuenta.
4. **Botón de "borrar mi cuenta"** que elimine token y datos personales de verdad.
5. **Aislamiento por usuario en la base** (Row Level Security de Postgres), para que un bug
   en una consulta no pueda mostrarle a alguien los datos de otro.

---

## 6. El panel de administración

Ruta `/admin`, visible solo para tu usuario (comparación contra tu id de Moodle en una
variable de entorno).

**Qué muestra:**

- Cuántas personas se registraron, cuántas entraron esta semana, cuántas son nuevas.
- Lista de usuarios: nombre, carrera, fecha de alta, última visita, cantidad de materias.
- Actividad en el tiempo (visitas por día) — con Vercel Analytics.
- Salud del sync: última corrida, cursos actualizados, errores.

**Qué NO muestra, a propósito:**

> Las notas de clase, el contenido de la bitácora, las calificaciones ni los avisos
> personales de nadie. Podés ver **que** usan la app; no **qué** escriben en ella.

Esto no es una limitación técnica, es una decisión de diseño. Si construís un panel que
te deja leer los apuntes privados de tus compañeros, la app deja de ser algo que puedan
usar con confianza. Y conviene que el panel diga explícitamente qué datos ves, para que
puedas mostrárselo a quien pregunte.

---

## 7. Sincronización automática

Vercel Hobby permite **cron una vez por día**. Alcanza: el contenido del aula no cambia
cada hora.

- **Cron diario** (de madrugada) que recorre los cursos únicos y refresca contenido y
  fechas de entrega. Como el contenido es compartido, son ~10-20 cursos, no 20 × 7.
- **Botón "Sincronizar ahora"** (ya existe) para cuando alguien no quiere esperar.
- Llamadas secuenciales con pausa, como hoy. Si el trabajo se acerca al límite de 300 s
  por función, se procesa por lotes y se continúa al día siguiente.

---

## 8. Fases de implementación

| Fase | Qué | Riesgo |
|---|---|---|
| **1. Base de datos** | Migrar de archivos a Postgres, con la separación por usuario de la sección 4. Las migraciones SQL ya existen y hay que ampliarlas. | Medio |
| **2. Multiusuario** | Que cada request sepa de quién es, cifrado de tokens, RLS, consentimiento y borrado de cuenta. | Medio |
| **3. Deploy** | Proyecto en Vercel, variables de entorno, dominio, cron diario. | Bajo |
| **4. Panel** | `/admin` con las métricas de la sección 6 + Vercel Analytics. | Bajo |
| **5. Onboarding** | Que alguien de otra carrera entre y funcione sin tocar código: carrera desde su perfil de Moodle y horarios cargables a mano (el PDF de horarios es por sede y carrera). | Medio |

Se puede parar después de la 3 y ya tenés la app en línea para vos y tus amigos; el panel
es independiente.

---

## 9. Lo que hay que resolver sí o sí antes de invitar gente

1. **Los horarios no vienen de Moodle.** Hoy los cargamos leyendo el PDF de Analista de
   Sistemas Almagro. Cada carrera tiene el suyo. Para otros, o los cargan a mano en la app
   (ya se puede) o se agrega un lector de esos PDFs.
2. **La carrera está fija** en la barra lateral. Hay que tomarla del perfil de cada uno.
3. **Decidir qué pasa si el instituto cambia las reglas.** Si ORT deshabilita el servicio
   móvil, la app deja de sincronizar para todos a la vez. Conviene que los datos ya
   sincronizados sigan visibles (hoy es así) y avisar en el panel.

---

## 10. Recomendación

Empezá por las fases 1 a 3 y probala con dos o tres amigos antes de abrirla a veinte.
El costo es $0 real, el trabajo grande es la fase 1, y la parte que exige criterio —no
código— es el consentimiento y el cifrado de los tokens.
