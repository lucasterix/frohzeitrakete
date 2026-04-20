"""EDIFACT INVOIC builder for Pflegehilfsmittel-Abrechnungen (TA3).

Adapted from pflegekreuzer/app/edifact.py for care-app models.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, List, Optional

from app.models.kostentraeger import Kostentraeger
from app.models.pflegehm_abrechnung import PflegehmAbrechnung
from app.models.pflegehm_position import PflegehmPosition

# ---------------------------------------------------------------------------
# TA3 constants (from pflegekreuzer/app/keys.py)
# ---------------------------------------------------------------------------

RECHNUNGSART = "1"
ART_LEISTUNG = "06"
VERGUETUNGSART = "05"
QUAL_VERG = "0"
VERARBEITUNGSKENNZEICHEN = "01"
ABRECHNUNGSCODE_DEFAULT = "19"
TARIFKENNZEICHEN_DEFAULT = "00000"
CURRENCY = "EUR"


def _leistungserbringergruppe(
    abrechnungscode: str | None,
    tarifkennzeichen: str | None,
) -> str:
    code = (abrechnungscode or ABRECHNUNGSCODE_DEFAULT).zfill(2)
    tarif = (tarifkennzeichen or TARIFKENNZEICHEN_DEFAULT).zfill(5)
    return f"{code}{tarif}"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _seg(tag: str, *parts: str) -> str:
    return "+".join([tag, *parts]) + "'"


def _money(val: float | Decimal) -> str:
    return f"{float(val):.2f}".replace(".", ",")


# ---------------------------------------------------------------------------
# Public
# ---------------------------------------------------------------------------

def build_edifact(
    abrechnung: PflegehmAbrechnung,
    cfg: dict[str, Any] | None = None,
) -> bytes:
    """Build INVOIC EDIFACT bytes for the given Abrechnung.

    ``cfg`` is a dict with optional keys: ik, abrechnungscode, tarifkennzeichen.
    """
    cfg = cfg or {}

    kasse: Optional[Kostentraeger] = abrechnung.kasse
    positionen: list[PflegehmPosition] = list(abrechnung.positionen)

    now = datetime.now()
    nachrichten_ref = f"PFL{abrechnung.id}"
    rechnungsnummer = f"R{abrechnung.id:06d}"

    # Rechnungsmonat
    if abrechnung.abrechnungsmonat and "-" in abrechnung.abrechnungsmonat:
        jahr, monat = abrechnung.abrechnungsmonat.split("-", 1)
        datum_rechnung = f"{jahr}{monat}01"
    else:
        datum_rechnung = now.strftime("%Y%m%d")

    sender_ik = cfg.get("ik", "000000000")
    abrechnungscode = cfg.get("abrechnungscode")
    tarifkennzeichen = cfg.get("tarifkennzeichen")
    empfaenger_ik = kasse.ik if (kasse and kasse.ik) else "999999999"

    if not abrechnungscode or not tarifkennzeichen:
        raise ValueError(
            f"EDIFACT kann nicht erzeugt werden - TA3 nicht vollstaendig. "
            f"Abrechnungscode: {abrechnungscode}, Tarifkennzeichen: {tarifkennzeichen}. "
            "Bitte in /config korrekt hinterlegen."
        )

    leistungserbringergruppe = _leistungserbringergruppe(abrechnungscode, tarifkennzeichen)

    segmente: List[str] = []
    segmente.append("UNA:+.? '")
    segmente.append(_seg(
        "UNB", "UNOA:1", sender_ik, empfaenger_ik,
        now.strftime("%y%m%d") + ":" + now.strftime("%H%M"),
        nachrichten_ref,
    ))
    segmente.append(_seg("UNH", nachrichten_ref, "INVOIC:D:96A:UN"))
    segmente.append(_seg("BGM", "380", rechnungsnummer, "9"))
    segmente.append(_seg("DTM", f"137:{datum_rechnung}:102"))

    segmente.append(_seg("NAD", "SU", f"{sender_ik}::9"))
    segmente.append(_seg("NAD", "DP", f"{empfaenger_ik}::9"))
    segmente.append(_seg("NAD", "PE", (abrechnung.patient_name or "").replace("+", " ")))
    segmente.append(_seg("CUX", f"2:{CURRENCY}"))

    segmente.append(_seg(
        "FTX", "ZZZ", "", "",
        f"RART:{RECHNUNGSART}:"
        f"LGRP:{leistungserbringergruppe}:"
        f"VKENN:{VERARBEITUNGSKENNZEICHEN}",
    ))

    laufende_pos = 1
    gesamt = Decimal("0.00")

    for pos in positionen:
        hm = pos.hilfsmittel
        posnr = (hm.positionsnummer or "").replace("+", " ")

        segmente.append(_seg("LIN", str(laufende_pos), "", f"{posnr}:SRV"))
        segmente.append(_seg(
            "ELS",
            f"{ART_LEISTUNG}:{VERGUETUNGSART}:{QUAL_VERG}:{hm.positionsnummer}",
        ))
        segmente.append(_seg("QTY", f"47:{pos.menge}"))
        segmente.append(_seg("PRI", f"AAA:{_money(pos.einzelpreis)}"))
        segmente.append(_seg("MOA", f"203:{_money(pos.betrag_gesamt)}"))

        gesamt += Decimal(str(pos.betrag_gesamt))
        laufende_pos += 1

    segmente.append(_seg("MOA", f"39:{_money(gesamt)}"))
    segmente.append(_seg("UNT", str(len(segmente) - 2), nachrichten_ref))
    segmente.append(_seg("UNZ", "1", nachrichten_ref))

    return "\n".join(segmente).encode("latin-1", errors="replace")
