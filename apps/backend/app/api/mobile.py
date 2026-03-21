from fastapi import APIRouter

from app.services.patient_service import get_mobile_patients_for_person

router = APIRouter()


@router.get("/patients")
def mobile_patients():
    return get_mobile_patients_for_person(3416)