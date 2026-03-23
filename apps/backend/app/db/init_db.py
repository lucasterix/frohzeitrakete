import importlib
import pkgutil

import app.models as models_pkg
from app.db.base import Base
from app.db.session import engine


def init_db() -> None:
    for _, module_name, _ in pkgutil.iter_modules(models_pkg.__path__):
        importlib.import_module(f"app.models.{module_name}")

    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    init_db()
    print("DB initialisiert.")