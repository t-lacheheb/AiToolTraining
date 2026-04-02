from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "day5-agentic-rag"
    env: str = "dev"
    secret_key: str = "change-me"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    database_url: str = "postgresql+psycopg://postgres:postgres@db:5432/agentic"
    vector_dim: int = 384
    history_window: int = 6

    docs_path: str = "../day_4/documents"
    embedding_model: str = "nomic-embed-text"
    chat_model: str = "llama3.2:1b"
    ollama_base_url: str = "http://ollama:11434"
    pgvector_collection: str = "day5_documents"
    chunk_size: int = 1000
    chunk_overlap: int = 150
    rag_top_k: int = 4
    cors_origins: str = "*"


settings = Settings()
