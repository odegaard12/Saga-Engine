# 📜 SAGA Engine Changelog & Historial de Versiones

---

## 🧭 Version 3.9.7.1 (31 de Julio, 2026)

### 🚀 Hotfixes Principales

#### 1. 🗺️ Leaflet — Zoom y Rutas Estables
- Ajustado el renderizado de líneas con `noClip` y renderer específico para mantener visibles las rutas al hacer zoom sin romper tiles ni senderos amarillos.
- Revertidos cambios globales de canvas que afectaban a capas no relacionadas.

#### 2. 📍 Editor de Rutas — Waypoints y HUD en Tiempo Real
- El arrastre de líneas vuelve a insertar waypoints correctamente.
- La distancia y métricas del HUD se recalculan en directo al arrastrar nodos.
- Las rutas del editor se refrescan dinámicamente al hacer pan sobre el mapa.

#### 3. 🏷️ QR Físicos — Impresión y Validación Coherente
- Corregida la lógica de `printQrs` para que payloads y tarjetas coincidan con nodos físicos reales.
- Añadidas comprobaciones físicas más robustas al imprimir QR.
- Resueltos errores TypeScript en `printQrs` y en el scope del canvas renderer.

---

## ✨ Version 3.9.7 (31 de Julio, 2026)

### 🚀 Novedades y Mejoras Principales

#### 1. 🏷️ Rediseño de Tarjetas QR Físicas
- Soporte completo para Objeto QR, Llave QR, Pista QR y Bonus QR con badges visuales distintivos.
- Los títulos de QR y coleccionables ahora se editan desde los encabezados principales del editor y el panel de tarjetas QR.

#### 2. 🗺️ Senderos OSM y Rutas Leaflet Más Estables
- Correcciones de clipping para evitar desapariciones de rutas, senderos y elementos del mapa al cambiar el zoom.
- Uso refinado de capas vectoriales para mantener consistencia visual en el editor.

#### 3. ⚡ HUD y Playback de Ruta
- Nuevo playback de ruta con marcador animado sobre Leaflet.
- Sincronización en tiempo real de métricas del HUD mientras se mueven nodos.

#### 4. 🌐 Contenido y UX del Admin
- Añadido texto narrativo en gallego a los stages.
- Mejorada la edición inline de títulos para nodos y tarjetas desde la UI principal.

---

## ✨ Version 3.9.5 (30 de Julio, 2026)

### 🚀 Novedades y Mejoras Principales

#### 1. 🔁 Resolución de Pull Requests
- Integración y cierre de correcciones pendientes procedentes de PRs recientes para estabilizar la rama.

#### 2. 📦 Lockfile Auto-Sync
- Sincronización automática del lockfile para evitar desajustes entre dependencias, instalaciones locales y despliegues.

#### 3. 🗺️ Mapa a 60 FPS y Senderos OSM
- Ajustes de rendimiento para acercar el editor a 60 FPS.
- Inclusión de senderos OSM como apoyo visual en el mapa.

#### 4. 🧭 HUD Compacto
- Refinamiento del HUD para presentar información clave con menor ocupación de espacio en pantalla.

---

## 🔮 Version 3.5.0 (21 de Julio, 2026)

### 🚀 Novedades y Mejoras Principales

#### 1. 🔮 10 Recetas Temáticas Completa (Tecnología, Medieval, Místico)
- **Tecnología / Sci-Fi:**
  - `Llave Maestra`: Llave Rota + Cinta Aislante
  - `Carga EMP`: Batería de Litio (x2) + Cables de Cobre (x3) + Placa Base
  - `Decodificador Cuántico`: Chip Encriptado + Antena de Frecuencia + Batería de Litio
  - `Escáner Biométrico`: Sensor Óptico + Placa Base + Cristal de Enfoque
- **Medieval / Fantasía:**
  - `Amuleto del Guardián`: Gemas Antiguas (x2) + Fragmento de Escudo + Hilo de Plata
  - `Elixir de Alquimia`: Hierbas Curativas (x2) + Frasco de Cristal + Agua Purificada
  - `Escudo Rúnico`: Placa de Hierro (x2) + Runa de Protección + Hilo de Plata
- **Místico / Oculto:**
  - `Orbe de Fuego Arcano`: Esfera de Cristal + Esencia Ígnea (x2) + Polvo Estelar
  - `Reliquia Sagrada`: Fragmento de Reliquia (x2) + Esencia Sagrada + Pergamino Antiguo
  - `Amuleto de Visión Suprema`: Ojo Místico + Gemas Antiguas + Polvo Estelar

#### 2. 📍 Colocación Secuencial 1 a 1 de Chinchetas en el Mapa
- Creación de chinchetas paso a paso (`1/3`, `2/3`, `3/3`) al pulsar **⚡ Generar chincheta(s)**.
- Solo aparece **1 chincheta a la vez** en el mapa para situarla limpiamente. Al pulsar **`✅ Confirmar posición (1/3)`**, aparece la siguiente sin sobrecargar la pantalla ni abrir modales de selección de tipo.

#### 3. 🎒 Editor Guiado Directo para Nodos Coleccionables GPS
- Los nodos coleccionables creados desde la pestaña de Objetos muestran **🎒 Objeto Coleccionable en Mapa (Punto GPS)** directo sin tarjetas QR ni payloads de código QR impreso.

#### 4. 🌐 Traducción 100% Gallego (gl) Bi-direccional
- Traducción completa de la interfaz en gallego con puente bidireccional que permite alternar inmediatamente entre **Español y Gallego** manteniendo intacto el estado.

#### 5. 💻 Layout Adaptativo para Pantallas PC
- Panel flotante ampliado a **1180px** en escritorios con rejilla responsiva de 2 a 3 columnas para fichas de jugadores y objetos.

#### 6. 📜 Ventana Modal de Novedades
- Botón **`📜 v3.5.0 Novedades`** en la barra de control del Admin para inspeccionar la lista de notas de versión.

---

## 📍 Version 3.4.0 (20 de Julio, 2026)

### 🚀 Novedades y Mejoras Principales

#### 1. 🧭 Cono de Dirección y Orientación GPS
- Indicador visual de rumbo y orientación en tiempo real sobre el mapa para el jugador activo.

#### 2. 📱 PWA Cache Revamp y Persistencia Offline
- Renovación del almacenamiento en caché service worker para permitir juego offline fluido sin conexión a red.

#### 3. 🔒 Memoria de Sesión de Jugador
- Persistencia automática de las credenciales y el estado del jugador activo tras recargas de navegador o reconexiones.

#### 4. 🛡️ Validación Dinámica de Rutas
- Verificación automática en el Admin de que existan los ingredientes para todas las recetas antes de guardar la misión.
