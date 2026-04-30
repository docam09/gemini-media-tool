from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    gemini_api_key: str = ""
    database_url: str = "sqlite+aiosqlite:///./data/media_tool.db"
    media_dir: str = "./data/media"
    cors_origins: list[str] = ["http://localhost:3000"]

    model_config = {"env_file": ".env", "env_prefix": ""}


settings = Settings()
