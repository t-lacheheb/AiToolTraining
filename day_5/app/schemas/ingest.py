from pydantic import BaseModel


class IngestResponse(BaseModel):
    status: str
    chunks_ingested: int
    docs_path: str

