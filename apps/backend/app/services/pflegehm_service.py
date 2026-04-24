"""CRUD-Service for Pflegehilfsmittel-Abrechnungen."""

from __future__ import annotations

import json
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.kostentraeger import Kostentraeger
from app.models.pflegehilfsmittel import Pflegehilfsmittel
from app.models.pflegehm_abrechnung import PflegehmAbrechnung
from app.models.pflegehm_position import PflegehmPosition

# ---------------------------------------------------------------------------
# Seed-Daten (identisch mit Migration, aber als Runtime-Funktion)
# ---------------------------------------------------------------------------

PFLEGEHILFSMITTEL_DEFAULTS: dict[str, dict[str, Any]] = {
    "Saugende Bettschutzeinlage (Einmalgebrauch)": {
        "qty": 25, "price": 10.25, "positionsnummer": "54.45.01.0001", "kennzeichen": "00",
    },
    "Fingerlinge": {
        "qty": 100, "price": 5.00, "positionsnummer": "54.99.01.0001", "kennzeichen": "00",
    },
    "Einmalhandschuhe": {
        "qty": 100, "price": 9.00, "positionsnummer": "54.99.01.1001", "kennzeichen": "00",
    },
    "Medizinische Gesichtsmaske": {
        "qty": 50, "price": 6.00, "positionsnummer": "54.99.01.2001", "kennzeichen": "00",
    },
    "FFP2-Gesichtsmaske": {
        "qty": 20, "price": 13.00, "positionsnummer": "54.99.01.5001", "kennzeichen": "00",
    },
    "Schutzservietten (Einmalgebrauch)": {
        "qty": 100, "price": 10.00, "positionsnummer": "54.99.01.4001", "kennzeichen": "00",
    },
    "Schutzschürzen (Wiederverwendbar)": {
        "qty": 1, "price": 20.50, "positionsnummer": "54.99.01.3002", "kennzeichen": "00",
    },
    "Händedesinfektionsmittel": {
        "qty": 5, "price": 6.95, "positionsnummer": "54.99.02.0001", "kennzeichen": "00",
    },
    "Flächendesinfektionsmittel": {
        "qty": 5, "price": 5.65, "positionsnummer": "54.99.02.0002", "kennzeichen": "00",
    },
    "Händedesinfektionstücher": {
        "qty": 60, "price": 12.00, "positionsnummer": "54.99.02.0014", "kennzeichen": "00",
    },
    "Flächendesinfektionstücher": {
        "qty": 100, "price": 16.00, "positionsnummer": "54.99.02.0015", "kennzeichen": "00",
    },
    "Abschlagspositionsnummer (Differenzbetrag)": {
        "qty": 0, "price": 0.00, "positionsnummer": "54.00.99.0088", "kennzeichen": "00",
    },
    "Saugende Bettschutzeinlage (Wiederverwendbar)": {
        "qty": 1, "price": 22.98, "positionsnummer": "51.40.01.4", "kennzeichen": "00",
    },
}


# ---------------------------------------------------------------------------
# Hilfsmittel-Katalog
# ---------------------------------------------------------------------------

def list_hilfsmittel(db: Session) -> list[Pflegehilfsmittel]:
    return list(db.execute(select(Pflegehilfsmittel).order_by(Pflegehilfsmittel.id)).scalars().all())


def get_hilfsmittel(db: Session, hm_id: int) -> Pflegehilfsmittel | None:
    return db.get(Pflegehilfsmittel, hm_id)


def update_hilfsmittel(db: Session, hm_id: int, data: dict) -> Pflegehilfsmittel | None:
    hm = db.get(Pflegehilfsmittel, hm_id)
    if not hm:
        return None
    for key in ("preis_brutto", "packungsgroesse"):
        if key in data:
            setattr(hm, key, data[key])
    db.commit()
    db.refresh(hm)
    return hm


def seed_hilfsmittel(db: Session) -> int:
    """Insert default Hilfsmittel if not already present. Returns number of inserts."""
    existing = {
        row.bezeichnung
        for row in db.execute(select(Pflegehilfsmittel.bezeichnung)).all()
    }
    count = 0
    for bez, info in PFLEGEHILFSMITTEL_DEFAULTS.items():
        if bez in existing:
            continue
        db.add(Pflegehilfsmittel(
            bezeichnung=bez,
            positionsnummer=info["positionsnummer"],
            kennzeichen=info["kennzeichen"],
            packungsgroesse=info["qty"],
            preis_brutto=info["price"],
        ))
        count += 1
    if count:
        db.commit()
    return count


# ---------------------------------------------------------------------------
# Kostenträger
# ---------------------------------------------------------------------------

def list_kostentraeger(db: Session) -> list[Kostentraeger]:
    return list(db.execute(select(Kostentraeger).order_by(Kostentraeger.name)).scalars().all())


def import_kostentraeger(db: Session) -> int:
    """Import Kostenträger from bundled pflegekassen.json. Returns number of upserts."""
    json_path = Path(__file__).resolve().parent.parent / "fixtures" / "pflegekassen.json"
    if not json_path.exists():
        raise FileNotFoundError(f"pflegekassen.json not found at {json_path}")

    with open(json_path, "r", encoding="utf-8") as f:
        kassen = json.load(f)

    existing_by_ik: dict[str, Kostentraeger] = {
        kt.ik: kt
        for kt in db.execute(select(Kostentraeger)).scalars().all()
    }

    count = 0
    for entry in kassen:
        ik = entry.get("Kostenträger_IK") or entry.get("Kostentraeger_IK", "")
        if not ik:
            continue
        name = entry.get("name", "")
        address = entry.get("address", "")
        annahmestelle = entry.get("Datenannahmestelle", "")
        annahmestelle_ik = entry.get("Datenannahmestelle_IK", "")
        annahmestelle_email = entry.get("Daten-E-Mail-Adresse", "")

        if ik in existing_by_ik:
            kt = existing_by_ik[ik]
            kt.name = name
            kt.address = address
            kt.annahmestelle = annahmestelle
            kt.annahmestelle_ik = annahmestelle_ik
            kt.annahmestelle_email = annahmestelle_email
        else:
            kt = Kostentraeger(
                name=name,
                address=address,
                ik=ik,
                annahmestelle=annahmestelle,
                annahmestelle_ik=annahmestelle_ik,
                annahmestelle_email=annahmestelle_email,
            )
            db.add(kt)
            existing_by_ik[ik] = kt
        count += 1

    db.commit()
    return count


# ---------------------------------------------------------------------------
# Abrechnungen
# ---------------------------------------------------------------------------

def create_abrechnung(
    db: Session,
    patient_id: int,
    patient_name: str,
    versichertennr: str,
    geburtsdatum: str,
    kasse_id: int,
    monat: str,
    positionen: list[dict],  # [{hilfsmittel_id, menge}]
    user_id: int | None = None,
    pflegehm_patient_id: int | None = None,
) -> PflegehmAbrechnung:
    abrechnung = PflegehmAbrechnung(
        patient_id=patient_id,
        patient_name=patient_name,
        versichertennummer=versichertennr,
        geburtsdatum=geburtsdatum,
        kasse_id=kasse_id,
        abrechnungsmonat=monat,
        status="entwurf",
        created_by_user_id=user_id,
        pflegehm_patient_id=pflegehm_patient_id,
    )
    db.add(abrechnung)
    db.flush()  # get abrechnung.id

    gesamt = 0.0
    for pos_data in positionen:
        hm = db.get(Pflegehilfsmittel, pos_data["hilfsmittel_id"])
        if not hm:
            continue
        menge = pos_data.get("menge", 1)
        einzelpreis = hm.preis_brutto
        betrag = round(einzelpreis * menge, 2)
        gesamt += betrag

        db.add(PflegehmPosition(
            abrechnung_id=abrechnung.id,
            hilfsmittel_id=hm.id,
            menge=menge,
            einzelpreis=einzelpreis,
            betrag_gesamt=betrag,
        ))

    abrechnung.gesamt_betrag = round(gesamt, 2)
    db.commit()
    db.refresh(abrechnung)
    return abrechnung


def list_abrechnungen(
    db: Session,
    status_filter: str | None = None,
    patient_id: int | None = None,
) -> list[PflegehmAbrechnung]:
    stmt = (
        select(PflegehmAbrechnung)
        .options(joinedload(PflegehmAbrechnung.kasse))
        .options(joinedload(PflegehmAbrechnung.positionen).joinedload(PflegehmPosition.hilfsmittel))
        .order_by(PflegehmAbrechnung.created_at.desc())
    )
    if status_filter:
        stmt = stmt.where(PflegehmAbrechnung.status == status_filter)
    if patient_id is not None:
        stmt = stmt.where(PflegehmAbrechnung.patient_id == patient_id)
    return list(db.execute(stmt).unique().scalars().all())


def get_abrechnung(db: Session, abrechnung_id: int) -> PflegehmAbrechnung | None:
    stmt = (
        select(PflegehmAbrechnung)
        .options(joinedload(PflegehmAbrechnung.kasse))
        .options(joinedload(PflegehmAbrechnung.positionen).joinedload(PflegehmPosition.hilfsmittel))
        .where(PflegehmAbrechnung.id == abrechnung_id)
    )
    return db.execute(stmt).unique().scalar_one_or_none()


def storniere_abrechnung(db: Session, abrechnung_id: int) -> PflegehmAbrechnung | None:
    abr = get_abrechnung(db, abrechnung_id)
    if not abr:
        return None
    abr.status = "storniert"
    abr.storniert_am = datetime.utcnow()
    db.commit()
    db.refresh(abr)
    return abr


def mark_gesendet(db: Session, abrechnung_id: int) -> PflegehmAbrechnung | None:
    abr = get_abrechnung(db, abrechnung_id)
    if not abr:
        return None
    abr.status = "gesendet"
    abr.gesendet_am = datetime.utcnow()
    db.commit()
    db.refresh(abr)
    return abr
