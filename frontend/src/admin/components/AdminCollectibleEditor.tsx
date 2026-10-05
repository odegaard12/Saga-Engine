import { useMemo } from 'react'
import NodeEditorFrame, { MaquetaMovil, type EstadoGuardado, type SeccionDef } from './editor/NodeEditorFrame'
import RecompensaDeVestuario from './vestuario/RecompensaDeVestuario'
import { estadoDelNodoEnEdicion, type SeccionEditor } from '../lib/estadoNodo'
import type { StageLike } from './guided-editor/guidedEditorUtils'
import { configOf } from './guided-editor/guidedEditorUtils'
import { REQUIRED_ITEM_LABELS } from '../lib/stageFields'

export interface AdminCollectibleEditorProps {
  stage: StageLike
  onPatch: (updates: Record<string, any>) => void
  onClose: () => void
  onDelete: () => void
  onRequestChangeType?: () => void
  stages?: StageLike[]
  estadoGuardado?: EstadoGuardado
  onGuardar?: () => void
}

export default function AdminCollectibleEditor({
  stage,
  onPatch,
  onClose,
  onDelete,
  onRequestChangeType,
  stages = [],
  estadoGuardado = 'idle',
  onGuardar,
}: AdminCollectibleEditorProps) {
  const config = configOf(stage)

  const collectibleItems = useMemo(() => {
    return stages
      .filter((s) => {
        if (s.id === stage.id) return false
        const sId = s.physical_item_id ?? s.physical_qr?.item_id ?? s.config?.physical_item_id ?? ''
        return Boolean(sId)
      })
      .map((s) => {
        const sId = s.physical_item_id ?? s.physical_qr?.item_id ?? s.config?.physical_item_id ?? ''
        const sLabel = s.physical_item_label ?? s.physical_qr?.label ?? s.title ?? `Nodo ${s.index + 1}`
        const icon = (s.physical_node_kind === 'collectible' || s.is_map_collectible || s.config?.is_map_collectible) ? '🎁' : '🔑'
        return {
          id: sId,
          label: `${icon} ${sLabel} (del Nodo ${s.index + 1})`,
        }
      })
  }, [stages, stage.id])

  const isLockedByItem = Boolean(stage.required_item_id && stage.requires_item !== false)
  const isCustomItem = isLockedByItem && 
    !(stage.required_item_id in REQUIRED_ITEM_LABELS) && 
    !collectibleItems.some(i => i.id === stage.required_item_id)

  function updateConfig(key: string, value: any) {
    onPatch({
      config: {
        ...config,
        [key]: value
      }
    })
  }

  const estadoEditor = estadoDelNodoEnEdicion(stage as never, stages as never[])
  const avisosDe = (seccion: SeccionEditor) =>
    estadoEditor.problemas.filter((p) => p.seccion === seccion).map((p) => p.texto)
  const secciones: SeccionDef[] = [
    {
      id: 'identidad',
      titulo: 'Identidad y tipo',
      icono: '⭐',
      resumen: `Coleccionable · ${stage.physical_item_id ? `id «${stage.physical_item_id}»` : 'sin ID interno'}`,
      nivel: avisosDe('identidad').length ? 'incompleto' : 'ok',
      avisos: avisosDe('identidad'),
      abierta: true,
      contenido: (
        <>
          <p className="r7-ayuda-seccion">
            Cómo se verá este coleccionable en la mochila del jugador. Se recoge solo al acercarse
            con el GPS, sin minijuego.
          </p>
            <label>
              <span>ID interno (para lógica)</span>
              <input 
                type="text" 
                value={stage.physical_item_id || ''} 
                onChange={(e) => onPatch({ physical_item_id: e.target.value })}
                placeholder="Ej. bateria_1, reliquia"
              />
              <small>Usa minúsculas sin espacios. Este ID servirá si otro nodo requiere este objeto.</small>
            </label>
        </>
      ),
    },
    {
      id: 'donde',
      titulo: 'Dónde y acceso',
      icono: '📍',
      resumen: `${isLockedByItem ? `Pide ${stage.required_item_label || stage.required_item_id}` : 'Abierto a todos'}`,
      nivel: avisosDe('donde').length ? 'incompleto' : 'ok',
      avisos: avisosDe('donde'),
      abierta: avisosDe('donde').length > 0,
      contenido: (
        <>
          <div className="r7-coordenadas">
            <span className="r7-campo-etiqueta">Posición en el mapa</span>
            <code>
              {stage.lat != null && stage.lon != null
                ? `${Number(stage.lat).toFixed(5)}, ${Number(stage.lon).toFixed(5)}`
                : 'Sin posición'}
            </code>
            <small>Para moverlo, arrastra su pin en el mapa.</small>
          </div>
          <div className="r7-campo ancho">
            <span className="r7-campo-etiqueta">¿Requiere un objeto previo?</span>
            <select
              value={!isLockedByItem ? 'none' : isCustomItem ? 'custom' : stage.required_item_id}
              onChange={(e) => {
                const val = e.target.value
                // Estos campos se guardan con el nodo (ver lib/stageFields.ts).
                if (val === 'none') {
                  onPatch({ required_item_id: '', requires_item: false, consume_required_item: false })
                } else if (val === 'custom') {
                  onPatch({ required_item_id: 'item_requerido', requires_item: true, required_item_label: 'Objeto requerido' })
                } else {
                  onPatch({
                    required_item_id: val,
                    requires_item: true,
                    required_item_label:
                      REQUIRED_ITEM_LABELS[val] ||
                      collectibleItems.find((item) => item.id === val)?.label.replace(/^\S+\s+/, '').replace(/\s*\(del Nodo \d+\)\s*$/, '') ||
                      val,
                  })
                }
              }}
            >
              <option value="none">🟢 Libre: cualquier jugador puede acceder</option>
              <option value="llave_maestra">🔑 Requiere Llave Maestra</option>
              <option value="emp_device">⚡ Requiere Dispositivo EMP</option>
              <option value="decodificador_cuantico">💻 Requiere Decodificador Cuántico</option>
              <option value="escaner_biometrico">🔬 Requiere Escáner Biométrico</option>
              <option value="amuleto_guardian">🛡️ Requiere Amuleto del Guardián</option>
              <option value="elixir_alquimia">🧪 Requiere Elixir de Alquimia</option>
              <option value="escudo_runico">🛡️ Requiere Escudo Rúnico</option>
              <option value="orbe_fuego">🔮 Requiere Orbe de Fuego Arcano</option>
              <option value="reliquia_sagrada">🏛️ Requiere Reliquia Sagrada</option>
              <option value="amuleto_vision">👁️ Requiere Amuleto de Visión</option>
              {collectibleItems.map(item => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
              <option value="custom">✏️ Otro ID personalizado...</option>
            </select>
            {isCustomItem && (
              <label>
                <span>ID del objeto requerido</span>
                <input
                  type="text"
                  value={stage.required_item_id}
                  onChange={(e) =>
                    onPatch({
                      required_item_id: e.target.value,
                      requires_item: Boolean(e.target.value),
                      required_item_label: e.target.value,
                    })
                  }
                  placeholder="Ej. tarjeta_roja"
                />
              </label>
            )}
            <small>El jugador no podrá recoger este objeto si no lleva antes el elegido en la mochila.</small>
          </div>
        </>
      ),
    },
    {
      id: 'historia',
      titulo: 'Historia y pistas',
      icono: '📜',
      resumen: `${stage.intro_title ? `Prólogo «${stage.intro_title}»` : 'Sin prólogo'} · ${stage.content ? 'con mensaje al recoger' : 'sin mensaje'}`,
      abierta: true,
      contenido: (
        <>
            <label className="wide" style={{ marginTop: 12 }}>
              <span>Historia / Introducción (Opcional)</span>
              <input 
                type="text" 
                value={stage.intro_title || ''} 
                onChange={(e) => onPatch({ intro_title: e.target.value })}
                placeholder="Título de la historia"
                style={{ marginBottom: 8 }}
              />
              <textarea 
                value={stage.intro_body || ''} 
                onChange={(e) => onPatch({ intro_body: e.target.value })}
                placeholder="Escribe la narrativa que leerá el jugador ANTES de recoger el objeto. Soporta Markdown para imágenes: ![alt](url)."
                rows={3}
              />
            </label>
            <label className="wide" style={{ marginTop: 12 }}>
              <span>Mensaje al recoger</span>
              <textarea 
                value={stage.content || ''} 
                onChange={(e) => onPatch({ content: e.target.value, description: e.target.value })}
                placeholder="¡Has encontrado una reliquia!"
                rows={3}
              />
            </label>
        </>
      ),
    },
    {
      id: 'recompensas',
      titulo: 'Recompensas',
      icono: '🎁',
      resumen: 'Vestuario que gana quien supere este nodo',
      abierta: false,
      contenido: (
        <div className="r7-campo ancho">
          <RecompensaDeVestuario nodeId={String(stage.id ?? '')} />
        </div>
      ),
    },
  ]

  return (
    <NodeEditorFrame
      numero={Number(stage.index ?? 0) + 1}
      titulo={String(stage.title || stage.physical_item_label || '').replace(/^\d+\.\s*/, '')}
      onTitulo={(valor) => onPatch({ title: valor, physical_item_label: valor })}
      tipoIcono="⭐"
      tipoTexto="Coleccionable de mapa"
      nivel={estadoEditor.nivel}
      motivos={estadoEditor.motivos}
      coordenadas={
        stage.lat != null && stage.lon != null
          ? `${Number(stage.lat).toFixed(5)}, ${Number(stage.lon).toFixed(5)}`
          : ''
      }
      estadoGuardado={estadoGuardado}
      onGuardar={onGuardar}
      onCerrar={onClose}
      onEliminar={onDelete}
      onCambiarTipo={() => {
        if (onRequestChangeType) {
          onRequestChangeType()
        } else {
          onPatch({ _type_choice_done: false })
        }
      }}
      secciones={secciones}
      vistaPrevia={
        <MaquetaMovil
          titulo={String(stage.title || stage.physical_item_label || '').replace(/^\d+\.\s*/, '')}
          tipo="Coleccionable"
          tipoIcono="⭐"
          prologoTitulo={String(stage.intro_title || '')}
          prologo={String(stage.intro_body || '')}
          texto={String(stage.content || '')}
          accion="Recoger el objeto"
        />
      }
    />
  )
}
