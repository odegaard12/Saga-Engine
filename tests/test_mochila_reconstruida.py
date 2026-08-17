# -*- coding: utf-8 -*-
"""La mochila no se guarda: se reconstruye, y de dos sitios a la vez.

Sale de sumar los eventos —recogido, gastado— y de contrastarlos con la copia
que sube el móvil. Ninguna de las dos fuentes sobra:

- Los eventos cubren lo que se recoge en un nodo, que el servidor sí ve.
- La copia del móvil cubre lo que se forja en la mesa de trabajo, que ocurre
  entero en el teléfono y no genera ningún evento.

Y se toma el MAYOR de los dos, no la suma: sumarlos contaría dos veces un objeto
que aparece en ambos, y el jugador abriría un nodo que no debería poder abrir.
Esa cuenta estaba enterrada en medio de main.py y no la miraba nadie.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-mochila-"))

from backend.app.runtime import mochila  # noqa: E402


def evento(tipo, item, cantidad=1, accion=None):
    payload = {"inventory_item_id": item, "inventory_quantity": cantidad}
    if accion:
        payload["inventory_action"] = accion
    return {"type": tipo, "payload": payload}


def test_conta_o_que_se_recolle():
    eventos = [evento("inventory_item_collected", "sello", 1)]
    assert mochila.contar_objeto(eventos, {}, "Abeleira", "sello") == 1


def test_descontase_o_gastado():
    eventos = [
        evento("inventory_item_collected", "sello", 2),
        evento("inventory_item_used", "sello", 1),
    ]
    assert mochila.contar_objeto(eventos, {}, "Abeleira", "sello") == 1


def test_o_forxado_no_movil_conta_aunque_non_haxa_evento():
    """Forjar pasa entero en el teléfono: si no se mirase la copia, el nodo
    final rechazaría a quien acaba de fabricar la pieza."""
    copia = {"items": [{"item_id": "sello", "quantity": 1}]}
    assert mochila.contar_objeto([], copia, "Abeleira", "sello") == 1


def test_o_mesmo_obxecto_nas_duas_fontes_non_conta_dobre():
    """Es el mismo objeto: sumarlo abriría nodos que no tocan."""
    eventos = [evento("inventory_item_collected", "sello", 1)]
    copia = {"items": [{"item_id": "sello", "quantity": 1}]}

    assert mochila.contar_objeto(eventos, copia, "Abeleira", "sello") == 1


def test_o_gastado_descontase_tamen_do_que_ven_do_movil():
    eventos = [evento("inventory_item_used", "sello", 1)]
    copia = {"items": [{"item_id": "sello", "quantity": 1}]}

    assert mochila.contar_objeto(eventos, copia, "Abeleira", "sello") == 0


def test_o_marcado_como_usado_no_movil_non_conta():
    copia = {"items": [{"item_id": "sello", "quantity": 1, "state": "used"}]}
    assert mochila.contar_objeto([], copia, "Abeleira", "sello") == 0


def test_os_escaneos_contan_como_recollida():
    """Llegan como qr_scanned con inventory_action=collected dentro."""
    eventos = [evento("qr_scanned", "chip_encriptado", 1, accion="collected")]
    assert mochila.contar_objeto(eventos, {}, "Abeleira", "chip_encriptado") == 1


def test_nunca_devolve_negativo():
    eventos = [evento("inventory_item_used", "sello", 5)]
    assert mochila.contar_objeto(eventos, {}, "Abeleira", "sello") == 0


def test_un_nodo_sen_requisito_abrese_sempre():
    resultado = mochila.evaluar_requisito({"id": 1, "title": "Nodo"}, 0)

    assert resultado["required"] is False
    assert resultado["ok"] is True


def test_un_requisito_roto_bloquea_pero_non_revienta():
    """Un error aquí sería invisible: el móvil cae a su copia local y sigue."""
    nodo = {"id": 1, "title": "Nodo", "requirements": {"items": [{"item_id": "sello"}]}}

    resultado = mochila.evaluar_requisito(nodo, 0)

    assert resultado["required"] is True
    assert resultado["ok"] is False
    assert resultado["required_quantity"] >= 1
