# Relevo: dónde está SAGA y qué falta

Pégale esto a Claude en una conversación nueva. Está escrito para que no haga
falta nada más.

---

## Contexto en dos párrafos

SAGA es una gymkhana GPS que se jugó de verdad en el monte (10 nodos,
8,26 km, +271 m, 13 jugadores, textos en gallego). El motor aguantó y la gente
terminó, pero falló mucho: nodos que mandaban a repetir, juegos que no cargaban,
arranques de veinte segundos, pegatinas QR que no leía ningún móvil.

Desde entonces se ha reconstruido: 20 fallos corregidos y medidos antes y
después contra la misión real. **Nada se ha probado caminando la ruta**, y ésa
sigue siendo la única prueba que vale.

## Cómo trabajar aquí (esto es lo importante)

1. **Medir antes de tocar.** Todo lo arreglado salió de un número, no de una
   sospecha: 1 de 10 nodos con minijuego, 22 s de arranque, 135 KB de fotos en
   el config, 1 920 peticiones/hora. Sin medir se arregla lo que se ve, no lo
   que duele.
2. **Una prueba que falle antes del arreglo.** Si no se puede escribir, es que
   no se ha entendido el fallo.
3. **Comprobar contra la misión real**, no contra un ejemplo inventado.
4. **Después de CADA cambio de rutas**, comparar comportamiento:
   `python3 scripts/inventario-de-rutas.py` antes y después, y `--comparar`.
   No fiarse de `app.routes`: con la FastAPI de algunas máquinas no enseña lo
   que añade `include_router` aunque el servidor lo sirva.
5. **Probar en Android**, no sólo en escritorio. Un fallo llegó a producción y
   sólo apareció ahí.
6. **Decir lo que no está demostrado.** Ya pasó dos veces: se afirmó que la zona
   de silencio del QR era la causa del fallo de campo y al medirlo no lo era.

## Despliegue

- Repo local: `C:\Users\oscar\saga-engine-work`. Público en
  `github.com/odegaard12/Saga-Engine`. Historia reiniciada en agosto de 2026.
- Producción: Raspberry `192.168.68.104`, contenedor `saga_engine_app`,
  puerto 8096, público en **https://sagagia.es** por Cloudflare Tunnel.
- **SSH sólo desde PowerShell** (la clave está en el agente de Windows; Git Bash
  no la ve). Para plumbing de git usar **Bash**, que PowerShell mete BOM.
- Árbol de trabajo en la Pi: **`/home/odegaard12/saga_v4`**. El viejo
  `saga_engine` está desfasado; no usarlo.
- Ciclo de despliegue:
  ```
  git bundle create "$env:TEMP\saga-v4.bundle" main
  scp ... odegaard12@192.168.68.104:/tmp/saga-v4.bundle
  ssh ... "cd /home/odegaard12/saga_v4 && git fetch -q /tmp/saga-v4.bundle main &&
           git reset -q --hard FETCH_HEAD && cd frontend && npx tsc -b &&
           cd .. && docker build -q -t saga_engine:X.Y.Z . &&
           docker stop saga_engine_app && docker rm saga_engine_app &&
           docker run -d --name saga_engine_app --restart unless-stopped -p 8096:5000
             -e SAGA_STORAGE_BACKEND=sqlite
             -v /home/odegaard12/saga_engine_data:/app/data saga_engine:X.Y.Z"
  ```
- No hay Node en el Windows local: **el TypeScript se compila en la Pi**.
- Copias de seguridad de la historia en `C:\Users\oscar\saga-engine-backups`.

## Trampas conocidas

- **`main.py` tiene un import circular.** Los routers hacen `import main` DENTRO
  de sus funciones. 89 símbolos de superficie, 36 imports. Eso permitió que
  cinco rutas existieran por duplicado y sólo respondiera una: la otra parecía
  viva y editarla no hacía nada. Hay un test que lo impide
  (`tests/test_rutas_duplicadas.py`).
- **Hooks de React.** Cualquier hook nuevo en `PlayerApp.tsx` va ARRIBA, antes de
  los `return` tempranos. Meter uno detrás tira la aplicación entera con el
  error 310. Ya pasó y llegó a producción.
- **La fuente de verdad es `saga.sqlite3`**, no los JSON. Los JSON se escriben
  como espejo; editarlos a mano no cambia nada y parece que sí.
- **La config de un nodo vive en dos sitios**, `config` y `minigame.config`, y
  manda la segunda. Usar siempre `player/configDelNodo.ts`.
- **`/api/game` sólo manda el contenido jugable de TODOS los nodos con
  `?offline_pack=true`.** Cualquier sitio que guarde un payload como paquete
  offline tiene que pedirlo así, o los nodos siguientes se quedan sin juego.
- La contraseña de admin del contenedor está caducada; Oscar tiene la buena.

## Lo hecho (para no rehacerlo)

Motor de QR nuevo sin OpenCV · progreso a prueba de cobertura mala · una sola
cola offline con orden, candado y espera creciente · arranque de 22 s a 0,1 s ·
tráfico de 24 a 1,9 MB por jugador y hora · fotos de campo cerradas al público ·
endpoint de borrado de datos personales · bloqueo vertical · anti-trampas ·
cinco rutas fantasma eliminadas · dependencias fijadas · repositorio construible
desde un clon limpio · `main.py` de 2 444 a 1 738 líneas y 0 rutas.

## Lo que falta, por orden de lo que yo haría

1. **Partir `PlayerApp.tsx`** (3 154 líneas). Van dos tajadas: fotos
   (`hooks/useFotosDeCampo.ts`) y reglas de GPS (`gps/decisiones.ts`). Faltan:
   el ciclo de sincronización, los permisos de cámara y movimiento, el bloque de
   inventario y avisos, y el arranque de minijuegos.
2. **Romper el import circular de `main.py`.** Va por grupos: quedan config,
   jugadores/progreso/tiempos, eventos y sesiones. Patrón usado hasta ahora:
   mover a `backend/app/`, reexportar desde `main.py` para no romper nada, y
   verificar por comportamiento.
3. **`AdminApp.tsx`** (3 633 líneas) y **`MapSurface.tsx`** (2 491), sin tocar.
4. **Un ensayo completo de la ruta en modo avión**, de principio a fin.
5. Botón de borrado de datos en el panel (endpoint hecho, aparcado a petición).
6. Reimprimir SAGA_01 y SAGA_02 (aparcado a petición).

## Lo descartado a propósito

- **Cargar los minijuegos bajo demanda.** El precache offline sólo guarda los
  scripts ya presentes en la página, así que un trozo cargado a demanda no
  estaría en el móvil al abrir el juego en el monte. Sería reintroducir el fallo
  más caro de todos.
- **Reescribir el motor** en otra tecnología, cambiar SQLite por Postgres, o
  hacer multi-inquilino. Varias misiones a la vez ya funcionan con un contenedor
  por ruta (`scripts/crear-mision.sh`), con aislamiento por procesos y ficheros.
