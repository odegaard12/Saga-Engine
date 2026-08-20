# Banco de simulación

Jugar la ruta sin caminarla, y romper la red a propósito para ver qué hace la
aplicación. Son dos herramientas: una en el navegador y otra contra el servidor.

Existe porque todo esto se venía escribiendo a mano en cada sesión de pruebas, y
cada vez salía un poco distinto. **Cuando la herramienta cambia entre medición y
medición, los números dejan de poder compararse.**

---

## En el navegador — `scripts/banco-de-simulacion.js`

Se pega entero en la consola con la pantalla del jugador abierta.

```js
await saga.arrancar()          // carga los nodos de la misión
saga.nodos()                   // tipo, radio, y si avanza al llegar
await saga.permisos()          // ubicación y cámara

saga.acercarse(5, 20)          // a 20 m del nodo 5
await saga.caminar(0, 1, 6)    // del nodo 0 al 1 en 6 pasos
await saga.jugar()             // pulsa lo que haga falta para superarlo

saga.red.cortar()              // sin cobertura
saga.red.lenta(3000, 10000)    // llega, pero tarda
saga.red.inestable(0.3)        // unas pasan y otras no
saga.bolsillo(true)            // pantalla apagada

saga.medir()                   // cronómetro a cero
saga.diario()                  // cambios de pantalla con su instante
saga.aparecio(/sin conexión/)  // ¿salió eso, y cuándo?
await saga.cola()              // lo que lleva sin subir
await saga.informe()
```

### Las tres cosas que no son evidentes

**1. El GPS se simula interceptando sólo la llamada con `fresh=`.**
`debugGeolocationShim.ts` sustituye `navigator.geolocation` antes de que arranque
React, pero saca la posición de `/api/game/<user>?fresh=<ts>`: te planta en el
nodo actual, así que con `?debug=1` a secas **no hay movimiento que observar**.
La aplicación pide su copia **sin** ese `fresh=`, y ahí está la diferencia:
reescribiendo sólo la del shim, el jugador se mueve y el nodo se queda quieto.

Si se reescriben las dos, jugador y nodo viajan juntos, la distancia no cambia
nunca y la prueba parece buena sin demostrar nada.

**2. Se mide con `MutationObserver`, no con temporizadores.** Con la pestaña
oculta el navegador estrangula `setTimeout` hasta una vez por minuto. Muestrear
«cada 200 ms» miente: se acaban midiendo los frenos del navegador.

**3. La red simulada no toca nunca la llamada del GPS.** Si se le corta la red al
shim, no hay forma de mover al jugador y la simulación se queda muerta.

### Antes de usarlo contra producción

- Usa el jugador de pruebas, **no el de una persona real**.
- `saga.nodos()` dice qué nodos **avanzan por proximidad**. Simular la llegada a
  uno de ésos le hace avanzar de verdad. Los `qr_collectible` exigen escanear,
  así que se puede simular la llegada sin consecuencias.
- `/api/heartbeat` planta la posición simulada en el mapa de los demás. Al
  terminar hay que limpiarla:

```
docker exec -w /app saga_engine_app python -c \
  "import sys;sys.path.insert(0,'/app');import main;main.clear_live_position('<jugador>')"
```

---

## Contra el servidor — `scripts/simular-carga.py`

```
python scripts/simular-carga.py lectura   --jugadores 15 --segundos 30
python scripts/simular-carga.py escritura --base http://127.0.0.1:8097
python scripts/simular-carga.py rafaga    --avances 6 --base http://127.0.0.1:8097
```

`lectura` es la única que se puede lanzar contra producción sin ensuciar nada.
Los otros dos modos **se niegan a correr** contra un servidor que no sea local,
porque plantan posiciones falsas en el mapa de gente real — ya ha pasado dos
veces. Hay una prueba que lo protege (`test_o_banco_de_simulacion.py`).

### Lo aprendido midiendo, ya metido dentro

- **Cloudflare devuelve 403 al agente de urllib.** Sin cabecera `User-Agent` de
  navegador se mide su borde —90 ms, 403— y parece que todo vuela.
- **El latido real va cada 30 s.** Quince jugadores son 0,5 peticiones por
  segundo. Un banco que mande 74/s sólo mide el limitador (24 avances y 12
  sincronizaciones por minuto y jugador). Para el ritmo de verdad, `--ritmo 30`.
- **`/api/advance` exige pase de jugador**, que se consigue entrando en
  `/player/<nombre>`. Sin cookie todo son 403 y parece el servidor roto.
- **El cuello no es la Raspberry.** Con 15 jugadores la espera pasa de 0,5 s a
  5,5 s mientras la Pi está al 0,18 % de CPU. Se mandan 214 KB por jugador: el
  límite es el caudal.

### Montar una instancia local para escribir a gusto

```
SAGA_DATA_DIR=/tmp/saga-pruebas SAGA_STORAGE_BACKEND=sqlite \
  ALLOW_DEFAULT_ADMIN=1 python -m uvicorn main:app --port 8097
```

Con jugadores inventados (`PROBA01`…`PROBA15`) no hay nada que limpiar después.
