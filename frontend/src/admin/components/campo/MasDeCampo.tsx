import { useState } from 'react'
import { pocosDatosPorLaRed } from '../../lib/pocosDatos'
import HojaDeConfirmacion from '../HojaDeConfirmacion'

/** Paneles del editor que se abren desde «Más» (los mismos de siempre). */
export type PanelDelEditor = 'none' | 'players' | 'mission' | 'match-log' | 'tiempos' | 'avisos' | 'exportar' | 'activity'

type Props = {
  pocos: boolean
  onPocos: (activo: boolean) => void
  exigirCerca: boolean
  onExigirCerca: (activo: boolean) => void
  ajustesSinGuardar: boolean
  guardandoAjustes: boolean
  errorAjustes: string | null
  onGuardarAjustes: () => void
  onAbrirEditor: (panel: PanelDelEditor) => void
  onSalir: () => void
}

function Interruptor({ activo, etiqueta, onCambio }: { activo: boolean; etiqueta: string; onCambio: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={activo} aria-label={etiqueta} className="campo-interruptor" onClick={() => onCambio(!activo)}>
      <span aria-hidden="true" />
    </button>
  )
}

function Fila({ titulo, detalle, children, onClick, peligro }: { titulo: string; detalle?: string; children?: React.ReactNode; onClick?: () => void; peligro?: boolean }) {
  const cuerpo = (
    <>
      <span className="campo-ajuste-texto">
        <strong className={peligro ? 'peligro' : undefined}>{titulo}</strong>
        {detalle ? <small>{detalle}</small> : null}
      </span>
      {children ?? (onClick ? <span className="campo-flecha" aria-hidden="true">›</span> : null)}
    </>
  )
  return onClick ? (
    <li>
      <button type="button" className="campo-ajuste" onClick={onClick}>
        {cuerpo}
      </button>
    </li>
  ) : (
    <li className="campo-ajuste">{cuerpo}</li>
  )
}

/**
 * «Más» del panel de campo (24/11): arriba lo de este móvil y el día de partida, con interruptores grandes; debajo, a un
 * toque, todo lo de siempre (jugadores, registro, tiempos, editores, ajustes), que se abre en el panel de edición.
 */
export default function MasDeCampo(p: Props) {
  const [saliendo, setSaliendo] = useState(false)
  return (
    <section className="campo-panel campo-mas" aria-label="Más">
      <header className="campo-panel-cabeza">
        <div className="campo-panel-titulo">
          <h2>Más</h2>
        </div>
      </header>
      <div className="campo-panel-cuerpo">
        <h3 className="campo-seccion">Este móvil</h3>
        <ul className="campo-ajustes">
          <Fila
            titulo="Pocos datos"
            detalle={
              p.pocos
                ? `Sin satélite ni fotos; la partida cada 45 s${pocosDatosPorLaRed() ? ' (encendido por el ahorro de datos)' : ''}`
                : 'Mapa de satélite y fotos; la partida cada 15 s con buena red'
            }
          >
            <Interruptor activo={p.pocos} etiqueta="Pocos datos" onCambio={p.onPocos} />
          </Fila>
        </ul>

        <h3 className="campo-seccion">Día de partida</h3>
        <ul className="campo-ajustes">
          <Fila titulo="Exigir estar cerca" detalle={p.exigirCerca ? 'El servidor rechaza avances lejos del nodo' : 'Lejos del nodo sólo se anota un aviso'}>
            <Interruptor activo={p.exigirCerca} etiqueta="Exigir estar cerca" onCambio={p.onExigirCerca} />
          </Fila>
          {p.ajustesSinGuardar || p.errorAjustes ? (
            <li className="campo-guardar">
              {p.errorAjustes ? <span role="alert">{p.errorAjustes}</span> : <span>Cambio sin guardar</span>}
              <button type="button" className="campo-boton primario" disabled={p.guardandoAjustes} onClick={p.onGuardarAjustes}>
                {p.guardandoAjustes ? 'Guardando…' : 'Guardar'}
              </button>
            </li>
          ) : null}
          <Fila titulo="Jugadores y equipos" detalle="Altas, nombres, fotos y datos personales" onClick={() => p.onAbrirEditor('players')} />
          <Fila titulo="Registro de partida" detalle="Todo lo que pasó, con su hora" onClick={() => p.onAbrirEditor('match-log')} />
          <Fila titulo="Tiempos de la clasificación" onClick={() => p.onAbrirEditor('tiempos')} />
          <Fila titulo="Avisos al organizador" detalle="Qué avisos llegan a tu móvil" onClick={() => p.onAbrirEditor('avisos')} />
          <Fila titulo="Exportar partida" onClick={() => p.onAbrirEditor('exportar')} />
        </ul>

        <h3 className="campo-seccion">Preparar la misión</h3>
        <ul className="campo-ajustes">
          <Fila titulo="Contenido, mapa y nodos" detalle="El editor de la ruta, juegos, objetos y desbloqueables" onClick={() => p.onAbrirEditor('none')} />
          <Fila titulo="Ajustes de la misión" detalle="Identidad, prólogo, acceso, tema, 3D y caminos" onClick={() => p.onAbrirEditor('mission')} />
          <Fila titulo="Cerrar sesión" peligro onClick={() => setSaliendo(true)} />
        </ul>
        <p className="campo-version">Versión {typeof __SAGA_VERSION__ === 'string' ? __SAGA_VERSION__ : ''}</p>
      </div>
      {saliendo ? (
        <HojaDeConfirmacion
          titulo="¿Cerrar la sesión?"
          intro="Para volver a entrar en este móvil hará falta la contraseña de administración."
          textoConfirmar="Cerrar sesión"
          onCancelar={() => setSaliendo(false)}
          onConfirmar={() => {
            setSaliendo(false)
            p.onSalir()
          }}
        />
      ) : null}
    </section>
  )
}
