from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

from app.api.admin_users import router as admin_users_router
from app.api.auth import router as auth_router
from app.api.mobile import router as mobile_router

app = FastAPI(title="FrohZeitRakete Backend")

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://admin.froehlichdienste.de",
]

extra_origin = os.getenv("ADMIN_FRONTEND_URL")
if extra_origin:
    origins.append(extra_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(mobile_router, prefix="/mobile", tags=["mobile"])
app.include_router(admin_users_router, prefix="/admin", tags=["admin"])


@app.get("/health")
def health():
    return {"status": "ok"}