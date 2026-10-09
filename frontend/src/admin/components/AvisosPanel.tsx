import { useEffect, useState } from 'react'
import {
  fetchAvisosNtfy,
  guardarAvisosNtfy,
  probarAvisosNtfy,
  type AvisosNtfyEstado,
  type TipoDeAvisoNtfy,
} from '../lib/adminApi'
import { describeAdminError } from '../lib/adminErrors'
import { boton, botonPrincipal, caja, fila, nota, notaError, notaOk } from './vestuario/estilos'

const TIPOS: { id: TipoDeAvisoNtfy; texto: string; ayuda: string }[] = [
  { id: 'fin', texto: 'Jugador que termina la misión', ayuda: 'Uno por jugador.' },
  {
    id: 'primero',
    texto: 'Primer jugador en llegar a cada nodo',
    ayuda: 'Sólo el primero de cada nodo en esta partida.',
  },
  {
    id: 'sospecha',
    texto: 'Sospecha fuerte del antitrampas',
    ayuda: '3 sospechas del mismo jugador en 15 min.',
  },
  {
    id: 'sin_senal',
    texto: 'Jugador sin señal más de 30 min',
    ayuda: 'Con la partida en marcha, empezada y sin acabar.',
  },
  { id: 'errores', texto: 'Errores del servidor repetidos', ayuda: '3 o más en 10 min.' },
]

const PRUEBA: Record<string, string> = {
  sin_configurar: 'El servidor no tiene ntfy configurado.',
  limite: 'Se ha llegado al límite de avisos de esta hora. Prueba más tarde.',
}

/**
 * Avisos al móvil del organizador por ntfy. El servidor y el tema van en
 * variables de entorno del servidor (`SAGA_NTFY_URL`, `SAGA_NTFY_TOPIC`,
 * `SAGA_NTFY_TOKEN`); aquí sólo se encienden, por tipo. Apagado por defecto.
 */
export default function AvisosPanel() {
  const [estado, setEstado] = useState<AvisosNtfyEstado | null>(null)
  const [error, setError] = useState('')
  const [hecho, setHecho] = useState('')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    fetchAvisosNtfy()
      .then(setEstado)
      .catch((e) => setError(describeAdminError(e, 'cargar')))
  }, [])

  async function guardar(siguiente: AvisosNtfyEstado) {
    setEstado(siguiente)
    setOcupado(true)
    setError('')
    setHecho('')
    try {
      setEstado(await guardarAvisosNtfy({ activo: siguiente.activo, tipos: siguiente.tipos }))
      setHecho('✓ Guardado')
    } catch (e) {
      setError(describeAdminError(e, 'guardar'))
    } finally {
      setOcupado(false)
    }
  }

  async function probar() {
    setOcupado(true)
    setError('')
    setHecho('')
    try {
      const respuesta = await probarAvisosNtfy()
      if (respuesta.status === 'ok') setHecho('✓ Aviso de prueba enviado. Mira el móvil.')
      else setError(PRUEBA[respuesta.detail] || `ntfy no aceptó el aviso (${respuesta.detail}).`)
    } catch (e) {
      setError(describeAdminError(e, 'accion'))
    } finally {
      setOcupado(false)
    }
  }

  if (!estado) return <p style={error ? notaError : nota}>{error || '⏳ Cargando…'}</p>

  return (
    <div data-saga-panel="avisos">
      <p style={nota}>
        Notificaciones al móvil del organizador por <b>ntfy</b>. Se agrupan (una cada minuto como
        mucho) y hay un límite por hora para no inundar.
      </p>

      <div style={caja}>
        <strong>Servidor ntfy: </strong>
        {estado.configurado ? (
          <span style={{ color: '#86efac' }}>
            configurado{estado.con_token ? ' (con token)' : ''}
          </span>
        ) : (
          <span style={{ color: '#fca5a5' }}>sin configurar</span>
        )}
        {!estado.configurado ? (
          <p style={nota}>
            Pon <code>SAGA_NTFY_URL</code> y <code>SAGA_NTFY_TOPIC</code> (y{' '}
            <code>SAGA_NTFY_TOKEN</code> si el tema está protegido) en el entorno del servidor y
            reinícialo.
          </p>
        ) : null}
      </div>

      <div style={caja}>
        <label style={{ ...fila, fontWeight: 800 }}>
          <input
            type="checkbox"
            checked={estado.activo}
            disabled={ocupado}
            onChange={(e) => void guardar({ ...estado, activo: e.target.checked })}
          />
          Mandar avisos
        </label>
        <div style={{ display: 'grid', gap: 8, marginTop: 10, opacity: estado.activo ? 1 : 0.55 }}>
          {TIPOS.map((tipo) => (
            <label
              key={tipo.id}
              style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0 8px' }}
            >
              <input
                type="checkbox"
                checked={estado.tipos[tipo.id]}
                disabled={ocupado || !estado.activo}
                onChange={(e) =>
                  void guardar({
                    ...estado,
                    tipos: { ...estado.tipos, [tipo.id]: e.target.checked },
                  })
                }
              />
              <span>{tipo.texto}</span>
              <span />
              <span style={{ ...nota, margin: 0 }}>{tipo.ayuda}</span>
            </label>
          ))}
        </div>
      </div>

      <div style={{ ...fila, marginTop: 12 }}>
        <button
          type="button"
          style={estado.configurado ? botonPrincipal : boton}
          disabled={ocupado || !estado.configurado}
          onClick={() => void probar()}
        >
          Enviar aviso de prueba
        </button>
      </div>
      {hecho ? <p style={notaOk}>{hecho}</p> : null}
      {error ? <p style={notaError}>{error}</p> : null}
    </div>
  )
}
