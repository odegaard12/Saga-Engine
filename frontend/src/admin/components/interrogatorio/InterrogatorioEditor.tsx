/**
 * Casos propios del Interrogatorio (30/10).
 *
 * Por defecto el móvil genera los casos a partir de una semilla por jugador (cada uno tiene los suyos y no hay nada
 * que pasarse). Aquí el organizador puede escribir los suyos: pregunta, regla, qué dice cada sospechoso y quién es el
 * culpable. Entonces todos los jugadores ven los mismos casos, en orden. minigames.py (`_normalize_casos_propios`)
 * descarta los que estén a medio escribir.
 */
type Sospechoso = { nombre: string; frase: string }
type Caso = { pregunta: string; regla: string; sospechosos: Sospechoso[]; culpable: number }

type Props = {
  config: Record<string, unknown>
  onChange: (values: Record<string, unknown>) => void
}

const MAX_CASOS = 8
const MIN_SOSPECHOSOS = 2
const MAX_SOSPECHOSOS = 6

/** Inventado: oficios, no nombres de nadie. Sólo uno dice la verdad → el farero (sólo el panadero acierta). */
const EJEMPLO: Caso = {
  pregunta: '¿Quién se comió la empanada de la merienda?',
  regla: 'Sólo uno dice la verdad.',
  sospechosos: [
    { nombre: 'Panadero', frase: 'Fue el farero.' },
    { nombre: 'Farero', frase: 'Yo no fui.' },
    { nombre: 'Cartera', frase: 'El panadero miente.' },
  ],
  culpable: 1,
}

const CASO_VACIO: Caso = {
  pregunta: '',
  regla: 'Sólo uno dice la verdad.',
  sospechosos: [
    { nombre: '', frase: '' },
    { nombre: '', frase: '' },
    { nombre: '', frase: '' },
  ],
  culpable: 0,
}

const CSS = `
.itg,.itg *{box-sizing:border-box}
.itg{display:grid;gap:14px;padding:17px;border:1px solid rgba(15,23,42,.1);border-radius:20px;background:radial-gradient(circle at 100% 0,rgba(56,189,248,.14),transparent 32%),#f8fafc;color:#172033}
.itg h4{margin:0;font-size:20px;letter-spacing:-.03em}
.itg p{margin:4px 0 0;color:#64748b;font-size:13px;line-height:1.45;max-width:68ch}
.itg-aviso{padding:10px;border:1px solid #fde68a;border-radius:13px;background:#fffbeb;color:#92400e;font-size:12px;font-weight:700;line-height:1.45}
.itg-caso{display:grid;gap:10px;padding:14px;border:1px solid #dbe2ea;border-radius:14px;background:#fff}
.itg-caso label{display:grid;gap:5px;color:#334155;font-size:12px;font-weight:850}
.itg input{width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:11px;background:#fff;color:#172033;font:inherit}
.itg-arriba{display:flex;justify-content:space-between;align-items:center;gap:8px}
.itg-arriba b{color:#0369a1;font-size:13px}
.itg-sosp{display:grid;grid-template-columns:1fr 2fr auto auto;gap:8px;align-items:center}
.itg-culpable{display:flex!important;align-items:center;gap:5px;white-space:nowrap}
.itg-culpable input{width:auto}
.itg-quitar{min-height:36px;padding:0 10px;border:1px solid #fecaca;border-radius:11px;background:#fef2f2;color:#b91c1c;font-weight:800;cursor:pointer}
.itg-mas{justify-self:start;padding:8px 13px;border:1px dashed #7dd3fc;border-radius:11px;background:#f0f9ff;color:#0369a1;font-weight:800;cursor:pointer}
.itg-quitar:disabled,.itg-mas:disabled{opacity:.4;cursor:not-allowed}
.itg-botones{display:flex;flex-wrap:wrap;gap:8px}
@media (max-width:560px){.itg-sosp{grid-template-columns:1fr 1fr}}
`

function leerCasos(config: Record<string, unknown>): Caso[] {
  const lista = Array.isArray(config.casos_propios) ? config.casos_propios : []
  return lista
    .filter(
      (c): c is Caso => !!c && typeof c === 'object' && Array.isArray((c as Caso).sospechosos)
    )
    .map((c) => ({
      pregunta: String(c.pregunta ?? ''),
      regla: String(c.regla ?? ''),
      sospechosos: c.sospechosos.map((s) => ({
        nombre: String(s?.nombre ?? ''),
        frase: String(s?.frase ?? ''),
      })),
      culpable: Number(c.culpable) || 0,
    }))
}

export function InterrogatorioEditor({ config, onChange }: Props) {
  const casos = leerCasos(config)
  const guardar = (next: Caso[]) => onChange({ casos_propios: next })
  const cambiarCaso = (i: number, patch: Partial<Caso>) =>
    guardar(casos.map((c, k) => (k === i ? { ...c, ...patch } : c)))
  const cambiarSosp = (i: number, j: number, patch: Partial<Sospechoso>) =>
    cambiarCaso(i, {
      sospechosos: casos[i].sospechosos.map((s, k) => (k === j ? { ...s, ...patch } : s)),
    })

  return (
    <div className="itg">
      <style>{CSS}</style>
      <div>
        <h4>🕵️ Casos propios (opcional)</h4>
        <p>
          Si no escribes ninguno, cada jugador recibe casos generados distintos, con la dificultad
          del nivel. Si escribes los tuyos, se juegan éstos en orden y el número de casos es el de
          la lista. Un fallo suma la penalización y repite el mismo caso.
        </p>
      </div>
      {casos.length ? (
        <div className="itg-aviso">
          Con casos propios todos los jugadores ven los mismos: se pueden pasar la respuesta.
          Comprueba que sólo un sospechoso encaja con la regla.
        </div>
      ) : null}
      {casos.map((caso, i) => (
        <div className="itg-caso" key={i}>
          <div className="itg-arriba">
            <b>Caso {i + 1}</b>
            <button
              type="button"
              className="itg-quitar"
              onClick={() => guardar(casos.filter((_, k) => k !== i))}
            >
              Quitar caso
            </button>
          </div>
          <label>
            <span>Pregunta</span>
            <input
              value={caso.pregunta}
              maxLength={120}
              placeholder="p.ej. ¿Quién tiene la llave?"
              onChange={(e) => cambiarCaso(i, { pregunta: e.target.value })}
            />
          </label>
          <label>
            <span>Regla (se enseña arriba)</span>
            <input
              value={caso.regla}
              maxLength={120}
              placeholder="p.ej. Sólo uno dice la verdad."
              onChange={(e) => cambiarCaso(i, { regla: e.target.value })}
            />
          </label>
          {caso.sospechosos.map((s, j) => (
            <div className="itg-sosp" key={j}>
              <input
                value={s.nombre}
                maxLength={24}
                placeholder={`Sospechoso ${j + 1}`}
                aria-label={`Nombre del sospechoso ${j + 1}`}
                onChange={(e) => cambiarSosp(i, j, { nombre: e.target.value })}
              />
              <input
                value={s.frase}
                maxLength={160}
                placeholder="Lo que dice"
                aria-label={`Lo que dice el sospechoso ${j + 1}`}
                onChange={(e) => cambiarSosp(i, j, { frase: e.target.value })}
              />
              <label className="itg-culpable">
                <input
                  type="radio"
                  name={`itg-culpable-${i}`}
                  checked={caso.culpable === j}
                  onChange={() => cambiarCaso(i, { culpable: j })}
                />
                Culpable
              </label>
              <button
                type="button"
                className="itg-quitar"
                disabled={caso.sospechosos.length <= MIN_SOSPECHOSOS}
                aria-label={`Quitar sospechoso ${j + 1}`}
                onClick={() =>
                  cambiarCaso(i, {
                    sospechosos: caso.sospechosos.filter((_, k) => k !== j),
                    culpable:
                      caso.culpable === j
                        ? 0
                        : caso.culpable > j
                          ? caso.culpable - 1
                          : caso.culpable,
                  })
                }
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="itg-mas"
            disabled={caso.sospechosos.length >= MAX_SOSPECHOSOS}
            onClick={() =>
              cambiarCaso(i, { sospechosos: [...caso.sospechosos, { nombre: '', frase: '' }] })
            }
          >
            + Sospechoso
          </button>
        </div>
      ))}
      <div className="itg-botones">
        <button
          type="button"
          className="itg-mas"
          disabled={casos.length >= MAX_CASOS}
          onClick={() => guardar([...casos, structuredClone(CASO_VACIO)])}
        >
          + Caso
        </button>
        <button
          type="button"
          className="itg-mas"
          disabled={casos.length >= MAX_CASOS}
          onClick={() => guardar([...casos, structuredClone(EJEMPLO)])}
        >
          + Ejemplo inventado
        </button>
        {casos.length ? (
          <button type="button" className="itg-quitar" onClick={() => guardar([])}>
            Volver a casos generados
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default InterrogatorioEditor
