from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Spotify
    spotify_client_id: str
    spotify_client_secret: str
    spotify_redirect_uri: str = "http://localhost:8000/auth/callback"

    # Session
    session_secret_key: str
    session_cookie_name: str = "maketabs_session"
    session_max_age: int = 60 * 60 * 24 * 7  # 7 days

    # Encryption (for Spotify tokens at rest)
    encryption_key: str

    # Database
    database_url: str = "sqlite+aiosqlite:///./maketabs.db"

    # App
    frontend_url: str = "http://localhost:5173"
    environment: str = "development"

    @property
    def is_dev(self) -> bool:
        return self.environment == "development"


settings = Settings()
