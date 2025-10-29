from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # JWT settings
    SECRET_KEY: str = "your-secret-key-here"  # CHANGE THIS IN PRODUCTION
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    class Config:
        env_file = ".env"

settings = Settings()
