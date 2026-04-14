"""Shared pytest fixtures.

Alle Backend-Tests laufen gegen SQLite-in-memory. Für den echten
Integration-Test gegen Postgres reicht `DATABASE_URL=postgresql://...`
im Env — die Fixtures picken das auf.
"""

import os

# Vor dem ersten App-Import: sichere Defaults für die Settings setzen,
# damit der Settings-Konstruktor nicht meckert.
os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test-secret-32chars-0123456789abcd")
os.environ.setdefault("PATTI_BASE_URL", "https://example.invalid")
os.environ.setdefault("PATTI_LOGIN_EMAIL", "test@example.invalid")
os.environ.setdefault("PATTI_LOGIN_PASSWORD", "test")

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import *  # noqa: F401,F403 – register all mappers


@pytest.fixture()
def engine():
    """Fresh in-memory SQLite pro Test.

    Wir teilen keinen Engine zwischen Tests, damit commit()s aus einem
    Test nicht in den nächsten durchsickern. In-memory ist schnell genug
    dass pro-Test-Setup kein Problem ist.
    """
    eng = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(eng)
    try:
        yield eng
    finally:
        eng.dispose()


@pytest.fixture()
def db(engine):
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = Session()
    try:
        yield session
    finally:
        session.close()
