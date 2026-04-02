# Day 5 - Agentic RAG API (FastAPI + Postgres + pgvector)

This day replaces the old content with a clean, modular FastAPI project that demonstrates:
- JWT access/refresh auth
- Session-based chat
- Short-term memory (last N messages)
- Long-term memory (per user)
- RAG over ingested documents stored in pgvector
- A frontend dashboard to visualize your working day (sessions + message timeline)

## Structure
- `app/` FastAPI app
- `alembic/` migrations
- `scripts/ingest.py` document ingestion
- `docker-compose.yml` Postgres + pgvector + app

## Quick Start (local)
1. Create a venv and install deps:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

2. Create `.env` from `.env.example` and adjust values.
   Make sure `GEMINI_API_KEY` and Postgres vars are set.

3. Run Postgres + pgvector:

```bash
docker compose up -d db
```

4. Run migrations:

```bash
alembic upgrade head
```

5. Ingest PDFs (from `./documents` by default). This clears and refills the `PGVECTOR_COLLECTION` collection:

```bash
python -m scripts.ingest
```

6. Start the API:

```bash
uvicorn app.main:app --reload
```

## Docker Compose (full stack)

```bash
docker compose up --build
```

Then ingest docs (clears and refills the collection):

```bash
docker compose exec app python -m scripts.ingest
```

Migrations are run automatically on container startup via `entrypoint.sh`.

Frontend dashboard is served at:
- `http://localhost:5173`

API is served at:
- `http://localhost:8009`

## API
- `POST /auth/register` → `{email, name, password}` → returns `{user, tokens}`
- `POST /auth/login` → `{email, password}` → returns `{user, tokens}`
- `POST /auth/refresh` → `{refresh_token}`
- `POST /session` → `{title?}`
- `GET /sessions`
- `PUT /session/{id}` → `{content}`
- `GET /session/{id}?limit=20&offset=0` → paginated message timeline

All session endpoints require `Authorization: Bearer <access_token>`.

## Frontend (Working Day Visualizer)

The frontend app lives in `day_5/frontend` and visualizes:
- Sessions created during a selected day
- Timeline of user/assistant messages for a selected session
- Session/message counters and word totals

### Run locally (frontend only)

```bash
cd day_5/frontend
npm install
npm run dev
```

Open `http://localhost:5173` and set API base to `http://localhost:8009`.

## RAG Flow
When you call `PUT /session/{id}`:
1. Load prompt template
2. Inject short-term history and long-term memory
3. Retrieve context from pgvector
4. Invoke the agent with tools
5. Save assistant response and any tool-driven long-term memory

To upgrade the agent, adjust `day_5/app/services/agent.py` and the prompt template in `day_5/app/core/system_prompt.txt`.
