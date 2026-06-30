import { create } from 'zustand'
import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'

// Documento principal de Yjs para el equipo
const ydoc = new Y.Doc()

// Persistencia offline usando IndexedDB
// Esto asegura que los cambios hechos sin conexión se guarden
// y se sincronicen cuando vuelva la red (via WebRTC o WS en el futuro).
const provider = new IndexeddbPersistence('saga-team-sync', ydoc)

provider.on('synced', () => {
  console.log('✅ Yjs Document synced with IndexedDB')
})

// Mapa compartido para los nodos completados por el equipo
const sharedNodes = ydoc.getMap<boolean>('completedNodes')
// Mapa compartido para la ubicación de los miembros del equipo
const sharedPositions = ydoc.getMap<{ lat: number; lon: number; timestamp: number }>('memberPositions')

interface TeamState {
  completedNodes: Record<string, boolean>
  memberPositions: Record<string, { lat: number; lon: number; timestamp: number }>
  
  // Acciones
  markNodeCompleted: (nodeId: string) => void
  updateMemberPosition: (memberId: string, lat: number, lon: number) => void
}

export const useTeamStore = create<TeamState>((set) => {
  // Suscribirse a cambios en Yjs para actualizar Zustand
  sharedNodes.observe(() => {
    set({ completedNodes: sharedNodes.toJSON() as Record<string, boolean> })
  })

  sharedPositions.observe(() => {
    set({ memberPositions: sharedPositions.toJSON() as Record<string, { lat: number; lon: number; timestamp: number }> })
  })

  return {
    completedNodes: sharedNodes.toJSON() as Record<string, boolean>,
    memberPositions: sharedPositions.toJSON() as Record<string, { lat: number; lon: number; timestamp: number }>,

    markNodeCompleted: (nodeId: string) => {
      sharedNodes.set(nodeId, true)
    },
    
    updateMemberPosition: (memberId: string, lat: number, lon: number) => {
      sharedPositions.set(memberId, { lat, lon, timestamp: Date.now() })
    }
  }
})
