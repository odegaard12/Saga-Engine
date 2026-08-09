import { useState } from 'react'

type WizardStep = 'choose' | 'activation' | 'fallback' | 'messages' | 'test'

type GameTemplateWizardPanelProps = {
  selectedGameTitle?: string
  onClose: () => void
  onGoToGame: () => void
  onGoToBasics: () => void
  onGoToMessages: () => void
}

const steps: Array<{ id: WizardStep; label: string; detail: string }> = [
  { id: 'choose', label: '1. Juego', detail: 'Elige la plantilla base' },
  { id: 'activation', label: '2. Activación', detail: 'Radio, proximidad e interacción' },
  { id: 'fallback', label: '3. Emergencia', detail: 'Código fallback seguro' },
  { id: 'messages', label: '4. Mensajes', detail: 'Textos que verá el jugador' },
  { id: 'test', label: '5. Probar', detail: 'Guardar y validar en jugador' },
]

const games = [
  {
    icon: '📡',
    title: 'Señal GPS',
    tag: 'Ruta exterior estable',
    body: 'El jugador llega al radio del nodo y confirma presencia. Es la plantilla base para rutas al aire libre.',
  },
  {
    icon: '🧭',
    title: 'Rumbo con brújula',
    tag: 'Orientación',
    body: 'El jugador debe orientarse hacia una dirección. Úsalo cuando el reto sea mirar, buscar o apuntar.',
  },
  {
    icon: '⭐',
    title: 'Objeto QR',
    tag: 'Objeto físico',
    body: 'Tarjeta física que se guarda en la mochila del jugador. Ideal para coleccionables o pruebas opcionales.',
  },
  {
    icon: '🔑',
    title: 'Llave QR',
    tag: 'Desbloqueo',
    body: 'Objeto QR pensado para abrir otro nodo posterior. Úsalo para candados, puertas o secuencias.',
  },
  {
    icon: '🧩',
    title: 'Pista QR',
    tag: 'Información',
    body: 'Tarjeta que entrega una pista para resolver otro reto. Buena para juegos narrativos.',
  },
  {
    icon: '🎁',
    title: 'Bonus oculto',
    tag: 'Extra',
    body: 'Recompensa opcional, broma, contenido secreto o logro fuera del camino principal.',
  },
]

export default function GameTemplateWizardPanel({
  selectedGameTitle,
  onClose,
  onGoToGame,
  onGoToBasics,
  onGoToMessages,
}: GameTemplateWizardPanelProps) {
  const [step, setStep] = useState<WizardStep>('choose')

  const currentIndex = steps.findIndex((item) => item.id === step)
  const canBack = currentIndex > 0
  const canNext = currentIndex < steps.length - 1

  function goNext() {
    if (canNext) setStep(steps[currentIndex + 1].id)
  }

  function goBack() {
    if (canBack) setStep(steps[currentIndex - 1].id)
  }

  return (
    <div className="admin-game-wizard-shell" role="presentation">
      <section
        className="admin-game-wizard"
        role="dialog"
        aria-modal="true"
        aria-label="Asistente de configuración de juego"
      >
        <header className="admin-game-wizard-head">
          <div>
            <span>Asistente de plantilla</span>
            <strong>Configura este juego paso a paso</strong>
            <p>
              Juego actual: <b>{selectedGameTitle || 'plantilla seleccionada'}</b>. El asistente te
              guía; los cambios finales se guardan con el botón Guardar de Control de misión.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar asistente de juego">
            Cerrar ×
          </button>
        </header>

        <div className="admin-game-wizard-layout">
          <aside className="admin-game-wizard-steps" aria-label="Pasos de configuración">
            {steps.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === step ? 'active' : ''}
                onClick={() => setStep(item.id)}
              >
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </button>
            ))}
          </aside>

          <main className="admin-game-wizard-main">
            {step === 'choose' ? (
              <section className="admin-game-wizard-page">
                <div className="admin-game-wizard-page-head">
                  <span>Paso 1</span>
                  <h3>Selecciona primero el tipo de juego</h3>
                  <p>
                    Elige una plantilla estable. Después el asistente te lleva a configurar lo
                    mínimo necesario para que sea jugable en ruta y offline.
                  </p>
                </div>

                <div className="admin-game-wizard-game-grid">
                  {games.map((game) => (
                    <button key={game.title} type="button" onClick={() => setStep('activation')}>
                      <span>{game.icon}</span>
                      <strong>{game.title}</strong>
                      <small>{game.tag}</small>
                      <p>{game.body}</p>
                    </button>
                  ))}
                </div>

                <div className="admin-game-wizard-callout">
                  <b>Cómo se aplica</b>
                  <p>
                    Selecciona la plantilla en la pestaña Juego. Después vuelve aquí o pulsa
                    Siguiente para configurar radio, fallback y mensajes.
                  </p>
                  <button type="button" onClick={onGoToGame}>
                    Ir a selección de juego
                  </button>
                </div>
              </section>
            ) : null}

            {step === 'activation' ? (
              <section className="admin-game-wizard-page">
                <div className="admin-game-wizard-page-head">
                  <span>Paso 2</span>
                  <h3>Configura cómo se activa el nodo</h3>
                  <p>
                    Define el radio, si requiere proximidad y cómo interactúa el jugador. La
                    posición se mueve arrastrando el nodo en el mapa.
                  </p>
                </div>

                <div className="admin-game-wizard-cards">
                  <article>
                    <b>Radio</b>
                    <p>
                      Para exterior, empieza con 40–75 m. Si hay edificios o GPS flojo, usa más
                      margen.
                    </p>
                  </article>
                  <article>
                    <b>Interacción</b>
                    <p>
                      Por radio GPS es lo más estable. Rumbo o QR requieren pruebas específicas.
                    </p>
                  </article>
                  <article>
                    <b>Proximidad</b>
                    <p>
                      Actívala si el jugador debe estar físicamente cerca. Desactívala solo para
                      nodos informativos.
                    </p>
                  </article>
                </div>

                <div className="admin-game-wizard-callout">
                  <b>Configurar ahora</b>
                  <p>Estos campos están en Básico para no duplicar Ubicación.</p>
                  <button type="button" onClick={onGoToBasics}>
                    Ir a Básico
                  </button>
                </div>
              </section>
            ) : null}

            {step === 'fallback' ? (
              <section className="admin-game-wizard-page">
                <div className="admin-game-wizard-page-head">
                  <span>Paso 3</span>
                  <h3>Prepara el modo emergencia</h3>
                  <p>
                    El fallback permite completar el nodo si falla GPS, cámara, QR, brújula o
                    cobertura. Es para el monitor, no para enseñar al jugador.
                  </p>
                </div>

                <div className="admin-game-wizard-cards">
                  <article>
                    <b>Código corto</b>
                    <p>Debe ser fácil de dictar. Ejemplo: SAGA-06.</p>
                  </article>
                  <article>
                    <b>Cuándo usarlo</b>
                    <p>
                      Solo si el jugador está en el sitio o ha hecho la prueba, pero el móvil falla.
                    </p>
                  </article>
                  <article>
                    <b>Prueba offline</b>
                    <p>
                      Antes de jugar, abre el jugador con misión descargada y confirma que el
                      fallback completa el nodo.
                    </p>
                  </article>
                </div>
              </section>
            ) : null}

            {step === 'messages' ? (
              <section className="admin-game-wizard-page">
                <div className="admin-game-wizard-page-head">
                  <span>Paso 4</span>
                  <h3>Escribe lo que verá el jugador</h3>
                  <p>
                    Los mensajes son clave para que el juego no dependa de que el monitor explique
                    todo en persona.
                  </p>
                </div>

                <div className="admin-game-wizard-cards">
                  <article>
                    <b>Pista</b>
                    <p>Debe decir qué buscar o hacia dónde pensar, sin resolver el reto.</p>
                  </article>
                  <article>
                    <b>Sin GPS</b>
                    <p>Mensaje claro para permisos, mala señal o modo emergencia.</p>
                  </article>
                  <article>
                    <b>Bloqueo / éxito</b>
                    <p>Explica por qué no puede avanzar o qué consiguió al completar el nodo.</p>
                  </article>
                </div>

                <div className="admin-game-wizard-callout">
                  <b>Editar mensajes</b>
                  <p>Abre la pestaña Mensajes para ajustar los textos concretos.</p>
                  <button type="button" onClick={onGoToMessages}>
                    Ir a Mensajes
                  </button>
                </div>
              </section>
            ) : null}

            {step === 'test' ? (
              <section className="admin-game-wizard-page">
                <div className="admin-game-wizard-page-head">
                  <span>Paso 5</span>
                  <h3>Guarda y prueba como jugador</h3>
                  <p>
                    Guarda en Control de misión, abre el jugador y valida el flujo real: desbloqueo,
                    offline, fallback y avance al siguiente nodo.
                  </p>
                </div>

                <div className="admin-game-wizard-cards">
                  <article>
                    <b>Prueba normal</b>
                    <p>Completa el nodo con el método principal: GPS, rumbo o QR.</p>
                  </article>
                  <article>
                    <b>Prueba emergencia</b>
                    <p>Simula fallo y usa el fallback para confirmar que desbloquea.</p>
                  </article>
                  <article>
                    <b>Prueba secuencia</b>
                    <p>
                      Comprueba que al completar este nodo el siguiente queda en el estado correcto.
                    </p>
                  </article>
                </div>
              </section>
            ) : null}
          </main>
        </div>

        <footer className="admin-game-wizard-footer">
          <button type="button" onClick={goBack} disabled={!canBack}>
            Atrás
          </button>
          <button type="button" onClick={goNext} disabled={!canNext}>
            Siguiente
          </button>
          <button type="button" onClick={onClose}>
            Cerrar asistente
          </button>
        </footer>
      </section>
    </div>
  )
}
