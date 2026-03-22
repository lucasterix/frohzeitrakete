from app.db.base import Base
from app.db.session import engine
from app.models.refresh_token import RefreshToken
from app.models.user import User

Base.metadata.create_all(bind=engine)

print("Tables created.")