# Desplegar Mi Cursada — runbook

Cómo poner la app en internet hoy, tal como está (un solo usuario, escribiendo en
`datos/`), sobre una VM gratuita. El plan multiusuario completo es
`docs/superpowers/specs/2026-08-16-autohospedaje-multiusuario-design.md`; esto es el
primer paso de ese plan, invertido a propósito: **infraestructura primero, multiusuario
después**, así cada mejora se despliega de verdad desde el día uno.

Todo lo que se usa acá está en el repo: `Dockerfile` (raíz) y la carpeta `despliegue/`
(compose de producción, Caddyfile, scripts y ejemplos de variables).

**Seguridad de la versión actual:** la app es de un solo dueño. Además de la regla "la
primera cuenta que entra se queda con la app" (`app/actions-sesion.ts`), en producción
va **siempre** `CURSADA_USUARIOS_PERMITIDOS` con tu usuario del aula virtual: sin la
variable, entre el `docker compose up` y tu primer login cualquiera que encuentre la URL
podría reclamar la app.

---

## 1. La VM (Oracle Cloud Always Free)

1. Cuenta en <https://www.oracle.com/cloud/free/>. Pide tarjeta para verificar
   identidad; no cobra. Elegí una *home region* con capacidad ARM (Sao Paulo suele
   andar; Chile también).
2. **Compute → Instances → Create.** Shape `VM.Standard.A1.Flex` (Ampere): 4 OCPU,
   24 GB — el máximo Always Free. Imagen: **Ubuntu 24.04 (aarch64)**. Subí tu clave SSH
   pública. Si da *"Out of host capacity"*, reintentá en otro horario u otra
   *availability domain*; es normal y no significa nada roto.
3. Anotá la IP pública.
4. Recomendado apenas la cuenta funcione: **Billing → Upgrade to Pay As You Go**.
   Dentro de los límites Always Free se sigue pagando $0, y la cuenta deja de estar
   sujeta al reclamo de instancias "ociosas".

## 2. Los DOS firewalls (acá se traba todo el mundo)

Oracle filtra dos veces: en la red (consola web) **y** en `iptables` dentro de la VM.
Si abrís uno solo, el sitio no responde y parece que Caddy está roto.

**a) Consola web:** VCN de la instancia → *Security List* de la subnet → **Add Ingress
Rules**: origen `0.0.0.0/0`, TCP, puertos de destino `80,443` (y una regla UDP `443`
para HTTP/3, opcional).

**b) Dentro de la VM** (la imagen de Ubuntu de Oracle trae reglas que rechazan todo
menos SSH):

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p udp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

## 3. Endurecer la base

```bash
# SSH solo con clave (verificá ANTES que tu clave entra en otra terminal)
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl reload ssh

# Actualizaciones de seguridad automáticas
sudo apt update && sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # cerrar sesión SSH y volver a entrar
```

## 4. Dominio gratis (DuckDNS)

1. <https://www.duckdns.org> → entrá con GitHub → creá `micursada` (o el nombre libre
   que haya) → apuntalo a la IP de la VM.
2. La IP de Oracle es fija mientras la instancia viva, así que no hace falta el
   updater de DuckDNS.
3. El día que compres un dominio propio (~US$12/año): cambiás el DNS y `DOMINIO` en
   `.env`, `docker compose up -d`, y Caddy saca el certificado nuevo solo.

## 5. Subir la app

```bash
git clone https://github.com/TU-USUARIO/micursada.git
cd micursada/despliegue
cp .env.ejemplo .env
nano .env        # DOMINIO y CURSADA_USUARIOS_PERMITIDOS (tu usuario del aula)
docker compose up -d --build
```

Dos o tres minutos de build y Caddy pide el certificado en el primer request.
Entrá a `https://TU-DOMINIO`, logueate con tu usuario del aula virtual y listo:
ese primer login te deja como dueño de la app.

Ver qué pasa: `docker compose logs -f app` (o `caddy`).

## 6. Backup (no es opcional)

Los overlays (notas, horarios, avisos) **no existen en Moodle**: si se pierde el
volumen, no se regeneran. B2 de Backblaze da 10 GB gratis; el backup va cifrado de
nuestro lado (restic), así que B2 no puede leerlo.

```bash
cd ~/micursada/despliegue
cp .env.backup.ejemplo .env.backup
nano .env.backup                 # bucket, claves de B2 y RESTIC_PASSWORD
./backup.sh init                 # una sola vez
./backup.sh                      # primer backup, a mano
crontab -e                       # y programarlo:
# 0 3 * * * /home/ubuntu/micursada/despliegue/backup.sh >> /tmp/micursada-backup.log 2>&1
```

**Guardá `RESTIC_PASSWORD` también fuera de la VM** (gestor de contraseñas). Sin esa
clave el backup es ruido, ni siquiera para vos.

## 7. Probar la restauración (una vez, ahora)

Un backup que nunca se restauró no es un backup:

```bash
docker run --rm -v /tmp/restaurado:/restaurado \
  -e RESTIC_REPOSITORY -e RESTIC_PASSWORD -e B2_ACCOUNT_ID -e B2_ACCOUNT_KEY \
  restic/restic restore latest --target /restaurado
ls /tmp/restaurado/datos   # tienen que estar los .json
```

(Correrlo con las variables cargadas: `source .env.backup` antes.)

## 8. Mejoras semanales

En tu PC: commit y push a `main` como siempre. Después:

```bash
ssh ubuntu@TU-IP 'cd micursada/despliegue && ./actualizar.sh'
```

Trae `main`, reconstruye la imagen y reinicia. El volumen de datos no se toca. Hay
unos segundos de caída: con usuarios adentro, correlo de madrugada.

Cuando hacerlo a mano moleste, el paso siguiente es un workflow de GitHub Actions que
corra ese mismo script por SSH en cada push a `main` (la clave SSH como secret del
repo). No hace falta antes.

## 9. Avisos al celular (ntfy)

`backup.sh` ya avisa si el backup falla, vía <https://ntfy.sh> (app FOSS, instalá el
cliente en el celular y suscribite al tópico). Solo hay que poner `NTFY_TOPIC` en
`.env.backup` con un nombre impredecible.

El aviso de "primer usuario registrado" llega con la fase 3 del plan (invitaciones):
hoy no puede pasar, porque la allowlist solo te deja entrar a vos — que es exactamente
la idea.

## 10. Si Oracle no coopera

Cuenta rebotada, sin capacidad ARM por días, o instancia reclamada: el mismo repo
corre en cualquier VPS con Ubuntu (Hetzner ~€4/mes es el clásico). Los pasos son los
mismos desde §3 — sin el firewall doble de §2, que es cosa de Oracle — y los datos
vuelven del backup con §7. Esa portabilidad es el motivo de que todo viva en
`docker compose`.

---

## Checklist del día

- [ ] VM creada, IP anotada, cuenta en Pay As You Go
- [ ] Puertos 80/443 abiertos en la security list **y** en iptables
- [ ] SSH sin contraseña + unattended-upgrades + Docker
- [ ] DuckDNS apuntando a la IP
- [ ] `.env` con `DOMINIO` y `CURSADA_USUARIOS_PERMITIDOS`
- [ ] `docker compose up -d --build` y login tuyo exitoso por HTTPS
- [ ] Backup configurado, corrido, **y restauración probada**
- [ ] `RESTIC_PASSWORD` guardada fuera de la VM
