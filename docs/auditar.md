# Prompt de auditoría: buscar los fallos que quedan

Pégale esto a Claude en una conversación nueva, junto con `docs/continuar.md`.

---

Audita SAGA buscando fallos que **rompan una ruta de campo**. No busques estilo
ni deuda técnica: busca cosas que dejen a un jugador tirado en el monte.

## Cómo buscar

**Mide, no supongas.** Los peores fallos de este proyecto no se vieron leyendo
código: se vieron pidiendo un endpoint y contando bytes, cronometrando un
arranque, o comparando lo que manda el servidor con lo que declara el móvil.
Antes de afirmar nada, compruébalo contra la misión real en la Raspberry o
contra https://sagagia.es.

**Di lo que no puedas demostrar.** Si una hipótesis no se sostiene al medirla,
dilo y corrígete. Ya ha pasado dos veces en este proyecto y ambas veces la
corrección valía más que la hipótesis.

## Patrones que ya han mordido aquí

Búscalos otra vez, en sitios donde todavía no se haya mirado:

1. **Fallos que no se ven.** Un error del servidor que el móvil disfraza de
   «sin cobertura». Un `catch` mudo. Un juego que no carga y no dice por qué.
   Un mensaje que promete algo que no va a pasar. *Un cero en pantalla suele ser
   un guardado que no ocurrió.*
2. **Dos verdades sobre lo mismo.** Dos almacenes, dos colas, dos sitios donde
   vive la misma configuración, dos formas de contar lo mismo. Siempre acaban
   divergiendo. Ya aparecieron: dos colas offline, `config` contra
   `minigame.config`, `finished_count` calculado en dos sitios.
3. **Código que parece vivo y no lo está.** Rutas escritas dos veces donde sólo
   responde una. Componentes de relleno. Funciones sin llamantes. Aquí hubo
   cinco rutas fantasma y un registro de minijuegos que pintaba un aviso en
   inglés al jugador.
4. **Trabajo que no hace falta.** Peticiones que repiten lo que el servidor ya
   sabe. Lecturas cuyo resultado se tira. Descargas que se rehacen cada
   arranque. Ciclos que corren con la pantalla apagada.
5. **Callejones sin salida.** Estados de los que el jugador no puede salir sin
   reinstalar: «LOCALIZANDO…» para siempre, una cola que no baja nunca, una
   caché borrada sin red.
6. **Lo que pasa en la transición.** Casi todo lo grave estuvo en el paso de sin
   cobertura a con cobertura, en un despliegue a mitad de partida, o en dos
   peticiones que se pisan. El estado estable rara vez falla.
7. **Datos de personas.** Nombres, fotos y rastros GPS. Comprueba qué se sirve
   sin sesión, qué se cachea como público y qué se guarda para siempre.

## Sitios donde aún no se ha mirado a fondo

- `AdminApp.tsx` (3 633 líneas) y `MapSurface.tsx` (2 491): sin tocar.
- El editor de nodos y el guardado desde administración.
- Los minijuegos uno a uno, con el payload REAL que recibe el móvil
  (`main.project_stage_for_player(stage, include_runtime=True)`), no con los
  valores por defecto del código.
- El arranque en frío de un móvil que nunca ha abierto la aplicación.
- Qué pasa con dos jugadores que completan el mismo nodo a la vez.
- El reseteo de un jugador desde el panel a mitad de partida.

## Cómo entregarlo

Por cada hallazgo:

- **Qué pasa**, en una frase.
- **El síntoma que vería un jugador**, si lo hay.
- **Dónde**, con fichero y línea.
- **La prueba**: el número, la respuesta del endpoint o la traza que lo
  demuestra. Si no la tienes, dilo.
- **Gravedad** según si rompe una ruta, la degrada, o sólo estorba al mantenerla.

Ordena por lo que rompería una ruta primero. Y si al medir descubres que algo de
`docs/continuar.md` es falso, corrígelo ahí.
