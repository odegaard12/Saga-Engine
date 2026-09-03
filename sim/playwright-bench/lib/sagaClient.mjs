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

  async login(adminPassword) {
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
    const respuesta = await this._fetch('/api/admin/simulation/browser-session/stop', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    return respuesta.ok
  }

  async cleanupTrace() {
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
