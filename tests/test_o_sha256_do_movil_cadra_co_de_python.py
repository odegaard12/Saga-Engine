# -*- coding: utf-8 -*-
"""O SHA-256 síncrono do móbil (utils/sha256.ts) dá o mesmo que hashlib.

«Mapa mudo» comproba a chegada hasheando celdas no móbil e comparando co que
calcula o servidor con hashlib: se difiren nun só bit, ninguén chega nunca.
Executa o TypeScript de verdade con Node (quita os tipos ao vólo) e compara
contra Python. Sen Node novo (>= 22.6), a proba salta: non é un fallo do código.
"""
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
SHA = RAIZ / "frontend" / "src" / "player" / "utils" / "sha256.ts"

CASOS = ["", "abc", "abc123:-4:7", "x" * 55, "x" * 56, "x" * 64, "x" * 119, "ñandú ✅ " * 20, "sal:0:0", "sal:-12:340"]


def _node_con_ts():
    node = shutil.which("node")
    if not node:
        return None
    try:
        saida = subprocess.run([node, "--version"], capture_output=True, text=True, timeout=20).stdout.strip()
        mayor, menor = (int(p) for p in saida.lstrip("v").split(".")[:2])
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return None
    return node if (mayor, menor) >= (22, 6) else None


def test_o_sha256_do_movil_cadra_con_hashlib(tmp_path):
    node = _node_con_ts()
    if node is None:
        pytest.skip("hai que ter Node >= 22.6 para executar o TypeScript")

    guion = tmp_path / "comprobar.mjs"
    guion.write_text(
        "import { sha256Hex } from %s\n"
        "const casos = %s\n"
        "console.log(JSON.stringify(casos.map((c) => sha256Hex(c))))\n"
        % (json.dumps(SHA.as_uri()), json.dumps(CASOS)),
        encoding="utf-8",
    )

    resultado = subprocess.run(
        [node, "--experimental-strip-types", "--no-warnings", str(guion)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=60,
    )
    assert resultado.returncode == 0, resultado.stderr

    do_movil = json.loads(resultado.stdout.strip().splitlines()[-1])
    esperado = [hashlib.sha256(c.encode("utf-8")).hexdigest() for c in CASOS]
    assert do_movil == esperado


def test_a_explicacion_cifrada_por_python_abrea_o_movil(tmp_path):
    """O que cifra o servidor e o que abre o móbil (wordTrap/explicacion.ts) son o mesmo."""
    node = _node_con_ts()
    if node is None:
        pytest.skip("hai que ter Node >= 22.6 para executar o TypeScript")

    from backend.app.runtime.minigames import encrypt_word_trap_explanation

    texto = "La buena es la C porque ñandú ✅ y más de 32 bytes para pasar de un bloque de hash"
    sal = "nodo-x:3:2"
    cifrada = encrypt_word_trap_explanation(texto, sal, 2)

    ficheiro = RAIZ / "frontend" / "src" / "player" / "minigames" / "families" / "wordTrap" / "explicacion.ts"
    guion = tmp_path / "abrir.mjs"
    guion.write_text(
        "import { abrirExplicacion, leerExplicacion } from %s\n"
        "const boa = await abrirExplicacion(%s, %s, 2)\n"
        "const mala = await abrirExplicacion(%s, %s, 1)\n"
        "const buscada = await leerExplicacion(%s, %s, 4)\n"
        "console.log(JSON.stringify({ boa, mala, buscada }))\n"
        % (
            json.dumps(ficheiro.as_uri()),
            json.dumps(cifrada), json.dumps(sal),
            json.dumps(cifrada), json.dumps(sal),
            json.dumps(cifrada), json.dumps(sal),
        ),
        encoding="utf-8",
    )
    resultado = subprocess.run(
        [node, "--experimental-strip-types", "--no-warnings", str(guion)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=60,
    )
    assert resultado.returncode == 0, resultado.stderr
    saida = json.loads(resultado.stdout.strip().splitlines()[-1])
    assert saida["boa"] == texto
    assert saida["mala"] is None
    assert saida["buscada"] == texto
