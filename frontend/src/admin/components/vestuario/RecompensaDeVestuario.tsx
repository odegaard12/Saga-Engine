import { useEffect, useState } from 'react'
import {
  ensayarDesbloqueables,
  fetchDesbloqueables,
  guardarDesbloqueables,
  type DesbloqueablesResponse,
} from '../../lib/adminApi'
import { describeAdminError } from '../../lib/adminErrors'
import { boton, botonPrincipal, caja, chip, fila, nota, notaError, notaOk } from './estilos'
import { idDeRegla, reglaDelNodo, resumenDeEnsayo } from './vestuarioComun'

/**
 * «Recompensa de vestuario» en el cajón del nodo: qué piezas gana quien supere
 * ESTE nodo. Crea o edita la regla `nodo` (por id de nodo, nunca por índice) de
 * la configuración de desbloqueables; se guarda aparte del nodo, con su propio
 * botón, enseñando antes a quién se le daría ya.
 */
export default function RecompensaDeVestuario({ nodeId }: { nodeId: string }) {
  const [datos, setDatos] = useState<DesbloqueablesResponse | null>(null)
  const [elegidas, setElegidas] = useState<string[]>([])
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [abierta, setAbierta] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const nodoGuardado = Boolean(nodeId) && !nodeId.startsWith('local-')

  async function cargar() {
    try {
      const respuesta = await fetchDesbloqueables()
      setDatos(respuesta)
      setElegidas(reglaDelNodo(respuesta.config.reglas, nodeId)?.da || [])
    } catch (e) {
      setError(describeAdminError(e, 'cargar'))
    }
  }

  useEffect(() => {
    if (abierta && nodoGuardado) void cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta, nodeId])

  async function guardar() {
    if (!datos) return
    setOcupado(true)
    setError('')
    setAviso('')
    try {
      const otras = datos.config.reglas.filter(
        (r) => !(r.cuando.tipo === 'nodo' && String(r.cuando.nodo) === nodeId)
      )
      const previa = reglaDelNodo(datos.config.reglas, nodeId)
      const reglas = elegidas.length
        ? [
            ...otras,
            {
              id:
                previa?.id ||
                idDeRegla({ cuando: { tipo: 'nodo', nodo: nodeId }, da: elegidas }, otras),
              cuando: { tipo: 'nodo', nodo: nodeId },
              da: elegidas,
            },
          ]
        : otras
      if (datos.config.activos) {
        const ensayo = await ensayarDesbloqueables({ reglas })
        if (
          !window.confirm(
            `¿Guardar la recompensa del nodo y aplicarla a lo ya jugado?\n\n${resumenDeEnsayo(ensayo, datos.catalogo)}`
          )
        )
          return
      }
      const { httpStatus, data } = await guardarDesbloqueables({
        revision: datos.config.revision,
        reglas,
        aplicar_a_lo_jugado: true,
      })
      if (httpStatus === 409) {
        setError('Otra pestaña guardó antes: vuelve a abrir esta sección.')
      } else if (httpStatus !== 200) {
        setError((data?.errores || [data?.detail || `HTTP ${httpStatus}`]).join(' · '))
      } else {
        setAviso('Recompensa guardada.')
        await cargar()
      }
    } catch (e) {
      setError(describeAdminError(e, 'guardar'))
    } finally {
      setOcupado(false)
    }
  }

  const piezas = (datos?.catalogo || []).filter((p) => !p.libre)

  return (
    <div style={{ ...caja, margin: '0 0 12px' }}>
      <button
        type="button"
        style={{ ...boton, width: '100%', textAlign: 'left' }}
        onClick={() => setAbierta(!abierta)}
      >
        {abierta ? '▾' : '▸'} 🎁 Recompensa de vestuario
      </button>
      {abierta ? (
        !nodoGuardado ? (
          <p style={nota}>Guarda el nodo primero: la recompensa va por su id.</p>
        ) : !datos ? (
          <p style={error ? notaError : nota}>{error || 'Cargando…'}</p>
        ) : (
          <>
            <p style={nota}>
              Quien supere este nodo gana estas piezas
              {datos.config.activos
                ? '.'
                : ' (los desbloqueables están apagados: se guardará para cuando se enciendan).'}
            </p>
            <div style={{ ...fila, marginTop: 8 }}>
              {piezas.map((p) => {
                const marcada = elegidas.includes(p.clave)
                return (
                  <button
                    key={p.clave}
                    type="button"
                    style={chip(marcada)}
                    onClick={() =>
                      setElegidas(
                        marcada ? elegidas.filter((c) => c !== p.clave) : [...elegidas, p.clave]
                      )
                    }
                  >
                    {marcada ? '✓ ' : ''}
                    {p.nombre}
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              style={{ ...botonPrincipal, marginTop: 10 }}
              disabled={ocupado}
              onClick={() => void guardar()}
            >
              Guardar recompensa
            </button>
            {error ? <p style={notaError}>{error}</p> : null}
            {aviso ? <p style={notaOk}>{aviso}</p> : null}
          </>
        )
      ) : null}
    </div>
  )
}
