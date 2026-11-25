/**
 * 25/11: lo que hace cada interruptor al encenderlo, con las mismas palabras en el panel de campo («Más») y en el
 * editor completo (Ajustes). Comprobado contra el servidor: ver backend/app/runtime/proximidad.py y lib/pocosDatos.ts.
 */
export const TEXTO_POCOS_DATOS =
  'Para cuando tengas poca cobertura: quita el satélite y las fotos y el panel se actualiza cada 45 s en vez de 15 s. No cambia nada a los jugadores.'

export const TEXTO_EXIGIR_CERCA =
  'Encendido: nadie pasa un nodo de GPS si no está en él; si salta o falsea el GPS te sale un aviso; el rescate sin GPS de Herramientas sigue funcionando y queda marcado. Apagado: se puede pasar desde lejos, pero te sale un aviso.'

export const encendidoApagado = (activo: boolean) => (activo ? 'Encendido' : 'Apagado')
