# -*- coding: utf-8 -*-
"""El pase de jugador no puede caducar a mitad de la gimcana.

Duraba doce horas. Se prepara un día y se juega al siguiente, así que caducaba
entre medias: el servidor rechazaba el avance con un 403, el nodo no se
guardaba, el tiempo no se anotaba, y el móvil lo daba por bueno igual porque el
rechazo caía en el mismo sitio que estar sin cobertura. El jugador veía "nodo
superado" y el marcador en 00:00.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-sesion-"))

import main  # noqa: E402


def test_o_pase_dura_toda_a_saga():
    # Una gimcana que se monta un día y se juega al siguiente necesita más de un
    # día de margen.
    assert main.PLAYER_SESSION_TTL_SECONDS >= 48 * 3600


def test_un_pase_recen_dado_vale():
    from backend.app.security import player_session

    segredo = "sal:hash-de-proba"
    token = player_session.create_player_session_token(
        "Abeleira", ttl_seconds=main.PLAYER_SESSION_TTL_SECONDS, secret=segredo
    )

    assert player_session.verify_player_session_token(token, user="Abeleira", secret=segredo)


def test_un_pase_caducado_non_vale():
    from backend.app.security import player_session

    segredo = "sal:hash-de-proba"
    token = player_session.create_player_session_token("Abeleira", ttl_seconds=-1, secret=segredo)

    assert not player_session.verify_player_session_token(token, user="Abeleira", secret=segredo)
