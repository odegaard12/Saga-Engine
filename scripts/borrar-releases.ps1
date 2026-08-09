# Borra TODAS las releases del repositorio, incluidas las que están en borrador.
#
#   $env:GITHUB_TOKEN = "ghp_tu_token"
#   powershell -File scripts/borrar-releases.ps1
#
# Hace falta un token porque las releases en BORRADOR sólo las ve quien tiene
# permiso: desde fuera, sin identificarse, la API dice que hay cero aunque en la
# web se vean cientos. Por eso este script no puede correr sin él.
#
# El token se lee de la variable de entorno y no se escribe en ningún sitio.
# Créalo en https://github.com/settings/tokens con permiso 'repo' y bórralo
# cuando termines.
#
# Primero enseña cuántas hay y qué va a hacer. Sólo borra con -Confirmar.

param(
    [string]$Repo = "odegaard12/Saga-Engine",
    [switch]$Confirmar
)

$token = $env:GITHUB_TOKEN
if (-not $token) {
    Write-Host "Falta el token. Ponlo así y vuelve a ejecutar:" -ForegroundColor Yellow
    Write-Host '  $env:GITHUB_TOKEN = "ghp_..."'
    exit 1
}

$cabeceras = @{
    Authorization          = "Bearer $token"
    Accept                 = "application/vnd.github+json"
    "User-Agent"           = "saga-limpieza"
    "X-GitHub-Api-Version" = "2022-11-28"
}

# Se piden todas las páginas: con cientos de releases una sola no llega.
$todas = @()
$pagina = 1
while ($true) {
    $lote = Invoke-RestMethod -Headers $cabeceras `
        -Uri "https://api.github.com/repos/$Repo/releases?per_page=100&page=$pagina"
    if (-not $lote -or $lote.Count -eq 0) { break }
    $todas += $lote
    $pagina += 1
    if ($pagina -gt 50) { break }   # tope de seguridad
}

$borradores = @($todas | Where-Object { $_.draft }).Count
Write-Host ""
Write-Host "Releases en $Repo : $($todas.Count)  (en borrador: $borradores)"

if ($todas.Count -eq 0) {
    Write-Host "No hay nada que borrar." -ForegroundColor Green
    exit 0
}

if (-not $Confirmar) {
    Write-Host ""
    Write-Host "Esto NO ha borrado nada. Para borrarlas de verdad:" -ForegroundColor Yellow
    Write-Host "  powershell -File scripts/borrar-releases.ps1 -Confirmar"
    exit 0
}

$hechas = 0
foreach ($r in $todas) {
    try {
        Invoke-RestMethod -Headers $cabeceras -Method Delete `
            -Uri "https://api.github.com/repos/$Repo/releases/$($r.id)" | Out-Null
        $hechas += 1
        if ($hechas % 25 -eq 0) { Write-Host "  $hechas de $($todas.Count)..." }
    } catch {
        Write-Host "  no se pudo borrar $($r.tag_name): $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Borradas $hechas de $($todas.Count)." -ForegroundColor Green
Write-Host "Borrar la release no borra su tag; los tags ya se quitaron aparte."
