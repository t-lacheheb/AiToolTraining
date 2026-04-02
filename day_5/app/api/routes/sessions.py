from uuid import UUID
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.session import Session as ChatSession
from app.schemas import SessionCreate, SessionOut, MessageCreate, MessageOut, SessionMessagePage, IngestResponse
from app.services.sessions import SessionService
from app.services.agent import RAGService
from app.services.rag_pipeline import ingest_pdfs

router = APIRouter(tags=["sessions"])

sessions_service = SessionService()
rag_service = RAGService()


@router.post("/ingest", response_model=IngestResponse)
def run_ingestion(current_user=Depends(get_current_user)):
    # Protected endpoint; any authenticated user can trigger document refresh.
    _ = current_user
    docs_folder = Path(settings.docs_path).resolve()
    chunks = ingest_pdfs(docs_folder)
    return IngestResponse(
        status="ok",
        chunks_ingested=chunks,
        docs_path=str(docs_folder),
    )


@router.post("/ingest/upload", response_model=IngestResponse)
def upload_and_ingest(
    files: list[UploadFile] = File(...),
    current_user=Depends(get_current_user),
):
    # Protected endpoint; any authenticated user can upload PDFs and trigger ingestion.
    _ = current_user
    docs_folder = Path(settings.docs_path).resolve()
    docs_folder.mkdir(parents=True, exist_ok=True)

    valid_files = 0
    for uploaded in files:
        original_name = Path(uploaded.filename or "").name
        if not original_name.lower().endswith(".pdf"):
            continue
        target_path = docs_folder / original_name
        content = uploaded.file.read()
        target_path.write_bytes(content)
        valid_files += 1

    if valid_files == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid PDF files uploaded.",
        )

    chunks = ingest_pdfs(docs_folder)
    return IngestResponse(
        status="ok",
        chunks_ingested=chunks,
        docs_path=str(docs_folder),
    )


@router.post("/session", response_model=SessionOut)
def create_session(
    payload: SessionCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    session = sessions_service.create_session(db, current_user.id, payload.title)
    return session


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return sessions_service.list_sessions(db, current_user.id)


@router.put("/session/{session_id}", response_model=MessageOut)
def send_message(
    session_id: UUID,
    payload: MessageCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")


    answer = rag_service.answer(db, current_user.id, session_id, payload.content)
    sessions_service.add_message(db, session_id, current_user.id, "user", payload.content)
    assistant_msg = sessions_service.add_message(db, session_id, current_user.id, "assistant", answer)

    return MessageOut(role="assistant", content=answer, created_at=assistant_msg.created_at)


@router.get("/session/{session_id}", response_model=SessionMessagePage)
def get_session(
    session_id: UUID,
    limit: int = 20,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    total, rows = sessions_service.get_messages_page(db, session_id, limit, offset)
    messages = [MessageOut(role=row.role, content=row.content, created_at=row.created_at) for row in rows]
    return SessionMessagePage(
        session_id=session_id,
        total=total,
        limit=limit,
        offset=offset,
        messages=messages,
    )
