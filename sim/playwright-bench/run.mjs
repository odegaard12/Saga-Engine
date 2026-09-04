#!/usr/bin/env node
// CLI: node run.mjs <escenario>
//
// Escenarios disponibles:
//   team-relay-cobertura     — ¿ve un jugador al otro si se corta la cobertura
//                               justo al llegar al punto de encuentro?
//   offline-descargado-antes — misión descargada CON cobertura, luego cero
//                               cobertura de verdad: ¿recarga el shell desde
//                               caché? ¿se completa un nodo sin red? ¿sincroniza
//                               solo al volver la señal?

const nombre = process.argv[2] || 'team-relay-cobertura'

const escenarios = {
  'team-relay-cobertura': () => import('./scenarios/team-relay-cobertura.mjs'),
  'solo-screenshot': () => import('./scenarios/solo-screenshot.mjs'),
  'diagnose-tiles': () => import('./scenarios/diagnose-tiles.mjs'),
  'offline-descargado-antes': () => import('./scenarios/offline-descargado-antes.mjs'),
}

const cargar = escenarios[nombre]
if (!cargar) {
  console.error(`Escenario desconocido: "${nombre}". Disponibles: ${Object.keys(escenarios).join(', ')}`)
  process.exit(1)
}

const { run } = await cargar()

try {
  const resultado = await run()
  console.log('\n=== RESULTADO ===')
  console.log(JSON.stringify(resultado, null, 2))
} catch (error) {
  console.error('\n=== FALLÓ ===')
  console.error(error)
  process.exit(1)
}
