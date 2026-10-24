/**
 * Cuántas fotos pide el álbum: el máximo que da el servidor (`list_field_proof_records`). Antes pedía 180 y decía
 * «180 fotos guardadas» aunque hubiera más: las más viejas no salían y no se podían borrar (revisión 24/10/2026).
 */
export const LIMITE_FOTOS = 400

/** Lo que dice el álbum de cuántas hay: si llegó el máximo, puede haber más y se dice. */
export function textoFotosGuardadas(vistas: number, limite: number = LIMITE_FOTOS): string {
  if (!vistas) return 'No hay fotos guardadas.'
  if (vistas >= limite) return `Se ven las ${limite} más recientes; puede haber más guardadas.`
  return `${vistas} ${vistas === 1 ? 'foto guardada' : 'fotos guardadas'}.`
}
