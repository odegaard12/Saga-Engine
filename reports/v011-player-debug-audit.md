# SAGA v0.1.1 — Auditoría rápida Player / Debug GPS

## Contexto

Tras validar el primer juego jugable, “Señal GPS”, se detecta que el modo debug puede no ser suficientemente predecible para probar desde casa.

## Hallazgos

### 1. Debug GPS depende de navigator.geolocation

El shim actual no se instala si el navegador no expone `navigator.geolocation`.

Riesgo:
- En un entorno sin geolocalización real, el debug no ayuda.
- En navegador/permiso raro, el jugador puede quedarse en “Solicitando posición GPS”.

Decisión:
- No bloquear v0.1.1 por esto.
- Próximo parche recomendado: permitir un geolocation fake aunque `navigator.geolocation` no exista, solo si `debug=1` o perfil debug.

### 2. Debug GPS apunta al stage actual

El shim obtiene el nodo actual desde `/api/game/<user>` y devuelve sus coordenadas como posición fake.

Ventaja:
- Permite probar desde casa si el perfil o URL tienen debug.

Riesgo:
- Si el backend cambia de nodo o la misión no está sincronizada, el debug puede parecer inconsistente.
- No hay panel visible que diga “DEBUG GPS activo”.

Decisión:
- Añadir indicador visual en Player Tools en el siguiente parche.

### 3. Falta checklist de gameplay player

Necesitamos una matriz manual antes de añadir nuevos minijuegos:

- GPS normal con permiso real.
- GPS denegado.
- Debug GPS por URL.
- Debug GPS por perfil.
- Offline pack.
- Reintentar GPS.
- Completar nodo.
- Sync al backend.
- Avanzar al siguiente nodo.
- Fallback/manual.

## Decisión para v0.1.1

- Mantener “Señal GPS”.
- Corregir admin drag para que mover nodo no abra el editor.
- No ampliar minijuegos hasta cerrar GPS real/debug y Rumbo.
