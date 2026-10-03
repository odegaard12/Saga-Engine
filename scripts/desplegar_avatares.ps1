<#
Copia los activos de los avatares 3D (modelos, animaciones, agarres y retratos) a las Pis.

Los ficheros de Mixamo NO están en git (su licencia no permite redistribuirlos): viven en
`assets_privados/avatares/` de este equipo, y el contenedor los lee de una carpeta montada.

Uso (desde la raíz del repo, en PowerShell; las IPs de las Pis las pones tú, no van en el repo):

    .\scripts\desplegar_avatares.ps1 -Hosts 192.168.x.104,192.168.x.103
    # o con una variable de entorno:  $env:SAGA_PIS = "192.168.x.104,192.168.x.103"

Qué hace:
  1. Comprueba que están TODOS los ficheros que lista `manifiesto.json` (los nombres que espera la app).
  2. En cada Pi crea la carpeta de destino y copia (scp) lo que falte o haya cambiado de nombre.
     Los nombres llevan la huella del contenido: un fichero con el mismo nombre es el mismo fichero.
  3. Deja la carpeta legible por el usuario del contenedor (chmod a+rX) y borra los ficheros viejos
     que ya no están en el manifiesto (con -Limpiar).

El contenedor tiene que montarla (una vez, en el `docker run` de cada Pi):

    -v /home/odegaard12/saga_avatares:/app/avatares:ro

Sin esa línea el servidor responde 404 a /assets/avatares/* y la app sigue sin avatares 3D (con el
retrato redondo de cada jugador), sin romperse.
#>
param(
    [string[]]$Hosts = @(),
    [string]$Usuario = "odegaard12",
    [string]$Destino = "/home/odegaard12/saga_avatares",
    [string]$Origen = "",
    [switch]$Limpiar
)

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
if (-not $Origen) { $Origen = Join-Path $raiz "assets_privados\avatares" }
if ($Hosts.Count -eq 0 -and $env:SAGA_PIS) { $Hosts = $env:SAGA_PIS -split "[,; ]+" | Where-Object { $_ } }
if ($Hosts.Count -eq 0) { throw "Indica las Pis: -Hosts ip1,ip2 (o la variable SAGA_PIS)." }

# --- 1. Que esté todo lo que pide la app ---
$manifiestoRuta = Join-Path $raiz "frontend\src\player\avatares3d\mixamo\manifiesto.json"
$m = Get-Content $manifiestoRuta -Raw -Encoding UTF8 | ConvertFrom-Json
$esperados = @($m.anims)
foreach ($grupo in @($m.personajes, $m.agarres, $m.caras)) {
    foreach ($p in $grupo.PSObject.Properties) { $esperados += $p.Value }
}
$faltan = $esperados | Where-Object { -not (Test-Path (Join-Path $Origen $_)) }
if ($faltan) { throw "Faltan en ${Origen}: $($faltan -join ', ')  (prepáralos con: node frontend/scripts/preparar-avatares.mjs)" }
Write-Host "Manifiesto OK: $($esperados.Count) ficheros en $Origen"

# --- 2. Copiar a cada Pi ---
foreach ($h in $Hosts) {
    Write-Host "== $Usuario@$h -> $Destino"
    ssh "$Usuario@$h" "mkdir -p '$Destino'"
    if ($LASTEXITCODE -ne 0) { throw "ssh a $h falló" }
    $ya = (ssh "$Usuario@$h" "ls '$Destino'") -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ }
    $nuevos = $esperados | Where-Object { $ya -notcontains $_ }
    foreach ($f in $nuevos) {
        scp (Join-Path $Origen $f) "${Usuario}@${h}:${Destino}/$f"
        if ($LASTEXITCODE -ne 0) { throw "scp de $f a $h falló" }
    }
    if ($Limpiar) {
        $sobran = $ya | Where-Object { $esperados -notcontains $_ }
        foreach ($f in $sobran) { ssh "$Usuario@$h" "rm -f '$Destino/$f'" }
        if ($sobran) { Write-Host "  borrados $($sobran.Count) ficheros viejos" }
    }
    ssh "$Usuario@$h" "chmod -R a+rX '$Destino'"
    Write-Host "  copiados $(@($nuevos).Count) ficheros nuevos; $(@($esperados).Count) en total"
}
Write-Host "Listo. Recuerda el volumen en el docker run:  -v ${Destino}:/app/avatares:ro"
