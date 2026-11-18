/**
 * 20/11: el ahorro «Auto» donde NO hay API de batería (Safari de iPhone no tiene `navigator.getBattery` ni el modo de bajo
 * consumo): se activa por RENDIMIENTO real. Lógica pura (el tiempo entra por parámetro): sólo cuenta cuando el gobernador de
 * fotogramas ya está en la calidad más baja y los fps medios siguen por debajo del umbral; se reinicia si se recuperan
 * (con margen, para no parpadear). Al dispararse se apunta `saga:fps-bajos` (conmutadoresMapa.ts), que vale 30 min (como la batería baja).
 */
/** Por debajo de esto (fps medios, ya en calidad baja) el móvil va lento. */
export const FPS_BAJOS_UMBRAL = 14
/** Para dejar de contar hay que subir por encima del umbral + este margen (histéresis). */
export const FPS_BAJOS_MARGEN = 4
/** Cuánto tiempo seguido (ms de pantalla pintando) tiene que ir lento para activar el ahorro. */
export const FPS_BAJOS_SOSTENIDO_MS = 30_000

export class VigilanteDeFps {
  private bajoMs = 0
  private disparado = false
  /** `true` UNA vez, cuando el rendimiento bajo se ha sostenido lo bastante. */
  muestra(dtMs: number, fpsMedios: number, enCalidadMinima: boolean): boolean {
    if (this.disparado || !(dtMs > 0) || dtMs > 400) return false
    if (enCalidadMinima && fpsMedios > 0 && fpsMedios < FPS_BAJOS_UMBRAL) this.bajoMs += dtMs
    else if (!enCalidadMinima || fpsMedios >= FPS_BAJOS_UMBRAL + FPS_BAJOS_MARGEN) this.bajoMs = 0
    if (this.bajoMs >= FPS_BAJOS_SOSTENIDO_MS) {
      this.disparado = true
      return true
    }
    return false
  }
}
