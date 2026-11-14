# -*- coding: utf-8 -*-
"""14/11: `motor/gorros.ts` va empaquetado en diferencias de enteros y decodifica EXACTAMENTE a los números del banco.

La fuente de verdad sigue siendo sim/playwright-bench/harness/mixamo4/gorros.js (texto, ~340 KB). El generador
(frontend/scripts/portar-motor-mixamo.mjs) lo empaqueta sin pérdida: si un valor no cabe, se para. Aquí se carga cada
versión en Node y se compara elemento a elemento (posiciones, normales, uv, índices y grupos de las dos mallas).
"""
import shutil
import subprocess
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
BANCO = RAIZ / "sim" / "playwright-bench" / "harness" / "mixamo4" / "gorros.js"
APP = RAIZ / "frontend" / "src" / "player" / "avatares3d" / "mixamo" / "motor" / "gorros.ts"
GENERADOR = RAIZ / "frontend" / "scripts" / "portar-motor-mixamo.mjs"

COMPARADOR = """
import * as a from './banco.mjs'
import * as b from './app.mjs'
let n = 0
for (const k of ['GORRA', 'GORRO_LANA']) {
  for (const campo of ['pos', 'nrm', 'uv', 'idx', 'grupos']) {
    const x = a[k][campo], y = b[k][campo]
    if (x.length !== y.length) throw new Error(k + '.' + campo + ': longitud distinta')
    if (campo === 'grupos') { if (JSON.stringify(x) !== JSON.stringify(y)) throw new Error(k + '.grupos distinto'); continue }
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) throw new Error(k + '.' + campo + '[' + i + ']: ' + x[i] + ' !== ' + y[i])
    n += x.length
  }
}
console.log('IDENTICO ' + n)
"""


def test_gorros_empaquetados_decodifican_a_los_mismos_numeros_que_el_banco():
    with tempfile.TemporaryDirectory(prefix="saga-gorros-") as t:
        t = Path(t)
        shutil.copyfile(BANCO, t / "banco.mjs")
        shutil.copyfile(APP, t / "app.mjs")
        (t / "comparar.mjs").write_text(COMPARADOR, encoding="utf-8")
        p = subprocess.run(["node", "comparar.mjs"], cwd=t, capture_output=True, text=True, timeout=60)
    assert p.returncode == 0, p.stderr[-1500:]
    assert p.stdout.startswith("IDENTICO "), p.stdout


def test_el_fichero_generado_no_vuelve_a_ser_texto_y_el_generador_lo_sabe_empaquetar():
    import gzip

    assert APP.stat().st_size < 220_000, "gorros.ts volvió a los ~340 KB de números en texto"
    # Lo que importa es lo que VIAJA: el texto original era ~74 KB gz; en base64 de 16 bits salía peor (112 KB).
    assert len(gzip.compress(APP.read_bytes(), 9)) < 40_000, "el empaquetado ya no comprime bien por la red"
    texto = APP.read_text(encoding="utf-8")
    assert "const _d = (v, p, k)" in texto and "atob(" not in texto
    generador = GENERADOR.read_text(encoding="utf-8")
    assert "empaquetarGorros(leer('gorros.js'))" in generador
    assert "no cabe sin pérdida" in generador, "si un valor no cabe el guion se para en vez de redondear"
