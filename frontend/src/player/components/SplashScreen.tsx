import React from 'react'

interface SplashScreenProps {
  progress?: number
  detail?: string
  /** Trozos de mapa guardados y total, para poder decir algo mas que un %. */
  done?: number
  total?: number
  /** Es la primera vez: no hay nada guardado y toca bajarlo todo. */
  primeiraVez?: boolean
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  progress,
  detail,
  done,
  total,
  primeiraVez,
}) => {
  const known = typeof progress === 'number' && Number.isFinite(progress)
  const pct = known ? Math.max(0, Math.min(100, Math.round(progress))) : 0

  // El mapa son miles de trozos y el porcentaje entero se queda clavado en 0
  // un buen rato: parecia colgado. Con un decimal se ve que avanza desde el
  // primer momento.
  const pctFino =
    known && progress < 10 ? Math.max(0, Math.round(progress * 10) / 10) : pct

  // `done`/`total` siguen llegando como props -quien llama los calcula igual-
  // pero ya no se pintan crudos: ver la nota de más abajo, en la fase de
  // cálculo son un marcador de escala, no teselas de verdad.
  void done
  void total

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        /**
         * Del tema, no de una paleta propia.
         *
         * Esta es la pantalla que un jugador mira mas rato el dia que estrena
         * la aplicacion, mientras se guarda el mapa. Tenia dos halos azul
         * cielo y verde sobre un azul marino, dijera lo que dijera el tema:
         * se entraba a la mision con los colores de otra.
         *
         * La pagina ya llega del servidor con la clase del tema puesta, asi
         * que estas variables valen desde el primer pixel, sin parpadeo.
         */
        background:
          'radial-gradient(circle at 50% 22%, var(--theme-tint-strong), transparent 46%),' +
          'radial-gradient(circle at 50% 88%, var(--theme-tint), transparent 44%),' +
          'linear-gradient(180deg, var(--theme-surface) 0%, var(--theme-bg) 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#f8fafc',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        zIndex: 999999,
        padding: '0 26px',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/**
       * El icono, más pequeño y sin halos girando.
       *
       * Con 116px + dos anillos en movimiento + halo era lo que más pesaba de
       * la pantalla, y en una carga que dura dos segundos aparece y desaparece
       * a destiempo: "queda feo entre medias". A 72px y quieto acompaña a los
       * pasos en vez de competir con ellos, que son lo que de verdad hay que
       * mirar aquí.
       */}
      <div style={{ position: 'relative', marginBottom: 22 }}>
        <img
          src="/saga-app-icon-192.png?v=redondo"
          alt="SAGA"
          style={{
            position: 'relative',
            width: 72,
            height: 72,
            // Redondo de verdad, no la esquina cortada del tema. El icono
            // en sí ya venía a sangre completa hasta el borde -lo pedía la
            // especificación de iconos "maskable" del manifest, ver
            // saga-app-icon.svg-, así que recortarlo en redondo aquí no
            // corta nada importante: el dibujo ya vive dentro de la zona
            // segura central.
            borderRadius: '50%',
            boxShadow: '0 8px 28px rgba(0,0,0,.5)',
          }}
        />
      </div>

      {/**
       * Por pasos, no un porcentaje suelto.
       *
       * Antes esto era una barra y un número grande: decía CUÁNTO falta pero
       * no QUÉ está pasando, y con el mapa tardando minutos parecía colgado.
       * Ahora se ve la lista de lo que hace, con lo ya hecho en verde y lo
       * que va por dentro con su barra.
       *
       * Los pasos son REALES, no decorativos: si hay progreso de mapa es que
       * la misión ya se cargó -es lo que dispara esta pantalla en
       * PlayerApp-, así que ese paso se marca hecho de verdad, no "porque
       * queda bonito". No se inventan pasos de los que no haya dato.
       */}
      <div style={{ width: 'min(86vw, 290px)', display: 'grid', gap: 13 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 18,
              textAlign: 'center',
              fontSize: 14,
              color: known ? 'rgb(var(--theme-done))' : 'var(--theme-primary)',
            }}
          >
            {known ? '✓' : '•'}
          </span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: known ? 'rgb(var(--theme-line))' : '#f8fafc',
            }}
          >
            Misión
          </span>
        </div>

        <div style={{ display: 'grid', gap: 7 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 18,
                textAlign: 'center',
                fontSize: 14,
                color: 'var(--theme-primary)',
              }}
            >
              •
            </span>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>Mapa</span>
            {known ? (
              // key={pctFino}: sin esto el número se quedaba clavado tras la
              // primera actualización -medido con sim/playwright-bench: la
              // barra SÍ seguía llenándose con datos reales (0 fallos, 900+
              // teselas bajadas), pero este texto se congelaba en el primer
              // valor, mientras React seguía recalculando el correcto por
              // dentro (visto en consola) sin que llegara al DOM. Con la key
              // atada al valor, React recrea el nodo en vez de parchearlo.
              <span
                key={pctFino}
                style={{
                  fontSize: 13,
                  fontWeight: 900,
                  color: 'rgb(var(--theme-line))',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {pctFino}%
              </span>
            ) : null}
          </div>

          <div
            style={{
              marginLeft: 28,
              height: 4,
              background: 'rgba(255,255,255,.09)',
              borderRadius: 'var(--theme-radius-pill)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                borderRadius: 'var(--theme-radius-pill)',
                background:
                  'linear-gradient(90deg, var(--theme-primary-hover), var(--theme-primary))',
                width: known ? `${pct}%` : '38%',
                transition: 'width .35s cubic-bezier(.22,1,.36,1)',
                animation: known ? 'none' : 'sagaSplashSlide 1.4s infinite ease-in-out',
                boxShadow: '0 0 14px var(--theme-glow)',
              }}
            />
          </div>

          {/* Aquí había un "{done} / {total} trozos" que yo mismo añadí y era
              MENTIRA a ratos: en la fase "Calculando mapa",
              mapTileCache.ts manda `done: 0, total: 100` como marcador de
              escala, no como cuenta de teselas. Se leía "0 / 100 trozos"
              cuando no había ni plan de teselas todavía. El porcentaje sale
              de ese mismo par y sí es correcto una vez empieza la descarga
              de verdad; la cuenta cruda no, así que fuera. */}
        </div>
      </div>

      <div
        style={{
          marginTop: 20,
          fontSize: 11.5,
          color: 'rgba(var(--theme-line), .7)',
          fontWeight: 600,
          textAlign: 'center',
          maxWidth: 300,
          lineHeight: 1.5,
        }}
      >
        {primeiraVez
          ? 'Se guarda para poder jugar sin cobertura. La primera vez tarda unos minutos.'
          : known
            ? ''
            : detail || 'Preparando la misión…'}
      </div>

      <style>
        {`
          @keyframes sagaSplashPulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.045); }
          }
          @keyframes sagaSplashSlide {
            0% { transform: translateX(-110%); }
            100% { transform: translateX(320%); }
          }
          @keyframes sagaSplashSpin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          /* En cristal, los dos aros girando de siempre, con sus dos colores
             exactos: --theme-ring-a/-b valen ahi lo que valian escritos a
             mano. */
          .saga-splash-ring {
            position: absolute;
            top: 50%;
            left: 50%;
            border-radius: 50%;
            pointer-events: none;
          }
          .saga-splash-ring--slow {
            width: 178px;
            height: 178px;
            margin: -89px 0 0 -89px;
            border: 2px solid transparent;
            border-top-color: rgba(var(--theme-ring-a), .55);
            border-right-color: rgba(var(--theme-ring-a), .18);
            animation: sagaSplashSpin 3.2s linear infinite;
          }
          .saga-splash-ring--fast {
            width: 148px;
            height: 148px;
            margin: -74px 0 0 -74px;
            border: 2px solid transparent;
            border-bottom-color: rgba(var(--theme-ring-b), .6);
            border-left-color: rgba(var(--theme-ring-b), .16);
            animation: sagaSplashSpin 1.9s linear infinite reverse;
          }

          /* En fuego no gira nada, y ya no hay un marco compitiendo con el
           * icono.
           *
           * Dos lineas dando vueltas alrededor del logo quedaban feas: en un
           * tema de esquinas duras, un aro redondo girando es del otro
           * diseno -eso seguia siendo verdad-. Pero el arreglo anterior (un
           * marco de esquina cortada, ademas del icono) metia una TERCERA
           * geometria sobre una imagen que ya trae su propio anillo redondo
           * dibujado dentro: bastidor anguloso + panel cuadrado con esquinas
           * redondeadas + circulo del icono, las tres a la vez. Es lo que se
           * veia mal.
           *
           * Ahora solo hay dos: el icono, tal cual es, y un resplandor
           * (nada de bordes ni esquinas, un brillo de ascua difuminado
           * detras) que respira en vez de girar o competir en forma. */
          .saga-splash-halo {
            display: none;
            position: absolute;
            top: 50%;
            left: 50%;
            width: 210px;
            height: 210px;
            margin: -105px 0 0 -105px;
            border-radius: 50%;
            background: radial-gradient(circle, var(--theme-glow) 0%, transparent 68%);
            filter: blur(1px);
            animation: sagaSplashBrasa 2.6s ease-in-out infinite;
            pointer-events: none;
          }
          @keyframes sagaSplashBrasa {
            0%, 100% { opacity: .35; transform: scale(0.96); }
            50% { opacity: .8; transform: scale(1.04); }
          }
          body.theme-flame-red .saga-splash-ring { display: none; }
          body.theme-flame-red .saga-splash-halo { display: block; }
        `}
      </style>
    </div>
  )
}
