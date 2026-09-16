# -*- coding: utf-8 -*-
"""El puntuador de fiabilidad: rasgos, umbrales y que no finja opinion sin modelo."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import fiabilidad as F  # noqa: E402


def test_los_rasgos_incluyen_confianza_nuevo_y_foto():
    fs = F.rasgos({"part": "Paragolpes trasero", "severity": "leve",
                   "confidence": 0.92, "is_new": True, "photo_index": 3}, 5, 4)
    assert "sev=leve" in fs and "n=5+" in fs and "pos=3+" in fs
    assert "conf=hi" in fs and "conf*sev=hi|leve" in fs
    assert "new=True" in fs and "foto=3" in fs


def test_confianza_rara_no_revienta():
    for c in (None, "", "alta", [], 0.5):
        F.rasgos({"confidence": c}, 1, 0)
    assert F._confianza({"confidence": "0.8"}) == "mid"
    assert F._confianza({"confidence": 0.3}) == "lo"
    assert F._confianza({}) == "?"


def test_sin_modelo_no_hay_opinion():
    """None, no 0,5: fingir una puntuacion del monton haria parecer que el
    sistema ha decidido algo."""
    assert F.puntuar(None, {"severity": "leve"}, 1, 0) is None
    assert F.veredicto(None) is None


def test_los_umbrales_reparten_en_tres():
    assert F.veredicto(F.UMBRAL_CONFIRMA) == "confirmado"
    assert F.veredicto(F.UMBRAL_DESCARTE - 0.01) == "descartado"
    assert F.veredicto(0.5) == "dudoso"
    assert F.incertidumbre(0.5) == 1.0 and F.incertidumbre(1.0) == 0.0


def test_un_modelo_con_columnas_viejas_sigue_puntuando():
    """Tras añadir rasgos, el modelo guardado aun no los conoce: se ignoran
    hasta el siguiente entrenamiento, sin romper nada."""
    modelo = ([0.5, -1.0, 0.0], {"sev=leve": 0, "n=1-2": 1}, {})
    p = F.puntuar(modelo, {"severity": "leve", "confidence": 0.9, "is_new": True}, 1, 0)
    assert 0.0 < p < 1.0
