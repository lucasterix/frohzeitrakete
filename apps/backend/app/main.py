from fastapi import FastAPI

from app.api.mobile import router as mobile_router

app = FastAPI(title="FrohZeitRakete Backend")

app.include_router(mobile_router, prefix="/mobile", tags=["mobile"])


@app.get("/health")
def health():
    return {"status": "ok"}