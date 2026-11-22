# -*- coding: utf-8 -*-
"""22/11: los juegos planos, pulidos en la piel de siempre (sin tema nuevo). Lo que no debe volver atrás."""
from pathlib import Path

FAM = Path(__file__).resolve().parent.parent / "frontend" / "src" / "player" / "minigames" / "families"
CORE = FAM.parent / "core"


def leer(rel: str) -> str:
    return (FAM / rel).read_text(encoding="utf-8")


def test_balanza_de_dos_platos_con_las_bolas_dentro_del_cuenco():
    s = leer("logica/BalanzaRuntimeScreen.tsx")
    css = leer("logica/logica.css")
    # Astil, cuerdas y cuenco dibujados; las bolas puestas siguen siendo `data-plato-ficha` (el vuelo las busca así).
    assert 'className="lg-cuerdas"' in s and 'className="lg-cuenco"' in s
    assert "data-plato-ficha={b}" in s
    # El plato cuelga del gancho y sube o baja lo mismo que él (86 · sen 8° = 12 de 300 unidades = 3,99cqw).
    assert "transform: translateY(calc(var(--inclina) * -3.99cqw));" in css
    assert "transform: translateY(calc(var(--inclina) * 3.99cqw));" in css
    assert "flex-wrap: wrap-reverse;" in css  # se apilan desde el fondo del cuenco


def test_balanza_sin_pesadas_senalar_es_la_accion_principal():
    s = leer("logica/BalanzaRuntimeScreen.tsx")
    assert "className={!eligiendo && !quedan ? 'lg-boton primary' : 'lg-boton'}" in s
    assert "{!eligiendo && quedan > 0 ? (" in s  # «Pesar» desaparece en vez de quedarse apagado


def test_balanza_pesadas_en_puntos_y_hueco_en_la_bandeja():
    s = leer("logica/BalanzaRuntimeScreen.tsx")
    css = leer("logica/logica.css")
    assert "<i key={i} data-usada={i >= quedan || undefined} />" in s
    assert "data-n={b + 1}" in s and "content: attr(data-n);" in css
    assert ".lg-bolas[data-eligiendo] {" in css


def test_fichas_claras_en_dia():
    css = leer("logica/logica.css")
    # Mezcladas con --mg-pastel (claro en Día), no con el texto oscuro: la tinta oscura se lee en los dos temas.
    for lado in ("#22d3ee", "#f472b6", "#a78bfa"):
        assert f"color-mix(in srgb, {lado} 55%, var(--mg-pastel))" in css
    # Interrogatorio: inicial en tinta oscura y nombre en el texto del tema (el pastel sobre crema no se leía).
    assert "color: var(--lg-tinta);" in css.split(".lg-cara {")[1].split("}")[0]
    assert "color: var(--mg-text-2);" in css.split(".lg-quien .lg-nombre {")[1].split("}")[0]


def test_sin_emojis_en_la_interfaz_de_los_juegos_pulidos():
    textos = (CORE / "textos.ts").read_text(encoding="utf-8")
    assert "'✅ Responder'" not in textos and "'🧠 Trampa de palabras'" not in textos
    assert "titulo: 'Cuenta las señales'," in textos and "titulo: 'Conta as sinais'," in textos
    trampa = leer("wordTrap/RuntimeScreen.tsx")
    assert "`✅ ${" not in trampa and "`❌ ${" not in trampa and "`⏱️ ${" not in trampa


def test_cabeceras_como_las_demas():
    assert "<h2>{tx.titulo}</h2>" in leer("signalHunt/CuentaSenalesRuntimeScreen.tsx")
    assert "<h2>{tx.titulo}</h2>" in leer("wordTrap/RuntimeScreen.tsx")
    assert "<h2 style={{ margin: 0 }}>{t.titulo}</h2>" in leer("audioChallenge/AudioChallengeRuntime.tsx")
    assert "<h2 style={title}>{t.titulo}</h2>" in leer("teamRelay/RuntimeScreen.tsx")


def test_mosaico_sin_hueco_vacio_y_texto_legible():
    s = leer("placeMosaic/RuntimeScreen.tsx")
    assert ".mosaic-message:empty {\n  display: none;\n}" in s.replace("\r\n", "\n")
    assert "font-size: 11px;" not in s.split(".mosaic-help {")[1].split("}")[0]
