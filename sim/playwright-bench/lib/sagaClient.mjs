// Cliente mínimo contra la API de admin de Saga-Engine, para que los
// scripts de escenario no repitan fetch + cookies a mano.
//
// Usa fetch nativo de Node (no axios, no dependencias extra) y guarda la
// cookie de sesión de admin en memoria -un solo proceso, una sola sesión-.

export class SagaClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.adminCookie = null
  }

  async _fetch(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
    if (this.adminCookie) headers['Cookie'] = this.adminCookie

    const respuesta = await fetch(`${this.baseUrl}${path}`, { ...options, headers })

    const setCookie = respuesta.headers.get('set-cookie')
    if (setCookie) {
      // Nos basta el primer par nombre=valor; los atributos (Path, HttpOnly...)
      // no los necesita un cliente de servidor a servidor.
      this.adminCookie = setCookie.split(';')[0]
    }

    return respuesta
  }

  /**
   * Sesion de navegador SIN contraseña de admin.
   *
   * `/api/admin/simulation/browser-session/start` pide la contraseña de
   * admin, y esa contraseña no esta escrita en ningun fichero a proposito
   * -Oscar la tiene y la usa desde la web-. Resultado: el banco no se podia
   * lanzar sin pararse a pedirla, que es justo lo que hace que un banco de
   * pruebas deje de lanzarse.
   *
   * Los mismos tokens se pueden acuñar dentro del contenedor, con las mismas
   * funciones que usa el endpoint (`main.registrar_jugadores_de_simulacion`
   * y `main.mint_simulation_player_tokens`):
   *
   *   ssh PI "docker exec -w /app saga_engine_app python -c '...'"
   *
   * y pasarlos aqui en SAGA_PLAYER_SESSION, que es un JSON con la misma
   * forma que devuelve el endpoint. Si esa variable esta puesta, ni se
   * intenta el login.
   */
  _sesionPrefabricada() {
    const crudo = process.env.SAGA_PLAYER_SESSION
    if (!crudo) return null
    try {
      return JSON.parse(crudo)
    } catch (error) {
      throw new Error(`SAGA_PLAYER_SESSION no es JSON valido: ${error.message}`)
    }
  }

  async login(adminPassword) {
    if (this._sesionPrefabricada()) return { status: 'ok', prefabricada: true }
    const respuesta = await this._fetch('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password: adminPassword }),
    })
    if (!respuesta.ok) {
      throw new Error(`login de admin falló: HTTP ${respuesta.status}`)
    }
    return respuesta.json()
  }

  async startBrowserSession(playerCount) {
    const prefabricada = this._sesionPrefabricada()
    if (prefabricada) return prefabricada

    const respuesta = await this._fetch('/api/admin/simulation/browser-session/start', {
      method: 'POST',
      body: JSON.stringify({ player_count: playerCount }),
    })
    if (!respuesta.ok) {
      throw new Error(`browser-session/start falló: HTTP ${respuesta.status} — ${await respuesta.text()}`)
    }
    return respuesta.json()
  }

  async stopBrowserSession() {
    // Con sesion prefabricada no hay nada que cerrar por HTTP: los SIM_XX se
    // quitan con el mismo `docker exec` que los creo.
    if (this._sesionPrefabricada()) return true

    const respuesta = await this._fetch('/api/admin/simulation/browser-session/stop', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    return respuesta.ok
  }

  async cleanupTrace() {
    if (this._sesionPrefabricada()) return null

    const respuesta = await this._fetch('/api/admin/simulation/cleanup', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    if (!respuesta.ok) return null
    return respuesta.json()
  }

  async getStages() {
    const respuesta = await this._fetch('/api/admin/react-overview', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    if (!respuesta.ok) {
      throw new Error(`react-overview falló: HTTP ${respuesta.status}`)
    }
    const datos = await respuesta.json()
    if (datos.status !== 'ok') {
      throw new Error(`react-overview: ${datos.status} — ${datos.message || ''}`)
    }
    return datos.stages || []
  }
}
