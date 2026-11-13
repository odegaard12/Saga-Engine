import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { PlayerGpsStatus, TeamProfileLiveStatus } from '../../types/player'

/**
 * Lo que comparten las pantallas del jugador: dónde está y qué tiene abierto.
 *
 * Aquí NO va la partida. Esto guardaba también `status`, `payload`, `config` y
 * `errorMessage`, pero la partida de verdad es el `useState<LoadState>` de
 * `PlayerApp` y nadie llamaba nunca a `setGamePayload`: esos cuatro campos se
 * quedaban en su valor inicial para siempre, pareciendo datos.
 *
 * Ya costó una vez. La mesa de trabajo leía `getState().payload`, encontraba
 * `null`, y le decía "No hay recetas" a un jugador que llevaba los
 * ingredientes en la mochila.
 *
 * El GPS y los paneles sí viven aquí porque los cruzan varias pantallas.
 */
interface PlayerState {
  // Dónde está
  gpsPosition: { lat: number; lon: number } | null
  gpsStatus: PlayerGpsStatus
  gpsAccuracy: number | null
  gpsFresh: boolean
  gpsCapturedAt: number | null

  // Qué tiene abierto
  toolsOpen: boolean
  rankingOpen: boolean
  offlinePrepVisible: boolean

  /**
   * Dónde va el resto del equipo, tal y como lo trae el último latido.
   *
   * Vivía como `useState` suelto dentro de `PlayerApp`, así que ningún
   * minijuego podía leerlo -"Relevo de Equipo" tiraba en su lugar de
   * `useTeamStore.ts`, un intento con Yjs que sólo persistía en el propio
   * móvil (`IndexeddbPersistence`, sin ningún transporte entre
   * dispositivos) y por eso nunca veía a nadie más-. Aquí sí llega a todos
   * los componentes, y sin pedir nada aparte: son los mismos datos que ya
   * trae el latido cada pocos segundos.
   */
  teamProfiles: TeamProfileLiveStatus[]

  setGpsStatus: (status: PlayerGpsStatus) => void
  setGpsPosition: (pos: { lat: number; lon: number } | null) => void
  setGpsAccuracy: (acc: number | null) => void
  setGpsFresh: (fresh: boolean) => void
  setGpsCapturedAt: (cap: number | null) => void
  setToolsOpen: (open: boolean) => void
  setRankingOpen: (open: boolean) => void
  setOfflinePrepVisible: (visible: boolean) => void
  setTeamProfiles: (profiles: TeamProfileLiveStatus[]) => void
}

/**
 * 13/11 (auditoría de batería): `persist` escribe en `localStorage` en CADA `set()`, aunque nada de lo persistido haya
 * cambiado, y el GPS hace varios `set` por lectura (1/s andando). Aquí no se escribe lo que ya está escrito: el mismo
 * texto, ningún `setItem` síncrono (en iOS, milisegundos sueltos por segundo).
 */
const ultimoTextoEscrito = new Map<string, string>()
const almacenSinRepeticiones = {
  getItem: (nombre: string) => window.localStorage.getItem(nombre),
  setItem: (nombre: string, valor: string) => {
    if (ultimoTextoEscrito.get(nombre) === valor) return
    window.localStorage.setItem(nombre, valor)
    ultimoTextoEscrito.set(nombre, valor)
  },
  removeItem: (nombre: string) => {
    ultimoTextoEscrito.delete(nombre)
    window.localStorage.removeItem(nombre)
  },
}

/**
 * 14/11: de QUIÉN es lo guardado. La posición y el panel de preparar la misión eran del móvil, no del jugador: al
 * «cambiar de jugador» el siguiente arrancaba en la última posición del anterior (y con el panel de preparar ya cerrado).
 * Sin tocar `saga_remembered_player` (leer la URL no debe recordar a nadie).
 */
export function usuarioDeLaUrl(): string {
  try {
    const consulta = new URLSearchParams(window.location.search).get('user')
    if (consulta && consulta.trim()) return consulta.trim().toLowerCase()
    const m = window.location.pathname.match(/^\/player\/(.+)$/)
    return m?.[1] ? decodeURIComponent(m[1].replace(/\+/g, ' ')).trim().toLowerCase() : ''
  } catch {
    return ''
  }
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set) => ({
      gpsPosition: null,
      gpsStatus: 'unavailable',
      gpsAccuracy: null,
      gpsFresh: false,
      gpsCapturedAt: null,

      toolsOpen: false,
      rankingOpen: false,
      offlinePrepVisible: true,
      teamProfiles: [],

      setGpsStatus: (gpsStatus) => set({ gpsStatus }),
      setGpsPosition: (gpsPosition) => set({ gpsPosition }),
      setGpsAccuracy: (gpsAccuracy) => set({ gpsAccuracy }),
      setGpsFresh: (gpsFresh) => set({ gpsFresh }),
      setGpsCapturedAt: (gpsCapturedAt) => set({ gpsCapturedAt }),

      setToolsOpen: (toolsOpen) => set({ toolsOpen }),
      setRankingOpen: (rankingOpen) => set({ rankingOpen }),
      setOfflinePrepVisible: (offlinePrepVisible) => set({ offlinePrepVisible }),
      setTeamProfiles: (teamProfiles) => set({ teamProfiles }),
    }),
    {
      name: 'saga-player-store',
      storage: createJSONStorage(() => almacenSinRepeticiones),
      // Solo se guarda entre arranques lo que tiene sentido recordar: la
      // última posición, para no abrir el mapa en blanco, y si el panel de
      // preparar la misión sin cobertura estaba visible.
      partialize: (state) => ({
        usuario: usuarioDeLaUrl(),
        gpsPosition: state.gpsPosition,
        offlinePrepVisible: state.offlinePrepVisible,
      }),
      // Lo guardado de OTRO jugador (o sin dueño, de antes de esta versión) no se hereda.
      merge: (guardado, actual) => {
        const g = (guardado || {}) as { usuario?: string }
        const yo = usuarioDeLaUrl()
        if (!yo || g.usuario !== yo) return actual
        return { ...actual, ...(guardado as Partial<PlayerState>) }
      },
    }
  )
)
