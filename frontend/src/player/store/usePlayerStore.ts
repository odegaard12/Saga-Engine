import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PlayerGamePayload, PublicConfig, PlayerGpsStatus } from '../../types/player'

interface PlayerState {
  // Estado base de la misión
  status: 'idle' | 'loading' | 'error' | 'ready'
  payload: PlayerGamePayload | null
  config: PublicConfig | null
  errorMessage: string | null

  // Estado del GPS
  gpsPosition: { lat: number; lon: number } | null
  gpsStatus: PlayerGpsStatus
  gpsAccuracy: number | null
  gpsFresh: boolean
  gpsCapturedAt: number | null

  // UI State
  toolsOpen: boolean
  teamOpen: boolean
  offlinePrepVisible: boolean
  
  // Acciones (Actions)
  setStatus: (status: PlayerState['status']) => void
  setGamePayload: (payload: PlayerGamePayload, config: PublicConfig) => void
  updateGps: (position: { lat: number; lon: number }, accuracy: number | null, fresh: boolean) => void
  setGpsStatus: (status: PlayerGpsStatus) => void
  setGpsPosition: (pos: { lat: number; lon: number } | null) => void
  setGpsAccuracy: (acc: number | null) => void
  setGpsFresh: (fresh: boolean) => void
  setGpsCapturedAt: (cap: number | null) => void
  setToolsOpen: (open: boolean) => void
  setTeamOpen: (open: boolean) => void
  setOfflinePrepVisible: (visible: boolean) => void
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set) => ({
      status: 'idle',
      payload: null,
      config: null,
      errorMessage: null,

      gpsPosition: null,
      gpsStatus: 'unavailable',
      gpsAccuracy: null,
      gpsFresh: false,
      gpsCapturedAt: null,

      toolsOpen: false,
      teamOpen: false,
      offlinePrepVisible: true,

      setStatus: (status) => set({ status }),
      setGamePayload: (payload, config) => set({ payload, config, status: 'ready' }),
      updateGps: (gpsPosition, gpsAccuracy, gpsFresh) => 
        set({ gpsPosition, gpsAccuracy, gpsFresh, gpsCapturedAt: Date.now(), gpsStatus: 'active' }),
      setGpsStatus: (gpsStatus) => set({ gpsStatus }),
      setGpsPosition: (gpsPosition) => set({ gpsPosition }),
      setGpsAccuracy: (gpsAccuracy) => set({ gpsAccuracy }),
      setGpsFresh: (gpsFresh) => set({ gpsFresh }),
      setGpsCapturedAt: (gpsCapturedAt) => set({ gpsCapturedAt }),
      
      setToolsOpen: (toolsOpen) => set({ toolsOpen }),
      setTeamOpen: (teamOpen) => set({ teamOpen }),
      setOfflinePrepVisible: (offlinePrepVisible) => set({ offlinePrepVisible })
    }),
    {
      name: 'saga-player-store',
      // Solo persistimos los datos que tienen sentido tras reiniciar
      partialize: (state) => ({ 
        gpsPosition: state.gpsPosition,
        offlinePrepVisible: state.offlinePrepVisible 
      }),
    }
  )
)
