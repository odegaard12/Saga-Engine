import { useEffect, useState } from 'react'
import {
  descargarExportacionPartida,
  fetchResumenExportacion,
  type ResumenExportacion,
} from '../lib/adminApi'
import { describeAdminError } from '../lib/adminErrors'

/**
 * «Exportar partida»: un ZIP con todo lo que hace falta para revisar una
 * partida en casa (clasificación con su desglose, nodos por jugador, eventos,
 * sospechas, errores, cambios del admin y un INFORME.md con un primer análisis).
 *
 * Lleva nombres y posiciones de personas: sólo lo baja el admin, el servidor lo
 * manda con `Cache-Control: no-store` y con «Anonimizar» sale con J01, J02…,
 * posiciones redondeadas y sin fotos.
 */
export default function ExportarPartidaPanel() {
  const [resumen, setResumen] = useState<ResumenExportacion | null>(null)
  const [cargando, setCargando] = useState(true)
  const [errorResumen, setErrorResumen] = useState<string | null>(null)
  const [anonimizar, setAnonimizar] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [errorExportar, setErrorExportar] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)

  async function cargar() {
    setCargando(true)
    setErrorResumen(null)
    try {
      setResumen(await fetchResumenExportacion())
    } catch (err) {
      setErrorResumen(describeAdminError(err, 'cargar'))
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void cargar()
  }, [])

  async function exportar() {
    if (exportando) return
    setExportando(true)
    setErrorExportar(null)
    setHecho(null)
    try {
      const { blob, nombre } = await descargarExportacionPartida({ anonimizar })
      const url = URL.createObjectURL(blob)
      const enlace = document.createElement('a')
      enlace.href = url
      enlace.download = nombre
      document.body.appendChild(enlace)
      enlace.click()
      document.body.removeChild(enlace)
      window.setTimeout(() => URL.revokeObjectURL(url), 4000)
      setHecho(`Descargado ${nombre} (${Math.max(1, Math.round(blob.size / 1024))} KB).`)
    } catch (err) {
      setErrorExportar(describeAdminError(err, 'cargar'))
    } finally {
      setExportando(false)
    }
  }

  const origen = typeof window !== 'undefined' ? window.location.origin : 'http://SERVIDOR:PUERTO'

  return (
    <div className="saga-exportar-partida">
      <section className="saga-exportar-intro">
        <span className="saga-eyebrow">Después de la partida</span>
        <h3>Registro completo para analizar</h3>
        <p>
          Un ZIP con la clasificación y su desglose, los tiempos por nodo (declarado, observado y
          aplicado), todos los eventos, las sospechas, los errores del servidor y de los móviles,
          los cambios hechos desde este panel y un <b>INFORME.md</b> con un primer análisis: podio,
          empates, tiempos que no cuadran, nodos donde más se atascó la gente y quién jugó mucho
          rato sin cobertura.
        </p>
      </section>

      {cargando ? (
        <p className="saga-exportar-estado" role="status">
          ⏳ Contando lo que hay registrado…
        </p>
      ) : errorResumen ? (
        <div className="saga-exportar-error" role="alert">
          <p>⚠️ {errorResumen}</p>
          <button type="button" onClick={() => void cargar()}>
            Reintentar
          </button>
        </div>
      ) : resumen ? (
        <>
          {!resumen.registro_activo ? (
            <p className="saga-exportar-aviso" role="note">
              ⚠️ El Registro de partida está apagado (la misión no tiene fecha de inicio o aún no ha
              llegado). La exportación sale igual, pero sin la línea de tiempo de lo que se juegue
              ahora.
            </p>
          ) : null}
          <dl className="saga-exportar-cifras">
            <div>
              <dt>Jugadores</dt>
              <dd>{resumen.jugadores}</dd>
            </div>
            <div>
              <dt>Filas del registro</dt>
              <dd>{resumen.filas_registro}</dd>
            </div>
            <div>
              <dt>Sospechas</dt>
              <dd>{resumen.sospechas}</dd>
            </div>
            <div>
              <dt>Errores</dt>
              <dd>{resumen.errores}</dd>
            </div>
            <div>
              <dt>Cambios del admin</dt>
              <dd>{resumen.auditoria}</dd>
            </div>
            <div>
              <dt>Nodos</dt>
              <dd>{resumen.nodos}</dd>
            </div>
          </dl>
        </>
      ) : null}

      <label className="saga-exportar-anonimo">
        <input
          type="checkbox"
          checked={anonimizar}
          onChange={(evento) => setAnonimizar(evento.target.checked)}
        />
        <span>
          <b>Anonimizar</b>
          <small>
            Nombres cambiados por J01, J02…, posiciones redondeadas (~1 km) y sin fotos. Para
            pasárselo a alguien que no tiene por qué saber quién es quién.
          </small>
        </span>
      </label>

      <button
        type="button"
        className="saga-exportar-boton"
        onClick={() => void exportar()}
        disabled={exportando}
      >
        {exportando ? '⏳ Preparando el ZIP…' : '📦 Exportar partida (ZIP)'}
      </button>

      {hecho ? (
        <p className="saga-exportar-ok" role="status">
          ✓ {hecho}
        </p>
      ) : null}
      {errorExportar ? (
        <p className="saga-exportar-error" role="alert">
          ⚠️ {errorExportar}
        </p>
      ) : null}

      <p className="saga-exportar-privacidad">
        🔒 El ZIP lleva nombres y posiciones de personas. Guárdalo sólo donde haga falta y bórralo
        al acabar. La purga de «Datos personales» (en Jugadores) también borra estos registros.
      </p>

      <details className="saga-exportar-cli">
        <summary>Descargarlo por línea de comandos</summary>
        <p>Con la contraseña del panel en una variable (nunca escrita en el comando):</p>
        <pre>
          {`read -rs SAGA_ADMIN_PASS && export SAGA_ADMIN_PASS
curl -s -c /tmp/saga.cookies -H 'Content-Type: application/json' \\
  -d "{\\"password\\":\\"$SAGA_ADMIN_PASS\\"}" ${origen}/api/admin/login
curl -s -b /tmp/saga.cookies -o partida.zip \\
  "${origen}/api/admin/partida/exportar?anonimizar=0"
rm /tmp/saga.cookies`}
        </pre>
      </details>
    </div>
  )
}
