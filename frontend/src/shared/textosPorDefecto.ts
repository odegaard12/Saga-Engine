// Textos por defecto de la misión: la MISMA fuente que lee el servidor (shared/textos_por_defecto.json).
import json from '../../../shared/textos_por_defecto.json'

export const TEXTOS_POR_DEFECTO = json as {
  site_name: string
  admin_title: string
  admin_subtitle: string
  login_subtitle: string
}
