import { useEffect, useState, type CSSProperties } from 'react'
import { devolverTiempo, fetchIncidencias, type IncidenciasDeJugador } from '../lib/adminApi'
import { describeAdminError } from '../lib/adminErrors'

/**
 * Lo que la caja negra de cada móvil dice que falló (la app se cerró sola con un nodo abierto, el servidor falló al
 * avanzar) y el tiempo que se sugiere devolver por ello; más las sospechas que sólo se ven desde el móvil (la hora
 * cambiada a mano). Devolver lo decide el organizador: un botón, y se puede corregir o quitar (0).
 */

function minSeg(ms: number): string {
  const s = Math.round((ms || 0) / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const TIPOS_QUE_SE_CUENTAN: [string, string][] = [
  ['error', 'errores'],
  ['reto_fallo', 'fallos en retos'],
  ['sin_red', 'cortes de red'],
  ['gps_error', 'caídas de GPS'],
  ['avance_rechazado', 'avances rechazados'],
  ['qr_fallo', 'fallos de cámara/QR'],
  ['oculta', 'salidas de la app'],
]

export default function IncidenciasDeLaApp() {
  const [jugadores, setJugadores] = useState<IncidenciasDeJugador[]>([])
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState('')

  async function cargar() {
    try {
      const r = await fetchIncidencias()
      setJugadores(r.jugadores || [])
      setAviso('')
    } catch (error) {
      setAviso(describeAdminError(error, 'cargar'))
    }
  }

  useEffect(() => {
    void cargar()
  }, [])

  async function devolver(j: IncidenciasDeJugador, ms: number) {
    const texto = ms
      ? `¿Devolver ${minSeg(ms)} a ${j.display_name}? Su tiempo total baja eso.`
      : `¿Quitar el tiempo devuelto a ${j.display_name}?`
    if (!window.confirm(texto)) return
    setOcupado(j.user)
    try {
      await devolverTiempo(j.user, ms)
      await cargar()
    } catch (error) {
      window.alert(`No se pudo: ${describeAdminError(error, 'guardar')}`)
    } finally {
      setOcupado('')
    }
  }

  const conAlgo = jugadores.filter(
    (j) => j.incidencias.length || j.sospechas.length || j.devuelto_ms
  )

  return (
    <section className="admin-settings-section-modern">
      <div className="admin-settings-section-head">
        <strong>Fallos de la app y tiempo a devolver</strong>
        <span>
          Lo que apunta cada móvil (también sin cobertura) y sube al volver la red. Sólo se sugiere
          devolver lo que el reloj del nodo siguió corriendo por culpa de la app o del servidor;
          salir de la app no cuenta.
        </span>
      </div>

      {aviso ? <p style={{ color: '#f87171', fontSize: 13 }}>{aviso}</p> : null}
      {!aviso && !conAlgo.length ? (
        <p style={{ color: '#94a3b8', fontSize: 13, margin: '8px 0' }}>
          {jugadores.length
            ? 'Ningún fallo de la app que devolver ni sospechas del móvil.'
            : 'Aún no ha llegado nada de los móviles.'}
        </p>
      ) : null}

      <div style={{ display: 'grid', gap: 10 }}>
        {jugadores.map((j) => {
          const resumen = TIPOS_QUE_SE_CUENTAN.filter(([k]) => j.cuentas[k]).map(
            ([k, t]) => `${j.cuentas[k]} ${t}`
          )
          return (
            <div key={j.user} style={tarjeta}>
              <div style={cabecera}>
                <strong>{j.display_name}</strong>
                <span style={{ color: '#94a3b8', fontSize: 12 }}>
                  {resumen.join(' · ') || 'sin incidencias'}
                </span>
              </div>
              {j.incidencias.map((i, n) => (
                <div key={`i${n}`} style={linea}>
                  ⏱️ {i.texto}
                  {i.nodo ? ` (nodo ${i.nodo})` : ''}: <strong>{minSeg(i.ms)}</strong>
                </div>
              ))}
              {j.sospechas.map((s, n) => (
                <div key={`s${n}`} style={{ ...linea, color: '#fca5a5' }}>
                  🚩 {s.texto}
                  {s.salto_ms ? ` (salto de ${minSeg(Math.abs(s.salto_ms))})` : ''}
                </div>
              ))}
              {j.devolver_ms || j.devuelto_ms ? (
                <div style={{ ...cabecera, justifyContent: 'flex-start', marginTop: 6 }}>
                  <span style={{ fontSize: 13 }}>
                    Devuelto: <strong>{minSeg(j.devuelto_ms)}</strong>
                    {j.devolver_ms !== j.devuelto_ms ? ` · sugerido ${minSeg(j.devolver_ms)}` : ''}
                  </span>
                  {j.devolver_ms && j.devolver_ms !== j.devuelto_ms ? (
                    <button
                      type="button"
                      style={boton}
                      disabled={ocupado === j.user}
                      onClick={() => void devolver(j, j.devolver_ms)}
                    >
                      Devolver {minSeg(j.devolver_ms)}
                    </button>
                  ) : null}
                  {j.devuelto_ms ? (
                    <button
                      type="button"
                      style={boton}
                      disabled={ocupado === j.user}
                      onClick={() => void devolver(j, 0)}
                    >
                      Quitar
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}

const tarjeta: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.04)',
  minWidth: 0,
}

const cabecera: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  alignItems: 'baseline',
  justifyContent: 'space-between',
}

const linea: CSSProperties = { fontSize: 13, marginTop: 4, overflowWrap: 'anywhere' }

const boton: CSSProperties = {
  padding: '6px 12px',
  borderRadius: 8,
  border: '1px solid rgba(96,165,250,.6)',
  background: 'rgba(96,165,250,.22)',
  color: '#e2e8f0',
  fontWeight: 700,
  cursor: 'pointer',
}
