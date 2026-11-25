import { lazy, Suspense, useState } from 'react'
import type { AdminPerfilEnVivo, AdminReactOverviewStage } from '../lib/adminApi'
import type { Operacion } from '../lib/accionesDeJugador'
import { etiquetaDeSegundos } from '../lib/ajusteDeTiempo'
import { chipsDeJugador, entregaDeNodo, textoDeNodo } from '../lib/estadoDeJugador'
import { saldoDeEstrellas } from '../lib/estrellasEnCache'
import { textoDeTiempoElegido, type TiempoDeSalto } from '../lib/mensajesDelPanel'
import { Chips } from './Chip'
import Deshacer from './Deshacer'
import HojaDeConfirmacion from './HojaDeConfirmacion'

// La hoja «Dar…» (buscador + accesorios + estrellas) solo se descarga al abrirla: no pesa en el panel.
const HojaDar = lazy(() => import('./HojaDar'))

/** Lo que acompaña a una acción sobre el jugador (ver `runPlayerProfileAction` en AdminApp). */
export type ExtraDeAccion = {
  /** Ya se confirmó en una hoja: no preguntar otra vez con `window.confirm`. */
  confirmado?: boolean
  tiempo_modo?: TiempoDeSalto['modo']
  tiempo_ms?: number
  /** 24/11: con `tiempo_modo: 'nodo'`, el nodo al que se apunta (si el jugador ya va por otro, el servidor no lo aplica). */
  nodo_id?: string
}

export type ExtraDeAjuste = {
  confirmado?: boolean
  /** «Deshacer» durante este tiempo (ms) antes de enviar. */
  retenerMs?: number
}

type ItemDeMochila = { item_id?: string; label?: string; quantity?: number }

type Props = {
  profileId: string
  nombre: string
  nivel: number
  total: number
  terminado: boolean
  stages: AdminReactOverviewStage[]
  vivo?: AdminPerfilEnVivo
  serverTs: number | null
  /** Segundos de antigüedad de los datos si ya son viejos (sin red): la ficha no dice «En vivo». */
  datosViejosS?: number | null
  tiempoTotalMs?: number | null
  inventario: ItemDeMochila[]
  /** Hay una acción de este jugador en curso. */
  ocupado: boolean
  /** Lo que ha pasado con la última acción: error, «sin enviar» o guardado. */
  aviso: { tipo: 'error' | 'espera' | 'ok'; texto: string } | null
  pendientes: Operacion[]
  onAccion: (accion: string, extra?: ExtraDeAccion) => void
  onAjustar: (segundos: number, motivo: string, extra?: ExtraDeAjuste) => void
  /** El ajuste de tiempo libre (cifra y motivo escritos a mano), plegado bajo «Más». */
  ajusteLibre: React.ReactNode
  /**
   * 24/11, panel de campo: «campo» pone las cuatro acciones de siempre en una rejilla de botones grandes (+1 min, +30 s,
   * nodo atrás, nodo adelante) para el pulgar, y `trasAcciones` (los avisos del jugador) justo debajo.
   */
  variante?: 'lista' | 'campo'
  trasAcciones?: React.ReactNode
}

type Confirmacion =
  | { accion: 'level_next' }
  | { accion: 'level_prev' }
  | { accion: 'mark_finished' }
  | { accion: 'reset_profile' }
  | { accion: 'restore_node' }
  | { accion: 'clear_inventory' }
  | { accion: 'remove_item'; itemId: string; etiqueta: string }

const PLAZO_DESHACER_MS = 6000

/** Segundos que lleva en su nodo actual según el panel (null si no se sabe). */
function segundosEnElNodo(vivo: AdminPerfilEnVivo | undefined, serverTs: number | null): number | null {
  const desde = Number(vivo?.en_nodo_desde)
  return vivo && !vivo.finished && serverTs && Number.isFinite(desde) && desde > 0 ? Math.max(0, serverTs - desde) : null
}

/**
 * La ficha de un jugador como tarjeta de campo: quién es y en qué estado está (chips), lo que más se usa en el monte
 * (+1 min, +30 s, un nodo atrás/adelante, dar algo) a un toque y lo menos frecuente (restaurar, reiniciar, terminar)
 * en «Más». Lo reversible se aplica y deja «Deshacer» 6 s; lo que mueve al jugador pregunta qué se le da y qué
 * tiempo cuesta.
 */
export default function FichaDeCampo(props: Props) {
  const {
    profileId,
    nombre,
    nivel,
    total,
    terminado,
    stages,
    vivo,
    serverTs,
    datosViejosS,
    tiempoTotalMs,
    inventario,
    ocupado,
    aviso,
    pendientes,
    onAccion,
    onAjustar,
    ajusteLibre,
    variante = 'lista',
    trasAcciones,
  } = props
  const [confirmando, setConfirmando] = useState<Confirmacion | null>(null)
  const [dando, setDando] = useState(false)

  const stage = stages[nivel]
  const siguiente = stages[nivel + 1]
  const chips = chipsDeJugador({
    vivo,
    serverTs,
    terminado,
    datosViejosS,
    tiempoTexto:
      tiempoTotalMs && tiempoTotalMs > 0 ? etiquetaDeSegundos(tiempoTotalMs / 1000) : undefined,
    estrellas: saldoDeEstrellas(profileId),
  })
  const aLaVez = ocupado
  const nodoLinea = textoDeNodo(nivel, total, stage?.title ? String(stage.title) : null, terminado)

  function confirmar(c: Confirmacion, tiempo: TiempoDeSalto) {
    setConfirmando(null)
    const extra: ExtraDeAccion = { confirmado: true }
    if (c.accion === 'level_next' || c.accion === 'mark_finished') {
      extra.tiempo_modo = tiempo.modo
      if (tiempo.modo === 'cifra' || tiempo.modo === 'nodo') extra.tiempo_ms = tiempo.ms
      if (tiempo.modo === 'nodo' && stage?.id != null) extra.nodo_id = String(stage.id)
    }
    onAccion(c.accion === 'remove_item' ? `remove_item:${c.itemId}` : c.accion, extra)
  }

  function hojaDe(c: Confirmacion) {
    switch (c.accion) {
      case 'level_next':
        return {
          titulo: 'Un nodo adelante',
          intro: `${nombre} pasa del nodo ${nivel + 1} al ${nivel + 2}${siguiente?.title ? ` · ${siguiente.title}` : ''}. Lo verá en su móvil al reconectar.`,
          entrega: entregaDeNodo(stage),
          avisos: [] as string[],
          conTiempo: true,
          // 24/11: en un nodo con juego se apunta el tiempo que tardó (como si lo hubiera superado), no una penalización.
          tiempoDeNodo: stage?.lleva_tiempo
            ? { nombre: String(stage.title || `nodo ${nivel + 1}`), enNodoS: segundosEnElNodo(vivo, serverTs) }
            : undefined,
          texto: 'Pasar de nodo',
        }
      case 'level_prev':
        return {
          titulo: 'Un nodo atrás',
          intro: `${nombre} vuelve del nodo ${nivel + 1} al ${Math.max(1, nivel)}. Tendrá que volver a hacerlo: se borra el tiempo que tenga en ese nodo.`,
          entrega: [] as string[],
          avisos: [] as string[],
          conTiempo: false,
          texto: 'Volver un nodo',
        }
      case 'mark_finished':
        return {
          titulo: 'Terminar partida',
          intro: `${nombre} termina la partida ahora${
            total - nivel > 1 ? ` (le quedaban ${total - nivel} nodos)` : total - nivel === 1 ? ' (le quedaba 1 nodo)' : ''
          }.`,
          entrega: stages.slice(nivel).flatMap((s) => entregaDeNodo(s)),
          avisos: [] as string[],
          conTiempo: true,
          texto: 'Terminar partida',
        }
      case 'reset_profile':
        return {
          titulo: `Reiniciar la partida de ${nombre}`,
          intro: 'Vuelve al primer nodo y pierde sus tiempos. No se puede deshacer.',
          entrega: [] as string[],
          avisos: [] as string[],
          conTiempo: false,
          texto: 'Reiniciar partida',
          peligro: true,
        }
      case 'restore_node':
        return {
          titulo: 'Restaurar nodo',
          intro: `${nombre} baja un nodo y se le quita el tiempo que gastó en él y su penalización.`,
          entrega: [] as string[],
          avisos: [] as string[],
          conTiempo: false,
          texto: 'Restaurar nodo',
        }
      case 'clear_inventory':
        return {
          titulo: 'Vaciar la mochila',
          intro: `Se quitan todos los objetos de la mochila de ${nombre}.`,
          entrega: [] as string[],
          avisos: [] as string[],
          conTiempo: false,
          texto: 'Vaciar mochila',
          peligro: true,
        }
      default:
        return {
          titulo: `Quitar «${c.etiqueta}»`,
          intro: `Se le quita ese objeto a ${nombre}.`,
          entrega: [] as string[],
          avisos: [] as string[],
          conTiempo: false,
          texto: 'Quitar',
          peligro: true,
        }
    }
  }

  const hoja = confirmando ? hojaDe(confirmando) : null

  return (
    <div className="r8-ficha">
      <Chips chips={chips} etiqueta={`Estado de ${nombre}`} />

      {aviso ? (
        <p className={`r8-estado ${aviso.tipo}`} role={aviso.tipo === 'error' ? 'alert' : 'status'}>
          {aviso.texto}
        </p>
      ) : null}

      {variante === 'campo' ? (
        <section className="r8-seccion campo-acciones" aria-label="Acciones">
          <h4>Acciones</h4>
          <div className="campo-cuatro">
            <button
              type="button"
              className="r8-boton primario"
              disabled={aLaVez}
              onClick={() => onAjustar(60, '', { confirmado: true, retenerMs: PLAZO_DESHACER_MS })}
            >
              <strong>+1 min</strong>
              <small>se puede deshacer</small>
            </button>
            <button
              type="button"
              className="r8-boton"
              disabled={aLaVez}
              onClick={() => onAjustar(30, '', { confirmado: true, retenerMs: PLAZO_DESHACER_MS })}
            >
              <strong>+30 s</strong>
              <small>se puede deshacer</small>
            </button>
            <button
              type="button"
              className="r8-boton"
              disabled={aLaVez || (!terminado && nivel <= 0)}
              onClick={() => setConfirmando({ accion: 'level_prev' })}
            >
              <strong>‹ Nodo atrás</strong>
              <small>{terminado ? 'reabre el último' : `vuelve al ${Math.max(1, nivel)}`}</small>
            </button>
            <button
              type="button"
              className="r8-boton"
              disabled={aLaVez || terminado}
              onClick={() => setConfirmando({ accion: 'level_next' })}
            >
              <strong>Nodo adelante ›</strong>
              <small>{terminado ? 'ya terminó' : nivel + 1 >= total ? 'termina la ruta' : `pasa al ${nivel + 2}`}</small>
            </button>
          </div>
          <Deshacer pendientes={pendientes} jugador={profileId} />
          {trasAcciones}
        </section>
      ) : null}

      {variante === 'campo' ? null : (
      <section className="r8-seccion" aria-label="Tiempo">
        <h4>Tiempo</h4>
        <div className="r8-fila-botones">
          <button
            type="button"
            className="r8-boton primario"
            disabled={aLaVez}
            onClick={() => onAjustar(60, '', { confirmado: true, retenerMs: PLAZO_DESHACER_MS })}
          >
            <strong>+1 min</strong>
            <small>Se aplica y puedes deshacerlo</small>
          </button>
          <button
            type="button"
            className="r8-boton"
            disabled={aLaVez}
            onClick={() => onAjustar(30, '', { confirmado: true, retenerMs: PLAZO_DESHACER_MS })}
          >
            <strong>+30 s</strong>
            <small>Se aplica y puedes deshacerlo</small>
          </button>
        </div>
      </section>

      )}

      {variante === 'campo' ? null : <Deshacer pendientes={pendientes} jugador={profileId} />}

      {variante === 'campo' ? null : (
      <section className="r8-seccion" aria-label="Nodo">
        <h4>{nodoLinea}</h4>
        <div className="r8-fila-botones">
          <button
            type="button"
            className="r8-boton"
            disabled={aLaVez || (!terminado && nivel <= 0)}
            onClick={() => setConfirmando({ accion: 'level_prev' })}
          >
            <strong>Un nodo atrás</strong>
            <small>
              {terminado ? 'reabre el último nodo' : `vuelve al nodo ${Math.max(1, nivel)}`}
            </small>
          </button>
          <button
            type="button"
            className="r8-boton"
            disabled={aLaVez || terminado}
            onClick={() => setConfirmando({ accion: 'level_next' })}
          >
            <strong>Un nodo adelante</strong>
            <small>
              {terminado
                ? 'ya terminó'
                : `${nivel + 1 >= total ? 'termina la ruta' : `pasa al nodo ${nivel + 2}`} · ${textoDeTiempoElegido({ modo: 'ninguno', ms: 0 })}`}
            </small>
          </button>
        </div>
      </section>
      )}

      <section className="r8-seccion" aria-label="Mochila">
        <h4>Mochila ({inventario.length})</h4>
        {inventario.length === 0 ? (
          <p className="r8-vacio">La mochila está vacía.</p>
        ) : (
          <ul className="r8-mochila">
            {inventario.map((item, i) => {
              const etiqueta = String(item.label || item.item_id || 'objeto')
              return (
                <li key={`${item.item_id}-${i}`}>
                  <strong>{etiqueta}</strong>
                  <span>
                    {Number(item.quantity) > 1 ? `× ${item.quantity}` : ''}
                    <button
                      type="button"
                      className="r8-enlace"
                      disabled={aLaVez || !item.item_id}
                      aria-label={`Quitar ${etiqueta} a ${nombre}`}
                      onClick={() =>
                        setConfirmando({
                          accion: 'remove_item',
                          itemId: String(item.item_id),
                          etiqueta,
                        })
                      }
                    >
                      Quitar
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        <button
          type="button"
          className="r8-boton primario"
          disabled={aLaVez}
          onClick={() => setDando(true)}
        >
          <strong>Dar objeto o accesorio…</strong>
          <small>Mochila, accesorios y estrellas, con buscador</small>
        </button>
      </section>

      <details className="r8-datos">
        <summary>Más</summary>
        <div className="r8-mas">
          <button
            type="button"
            className="r8-boton"
            disabled={aLaVez || nivel <= 0}
            onClick={() => setConfirmando({ accion: 'restore_node' })}
          >
            <strong>Restaurar nodo</strong>
            <small>baja un nodo y quita su tiempo y penalización</small>
          </button>
          <button
            type="button"
            className="r8-boton"
            disabled={aLaVez || terminado}
            onClick={() => setConfirmando({ accion: 'mark_finished' })}
          >
            <strong>Terminar partida</strong>
            <small>la da por acabada ahora</small>
          </button>
          <button
            type="button"
            className="r8-boton peligro"
            disabled={aLaVez}
            onClick={() => setConfirmando({ accion: 'reset_profile' })}
          >
            <strong>Reiniciar partida</strong>
            <small>vuelve al primer nodo y pierde sus tiempos</small>
          </button>
          {inventario.length > 0 ? (
            <button
              type="button"
              className="r8-boton peligro"
              disabled={aLaVez}
              onClick={() => setConfirmando({ accion: 'clear_inventory' })}
            >
              <strong>Vaciar mochila</strong>
              <small>quita todos los objetos</small>
            </button>
          ) : null}
          {ajusteLibre}
        </div>
      </details>

      {confirmando && hoja ? (
        <HojaDeConfirmacion
          titulo={hoja.titulo}
          intro={hoja.intro}
          entrega={hoja.entrega}
          avisos={hoja.avisos}
          conTiempo={hoja.conTiempo}
          tiempoDeNodo={'tiempoDeNodo' in hoja ? hoja.tiempoDeNodo : undefined}
          textoConfirmar={hoja.texto}
          peligro={'peligro' in hoja ? hoja.peligro : false}
          onCancelar={() => setConfirmando(null)}
          onConfirmar={(tiempo) => confirmar(confirmando, tiempo)}
        />
      ) : null}

      {dando ? (
        <Suspense fallback={null}>
          <HojaDar
            profileId={profileId}
            nombre={nombre}
            nivel={nivel}
            stages={stages}
            enMochila={inventario.map((i) => String(i.item_id || ''))}
            onDarObjeto={(itemId) => onAccion(`give_item:${itemId}`, { confirmado: true })}
            onCerrar={() => setDando(false)}
          />
        </Suspense>
      ) : null}
    </div>
  )
}
