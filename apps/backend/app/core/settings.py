from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    patti_base_url: str
    patti_login_email: str
    patti_login_password: str

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )


settings = Settings()