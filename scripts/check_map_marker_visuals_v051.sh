#!/usr/bin/env bash
set -Eeuo pipefail

MAP="frontend/src/player/components/MapSurface.tsx"
PWA="frontend/src/player/offline/pwaShell.ts"
SW="frontend/public/sw.js"
CACHE="saga-player-shell-v514-node-visuals"

require() {
  local token="$1"
  local label="$2"

  if ! grep -Fq "$token" "$MAP"; then
    echo "FAIL: $label"
    exit 1
  fi
}

require "#22c55e" "completado verde"
require "#15803d" "borde completado verde"
require "#f4c95d" "actual amarillo"
require "#d6a900" "borde actual dorado"
require "#dc4c4c" "bloqueado rojo"
require "#b91c1c" "borde bloqueado rojo"

require "icon: '\u2605'" "estrella QR"
require "icon: '\u{1F512}\uFE0E'" "candado QR"
require "label: 'Pista QR'" "pista QR"
require "icon: '\u{1F381}\uFE0E'" "regalo QR"

require "saga-mission-node-halo" "halo exterior"
require "@keyframes sagaCurrentNodeHalo" "animación del halo"
require "animation: none !important" "avatar estático"
require "playerMarkerIconKeyRef.current !==" "avatar no reconstruido en cada GPS"
require "? '#c2410c' : '#0891b2'" "jugador cian independiente"

for forbidden in \
  sagaPlayerPinBreathe \
  sagaNodeBreathe \
  sagaNodeHaloLocked \
  sagaNodeHaloReady \
  sagaNodeHaloEngaging
do
  if grep -Fq "$forbidden" "$MAP"; then
    echo "FAIL: permanece animación antigua $forbidden"
    exit 1
  fi
done

PWA_CACHE="$(
  sed -n \
    "s/^const PLAYER_SHELL_CACHE = '\([^']*\)'/\1/p" \
    "$PWA"
)"

SW_CACHE="$(
  sed -n \
    "s/^const CACHE_NAME = '\([^']*\)'/\1/p" \
    "$SW"
)"

[ "$PWA_CACHE" = "$CACHE" ] ||
  {
    echo "FAIL: caché incorrecta en pwaShell.ts"
    exit 1
  }

[ "$SW_CACHE" = "$CACHE" ] ||
  {
    echo "FAIL: caché incorrecta en sw.js"
    exit 1
  }

VERSION="$(
  node -p \
    "require('./frontend/package.json').version"
)"

[ "$VERSION" = "0.5.1-dev" ] ||
  {
    echo "FAIL: versión frontend $VERSION"
    exit 1
  }

echo "OK marker guard v0.5.1-dev"
echo "  completado verde"
echo "  actual amarillo/dorado"
echo "  futuro/bloqueado rojo"
echo "  QR estrella/candado/pista/regalo"
echo "  avatar estable"
echo "  nodo actual animado solo en halo"
echo "  caché PWA coordinada: $CACHE"
