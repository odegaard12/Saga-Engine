/**
 * 5/11 (aprobado por Óscar): la cabecera pequeña de un juego («PULSO DE HIERRO») sobra cuando el título de debajo dice
 * lo mismo (el nodo se llama como el juego). Se compara sin mayúsculas, tildes ni signos.
 */
export function cabeceraRepetida(cabecera: string, titulo: string): boolean {
  const limpio = (t: string) =>
    String(t || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
  return Boolean(limpio(cabecera)) && limpio(cabecera) === limpio(titulo)
}
