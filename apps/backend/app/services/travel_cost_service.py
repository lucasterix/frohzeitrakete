from datetime import date

from sqlalchemy.orm import Session

from app.models.travel_cost_payment import TravelCostPayment


def create_payment(
    db: Session,
    *,
    user_id: int,
    from_date: date,
    to_date: date,
    marked_by_user_id: int,
    note: str | None = None,
) -> TravelCostPayment:
    if to_date < from_date:
        raise ValueError("to_date_before_from_date")
    row = TravelCostPayment(
        user_id=user_id,
        from_date=from_date,
        to_date=to_date,
        marked_by_user_id=marked_by_user_id,
        note=note,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_payments(db: Session, *, user_id: int) -> list[TravelCostPayment]:
    return (
        db.query(TravelCostPayment)
        .filter(TravelCostPayment.user_id == user_id)
        .order_by(TravelCostPayment.from_date.desc())
        .all()
    )


def delete_payment(db: Session, *, payment_id: int) -> bool:
    row = (
        db.query(TravelCostPayment)
        .filter(TravelCostPayment.id == payment_id)
        .first()
    )
    if row is None:
        return False
    db.delete(row)
    db.commit()
    return True
