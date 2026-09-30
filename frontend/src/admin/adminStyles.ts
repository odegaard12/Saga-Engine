import { estilosAdminParte1 } from './adminStylesParte1'
import { estilosAdminParte2 } from './adminStylesParte2'

/**
 * Hoja de estilos del panel de administración, en dos ficheros de ~1 100 líneas
 * para que ninguno sea un muro de CSS. Se unen aquí en el mismo orden en que
 * estaban escritas, así que la cascada es idéntica a cuando era una sola.
 */
export const styles = estilosAdminParte1 + estilosAdminParte2
