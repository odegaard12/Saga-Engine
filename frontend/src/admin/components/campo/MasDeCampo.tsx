import { useState } from 'react'
import { pocosDatosPorLaRed } from '../../lib/pocosDatos'
import { TEXTO_EXIGIR_CERCA, TEXTO_POCOS_DATOS, encendidoApagado } from '../../lib/textosDeAjustes'
import HojaDeConfirmacion from '../HojaDeConfirmacion'

/** Paneles del editor que se abren desde «Más» (25/11: también los de contenido, igual que el menú del PC). */
export type PanelDelEditor =
  | 'none'
  | 'players'
  | 'mission'
  | 'match-log'
  | 'tiempos'
  | 'avisos'
  | 'exportar'
  | 'activity'
  | 'builder'
  | 'labels'
  | 'objects'
  | 'desbloqueables'
  | 'simulation'

type Props = {
  pocos: boolean
  onPocos: (activo: boolean) => void
  exigirCerca: boolean
  onExigirCerca: (activo: boolean) => void
  ajustesSinGuardar: boolean
  guardandoAjustes: boolean
  errorAjustes: string | null
  onGuardarAjustes: () => void
  /** `seccion`: la de Ajustes a la que bajar (Historia y textos → identidad). */
  onAbrirEditor: (panel: PanelDelEditor, seccion?: string) => void
  /** «＋ Añadir nodo»: crea el nodo y abre el editor con él. */
  onAnadirNodo?: () => void
  onSalir: () => void
  /** Sólo en pantalla ancha: lista y ficha a la vez (24/11, panel 2). */
  dosColumnas?: { activa: boolean; onCambio: (v: boolean) => void }
}

function Interruptor({ activo, etiqueta, onCambio }: { activo: boolean; etiqueta: string; onCambio: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={activo} aria-label={etiqueta} className="campo-interruptor" onClick={() => onCambio(!activo)}>
      <span aria-hidden="true" />
    </button>
  )
}

function Fila({ titulo, detalle, estado, children, onClick, peligro }: { titulo: string; detalle?: string; estado?: string; children?: React.ReactNode; onClick?: () => void; peligro?: boolean }) {
  const cuerpo = (
    <>
      <span className="campo-ajuste-texto">
        <strong className={peligro ? 'peligro' : undefined}>{titulo}</strong>
        {detalle ? <small>{detalle}</small> : null}
        {estado ? <small className="campo-ajuste-estado">{estado}</small> : null}
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
 * «Más» del panel de campo. 25/11 (propuesta A, elegida por el dueño): los mismos grupos, nombres y orden que el menú
 * del editor en el PC (ver AdminMissionControlShell, `gruposMenu`), con una línea debajo de cada entrada. Lo que no
 * cabe en el móvil (mover nodos, trazado, rastros, QR, copia de respaldo, novedades) sigue en «Editor completo».
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
        <h3 className="campo-seccion">Partida en directo</h3>
        <ul className="campo-ajustes">
          <Fila titulo="Jugadores y equipos" detalle="Altas, nombres, fotos y su ficha" onClick={() => p.onAbrirEditor('players')} />
          <Fila titulo="Actividad" detalle="Lo último que ha pasado y los avisos" onClick={() => p.onAbrirEditor('activity')} />
          <Fila titulo="Registro de partida" detalle="Todo lo que pasó, con su hora" onClick={() => p.onAbrirEditor('match-log')} />
          <Fila titulo="Tiempos" detalle="Clasificación y tiempos por nodo" onClick={() => p.onAbrirEditor('tiempos')} />
          <Fila titulo="Exportar partida" detalle="Resultados en un fichero" onClick={() => p.onAbrirEditor('exportar')} />
          <Fila titulo="Exigir estar cerca" detalle={TEXTO_EXIGIR_CERCA} estado={encendidoApagado(p.exigirCerca)}>
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
        </ul>

        <h3 className="campo-seccion">Ruta y nodos</h3>
        <ul className="campo-ajustes">
          {p.onAnadirNodo ? <Fila titulo="＋ Añadir nodo" detalle="Un nodo nuevo en el centro de la ruta" onClick={p.onAnadirNodo} /> : null}
          <Fila titulo="Plantillas de misión" detalle="Empezar una ruta entera desde un modelo" onClick={() => p.onAbrirEditor('builder')} />
          <Fila titulo="Editor completo" detalle="Mover nodos, trazado, rastros, QR, copia de respaldo y novedades" onClick={() => p.onAbrirEditor('none')} />
        </ul>

        <h3 className="campo-seccion">Juegos y objetos</h3>
        <ul className="campo-ajustes">
          <Fila titulo="Juegos" detalle="Los minijuegos de cada nodo" onClick={() => p.onAbrirEditor('labels')} />
          <Fila titulo="Objetos" detalle="Lo que se gana y se pide en la ruta" onClick={() => p.onAbrirEditor('objects')} />
        </ul>

        <h3 className="campo-seccion">Personajes y tienda</h3>
        <ul className="campo-ajustes">
          <Fila titulo="Personajes y tienda" detalle="Ropa, accesorios y estrellas: dar, quitar y reglas" onClick={() => p.onAbrirEditor('desbloqueables')} />
        </ul>

        <h3 className="campo-seccion">Historia y textos</h3>
        <ul className="campo-ajustes">
          <Fila titulo="Identidad y prólogo" detalle="Nombre, historia inicial y pantalla de acceso" onClick={() => p.onAbrirEditor('mission', 'identidad')} />
        </ul>

        <h3 className="campo-seccion">Ajustes</h3>
        <ul className="campo-ajustes">
          <Fila titulo="Ajustes de la misión" detalle="Fecha, exigir estar cerca, mapa y contraseña" onClick={() => p.onAbrirEditor('mission', 'inicio')} />
          <Fila titulo="Avisos al organizador" detalle="Qué avisos llegan a tu móvil" onClick={() => p.onAbrirEditor('avisos')} />
          <Fila
            titulo="Pocos datos"
            detalle={TEXTO_POCOS_DATOS}
            estado={encendidoApagado(p.pocos) + (p.pocos && pocosDatosPorLaRed() ? ' (por el ahorro de datos del móvil)' : '')}
          >
            <Interruptor activo={p.pocos} etiqueta="Pocos datos" onCambio={p.onPocos} />
          </Fila>
          {p.dosColumnas ? (
            <Fila
              titulo="Lista y ficha a la vez"
              detalle={p.dosColumnas.activa ? 'Pantalla ancha: dos columnas junto al mapa' : 'Una columna: la ficha tapa la lista'}
            >
              <Interruptor activo={p.dosColumnas.activa} etiqueta="Lista y ficha a la vez" onCambio={p.dosColumnas.onCambio} />
            </Fila>
          ) : null}
          <Fila titulo="Simular (pruebas)" detalle="Jugadores falsos para probar la ruta" onClick={() => p.onAbrirEditor('simulation')} />
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
