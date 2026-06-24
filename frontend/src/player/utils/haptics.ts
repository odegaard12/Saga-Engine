/**
 * SAGA Engine - Haptics System
 * Centralized utility for native mobile vibration patterns.
 */

export const haptics = {
  /**
   * Safe execution wrapper checking for browser support
   */
  vibrate(pattern: number | number[]) {
    if (typeof window !== 'undefined' && 'navigator' in window && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern)
      } catch (e) {
        // Ignore failures gracefully
      }
    }
  },

  /**
   * Positive success confirmation (double tap)
   * e.g., Validating a node, unlocking an item
   */
  success() {
    this.vibrate([30, 60, 30])
  },

  /**
   * Error or warning (heavy single buzz)
   * e.g., Invalid QR, out of range
   */
  error() {
    this.vibrate(150)
  },

  /**
   * Approaching/Pulse effect (heartbeat)
   * e.g., GPS enters radius of active node
   */
  approach() {
    this.vibrate([40, 100, 40])
  },

  /**
   * Subtle tick
   * e.g., Toggling a switch, opening a sheet
   */
  tick() {
    this.vibrate(10)
  }
}
