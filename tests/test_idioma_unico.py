# -*- coding: utf-8 -*-
"""22/11/2026 («potenciar lenguaje», mejora 6): un solo sistema de idioma en la app del jugador.

Antes convivían el `useI18n`, varios catálogos `textos*.ts`, objetos es/gl sueltos y `legacySpanishBridge`: un
observador del DOM que reescribía en gallego el castellano ya pintado (36 KB en el arranque, congeló textos de React y
una vez se quedó dando vueltas a 60 Hz). Ahora todo texto del jugador sale de un catálogo tipado con es y gl, se elige
con el idioma de `i18n` (`useI18n` en React, `getLocale` fuera) y el puente ya no existe.

Estos tests fallan si:
- vuelve el puente (o cualquier traductor del DOM);
- a un catálogo le falta una clave en es o en gl, o un texto está vacío;
- reaparece texto de interfaz en castellano escrito a pelo en un componente del jugador (heurística con lista blanca).
"""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]
SRC = RAIZ / "frontend" / "src"
ZONAS = ("player", "login", "shared")


def leer(p: Path) -> str:
    return p.read_text(encoding="utf-8-sig")


def test_el_puente_de_idioma_ya_no_existe():
    assert not (SRC / "i18n" / "legacySpanishBridge.ts").exists()
    for p in SRC.rglob("*.ts*"):
        t = leer(p)
        assert "legacySpanishBridge" not in t and "setupLegacySpanishBridge" not in t, p
        # Nadie vuelve a traducir reescribiendo el DOM: los textos salen ya en su idioma.
        assert "nodeValue =" not in t and "characterData" not in t, p


def test_los_catalogos_tienen_las_mismas_claves_en_es_y_gl():
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "catalogos_idioma.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=120, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    d = json.loads(p.stdout)
    assert d["fallos"] == []
    assert d["catalogos"] >= 20 and d["hojas"] >= 900


# --- Heurística: castellano a pelo en los componentes del jugador -------------------------------------------------

def sin_comentarios(t: str) -> str:
    def blanco(m):
        return "\n" * m.group(0).count("\n")
    t = re.sub(r"\{\s*/\*(?:(?!\*/).)*\*/\s*\}", blanco, t, flags=re.S)
    t = re.sub(r"/\*.*?\*/", blanco, t, flags=re.S)
    return re.sub(r"(?m)^[ \t]*//.*$", "", t)


def sin_cadenas(t: str) -> str:
    """Vacía '…' y `…` (los catálogos, claves, CSS): sólo queda el JSX y los atributos entre comillas dobles."""
    t = re.sub(r"`(?:[^`\\]|\\.)*`", lambda m: "``" + "\n" * m.group(0).count("\n"), t, flags=re.S)
    return re.sub(r"'(?:[^'\\\n]|\\.)*'", "''", t)


PALABRA = r"[A-Za-zÁÉÍÓÚÜáéíóúüñÑ¿¡]{3,}"
# Texto entre etiquetas: `>Guardar<`, `>Hecho {x}`. El `>` de una flecha (`=>`) no cuenta.
TEXTO_JSX = re.compile(r"(?<![=\-])>([^<>{}=;&|()`'\"\[\]]*?" + PALABRA + r"[^<>{}=;&|()`'\"\[\]]*?)(?=<|\{)")
# Lo que casa con TEXTO_JSX y es TypeScript (`): Promise<…>`, `x?: Readonly<…>`), no texto.
ES_CODIGO = re.compile(r"\b(Promise|Record|Readonly|Parameters|function|return|export)\b|\?:|\w: \w|\w\?$|\w:$")
ATRIBUTO = re.compile(r"\b(aria-label|title|placeholder|alt|label|body)=\"([^\"]*" + PALABRA + r"[^\"]*)\"")
# Una cadena dentro de llaves, entre etiquetas o en un atributo: `>{ocupado ? 'Subiendo…' : 'Guardar'}<`.
EXPRESION = re.compile(r"(?:(?<![=\-])>\s*|\b(?:aria-label|title|placeholder|alt)=)\{([^{}]{0,240})\}")
CADENA = re.compile(r"'((?:[^'\\\n]|\\.)*)'")
# Avisos y errores que se enseñan tal cual.
LLAMADA = re.compile(r"\b(?:setError|setSubmitError|aviso|showNotice|setMensaje)\(\s*'([^'\n]*" + PALABRA + r"[^'\n]*)'")


def es_texto_de_interfaz(cadena: str) -> bool:
    """'Subiendo…' o 'Ver el mapa' sí; 'selector_apps', 'peek' o 'player.tools.title' (claves) no."""
    return bool(re.search(PALABRA, cadena)) and not re.fullmatch(r"[a-z0-9_:-]+|\w+(\.\w+)+", cadena)


# Lo que se puede quedar: la marca, unidades y los nombres de los idiomas (que no se traducen).
PERMITIDO = {"SAGA", "SAGA Engine", "Meteo", "Catoira", "min", "Español", "Galego", "SHA-256",
             # Un interruptor y una URL que se teclea tal cual.
             "🔦 ON", "🔦 OFF", "🔦 FLASH ON", "🔦 FLASH OFF", "chrome://flags/#unsafely-treat-insecure-origin-as-secure"}
# Pantallas que no ve el jugador: la de depuración (`?depurar`) y la insignia de versión.
FICHEROS_FUERA = {
    "player/components/DepuracionVista.tsx",
    "shared/BuildInfoBadge.tsx",
}


def hallazgos():
    salida = []
    for zona in ZONAS:
        for p in sorted((SRC / zona).rglob("*.ts*")):
            rel = p.relative_to(SRC).as_posix()
            if rel in FICHEROS_FUERA:
                continue
            crudo = sin_comentarios(leer(p))
            limpio = sin_cadenas(crudo)

            def anotar(fuente, m, que):
                salida.append(f"{rel}:{fuente[:m.start()].count(chr(10)) + 1}: {que}")

            for m in LLAMADA.finditer(crudo):
                anotar(crudo, m, m.group(1))
            if p.suffix != ".tsx":
                continue
            for m in TEXTO_JSX.finditer(limpio):
                texto = re.sub(r"\s+", " ", m.group(1)).strip(" ·,.:")
                if texto and texto not in PERMITIDO and not ES_CODIGO.search(m.group(1).strip()):
                    anotar(limpio, m, texto)
            for m in ATRIBUTO.finditer(limpio):
                if m.group(2) not in PERMITIDO:
                    anotar(limpio, m, f'{m.group(1)}="{m.group(2)}"')
            for m in EXPRESION.finditer(crudo):
                for c in CADENA.findall(m.group(1)):
                    if es_texto_de_interfaz(c) and c not in PERMITIDO:
                        anotar(crudo, m, c)
    return salida


def test_no_hay_castellano_a_pelo_en_los_componentes_del_jugador():
    encontrados = hallazgos()
    assert encontrados == [], "\n".join(encontrados)


if __name__ == "__main__":
    print("\n".join(hallazgos()))
