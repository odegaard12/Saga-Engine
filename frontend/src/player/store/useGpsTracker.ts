import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface RoutePoint {
  lat: number
  lon: number
  timestamp: number
}

interface GpsTrackerState {
  route: RoutePoint[]
  addPoint: (lat: number, lon: number) => void
  clearRoute: () => void
}

export const useGpsTracker = create<GpsTrackerState>()(
  persist(
    (set) => ({
      route: [],
      addPoint: (lat: number, lon: number) => set((state) => {
        const last = state.route[state.route.length - 1]
        const now = Date.now()
        
        // No guardar si la última actualización fue hace menos de 10 segundos
        if (last && now - last.timestamp < 10000) {
          return state
        }

        // Si la distancia al último punto es minúscula (menor a 2 metros aprox, no la guardamos)
        if (last && Math.abs(last.lat - lat) < 0.00002 && Math.abs(last.lon - lon) < 0.00002) {
          return state
        }
        
        return {
          route: [...state.route, { lat, lon, timestamp: now }]
        }
      }),
      clearRoute: () => set({ route: [] })
    }),
    {
      name: 'saga-gps-tracker'
    }
  )
)
