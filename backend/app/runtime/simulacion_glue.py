"""Banco de pruebas del panel: cablea el estado real de `main` con `simulation_bench`.

Sacado de `main.py` sin cambiar comportamiento. Todo lo que estas funciones usan
de `main` se pide como `main.NOMBRE` en el momento de la llamada (igual que hacen
los routers), de modo que lo que un test o el arranque cambie en `main` --rutas de
fichero, funciones sustituidas-- sigue mandando. `main` re-exporta estos nombres.
"""



async def run_simulation_bench(jugadores, dispositivo, red):
    """Registra los SIM_XX como perfiles conocidos MIENTRAS dura la
    simulación, y devuelve la configuración exactamente a como estaba pase lo
    que pase.

    Hace falta porque `/api/events/sync` -el camino sin cobertura- exige un
    perfil CONOCIDO (`resolve_known_player_profile`); `/api/advance` no,
    porque `get_player_profile` cae a un perfil sintético para cualquier
    nombre. Son dos guardias distintas para el mismo caso, y el banco tiene
    que pasar las dos para probar los dos caminos de verdad.

    Efecto colateral bienvenido: mientras corre, un admin con el panel
    abierto en otra pestaña ve aparecer y moverse a los SIM_XX -es la
    confirmación visual de que el banco está haciendo algo de verdad, no un
    número en una consola-.
    """
    import main
    cfg_original = main.load_config()

    jugadores_n = max(1, min(int(jugadores or 3), main._simulation_bench.MAX_JUGADORES))
    nombres_sim = [main._simulation_bench.nombre_simulado(i) for i in range(jugadores_n)]

    perfiles_base = cfg_original.get("player_profiles")
    if not isinstance(perfiles_base, list):
        perfiles_base = list(main.get_player_profiles(cfg_original))
    perfiles_temporales = main._simulation_bench.perfiles_temporales_con_sim(perfiles_base, nombres_sim)

    main.save_config({
        **cfg_original,
        "player_profiles": perfiles_temporales,
        "players": [p["id"] for p in perfiles_temporales],
    })

    try:
        return await main._simulation_bench.ejecutar_simulacion(
            app=main.app,
            stages=main.get_runtime_stages(),
            jugadores=jugadores_n,
            dispositivo=dispositivo,
            red=red,
            cookie_name=main.PLAYER_SESSION_COOKIE,
            session_ttl_s=main.PLAYER_SESSION_TTL_SECONDS,
            session_secret=main.get_session_signing_secret(),
            obtener_nivel=lambda nombre: main.get_player_progress_level(nombre, 0),
        )
    finally:
        # SIEMPRE, pase lo que pase durante la simulación -incluida una
        # excepción a mitad-: si un SIM_XX se quedara registrado de verdad,
        # aparecería en la lista de jugadores del panel como si lo fuera.
        main.save_config(cfg_original)


async def run_long_session_pause_bench(dispositivo, punto_de_pausa=0.5):
    """"¿Se guarda bien todo?" -partida larga con una pausa real en medio,
    sesión nueva para retomar-. Mismo patrón de alta/baja de perfil que
    `run_simulation_bench`, ver ahí el porqué. Solo un jugador -SIM_01-,
    porque esto prueba la costura entre dos sesiones de UN jugador, no
    concurrencia."""
    import main
    cfg_original = main.load_config()

    nombres_sim = [main._simulation_bench.nombre_simulado(0)]
    perfiles_base = cfg_original.get("player_profiles")
    if not isinstance(perfiles_base, list):
        perfiles_base = list(main.get_player_profiles(cfg_original))
    perfiles_temporales = main._simulation_bench.perfiles_temporales_con_sim(perfiles_base, nombres_sim)

    main.save_config({
        **cfg_original,
        "player_profiles": perfiles_temporales,
        "players": [p["id"] for p in perfiles_temporales],
    })

    try:
        return await main._simulation_bench.simular_partida_larga_con_pausa(
            app=main.app,
            stages=main.get_runtime_stages(),
            dispositivo=dispositivo,
            cookie_name=main.PLAYER_SESSION_COOKIE,
            session_ttl_s=main.PLAYER_SESSION_TTL_SECONDS,
            session_secret=main.get_session_signing_secret(),
            obtener_nivel=lambda nombre: main.get_player_progress_level(nombre, 0),
            punto_de_pausa=punto_de_pausa,
        )
    finally:
        main.save_config(cfg_original)


def registrar_jugadores_de_simulacion(n):
    """Para una sesión de navegador DE VERDAD (Playwright u otra herramienta
    externa, no la simulación httpx-en-proceso): registra N SIM_XX como
    perfiles conocidos y los DEJA registrados -a diferencia de
    `run_simulation_bench`, que corre entero dentro de una petición y los
    quita al momento con un `finally`-. Aquí quien pregunta va a controlar
    un navegador real durante minutos, así que el alta y la baja son dos
    pasos sueltos: hay que llamar a `quitar_jugadores_de_simulacion()` al
    terminar, o el panel se queda viendo SIM_XX como si fueran de verdad.
    Devuelve los nombres registrados, en orden.
    """
    import main
    cfg = main.load_config()
    jugadores_n = max(1, min(int(n or 1), main._simulation_bench.MAX_JUGADORES))
    nombres_sim = [main._simulation_bench.nombre_simulado(i) for i in range(jugadores_n)]

    perfiles_base = cfg.get("player_profiles")
    if not isinstance(perfiles_base, list):
        perfiles_base = list(main.get_player_profiles(cfg))
    perfiles_base = main._simulation_bench.quitar_perfiles_sim(perfiles_base)
    perfiles = main._simulation_bench.perfiles_temporales_con_sim(perfiles_base, nombres_sim)

    main.save_config({**cfg, "player_profiles": perfiles, "players": [p["id"] for p in perfiles]})
    return nombres_sim


def quitar_jugadores_de_simulacion():
    """Deshace `registrar_jugadores_de_simulacion`: quita cualquier SIM_*
    de la lista de perfiles conocidos. No toca progreso ni posición -para
    eso ya está `limpiar_rastro_de_simulacion`-."""
    import main
    cfg = main.load_config()
    perfiles_base = cfg.get("player_profiles")
    if not isinstance(perfiles_base, list):
        return
    perfiles = main._simulation_bench.quitar_perfiles_sim(perfiles_base)
    main.save_config({**cfg, "player_profiles": perfiles, "players": [p["id"] for p in perfiles]})


def mint_simulation_player_tokens(nombres):
    """Un token de sesión de jugador ya firmado por nombre -mismo mecanismo
    que usa el banco httpx, pero para entregárselo a un navegador de
    verdad en vez de meterlo en una cookie de `httpx.AsyncClient`-."""
    import main
    secret = main.get_session_signing_secret()
    return {
        nombre: main.player_session_security.create_player_session_token(
            nombre, ttl_seconds=main.PLAYER_SESSION_TTL_SECONDS, secret=secret
        )
        for nombre in nombres
    }


def simulation_bench_jugadores_reales_en_marcha():
    import main
    cfg = main.load_config()
    perfiles = main.get_player_profiles(cfg)
    niveles = main.load_game_state(main.GAME_DB)
    return main._simulation_bench.hay_progreso_real_en_marcha(perfiles, niveles)


def limpiar_rastro_de_simulacion():
    import main
    niveles = main.load_game_state(main.GAME_DB)
    timers = main.load_player_timers()
    posiciones = main.load_live_positions()
    borrados = main._simulation_bench.borrar_rastro_de_simulacion(
        niveles=niveles, timers=timers, posiciones=posiciones
    )
    if borrados:
        main.save_game_state(main.GAME_DB, niveles)
        main.save_player_timers(timers)
        main.save_live_positions(posiciones)
    return borrados
