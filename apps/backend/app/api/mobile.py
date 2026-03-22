from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.user import MobilePatient
from app.services.patient_service import get_patients_for_user

router = APIRouter()


@router.get("/patients", response_model=list[MobilePatient])
def mobile_get_patients(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_patients_for_user(db=db, user=current_user)