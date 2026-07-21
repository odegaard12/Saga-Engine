# 📜 SAGA Engine Changelog & Historial de Versiones

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
