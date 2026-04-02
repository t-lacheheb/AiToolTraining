import { useEffect, useMemo, useState } from 'react'
import {
  createSession,
  getSessionMessages,
  ingestPdfs,
  listSessions,
  login,
  register,
  sendMessage,
  uploadAndIngestPdfs,
  type ApiSession,
  type SessionMessage,
} from '../utils/api'
import { formatLocalDate, formatLocalTime, isSameLocalDay, parseApiDate } from '../utils/datetime'

type AuthMode = 'login' | 'register'

function usePersistedState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    const raw = localStorage.getItem(key)
    if (!raw) return initial
    try {
      return JSON.parse(raw) as T
    } catch {
      return initial
    }
  })

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value))
  }, [key, value])

  return [value, setValue] as const
}

function countWords(s: string) {
  const trimmed = s.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

function summarizeMessages(messages: SessionMessage[]) {
  let userCount = 0
  let assistantCount = 0
  let userWords = 0
  let assistantWords = 0
  for (const m of messages) {
    if (m.role === 'user') {
      userCount++
      userWords += countWords(m.content)
    } else {
      assistantCount++
      assistantWords += countWords(m.content)
    }
  }
  return { userCount, assistantCount, userWords, assistantWords }
}

export default function App() {
  const [apiBase, setApiBase] = usePersistedState('apiBase', 'http://localhost:8009')
  const [accessToken, setAccessToken] = usePersistedState<string | null>('accessToken', null)

  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('demo@example.com')
  const [name, setName] = useState('Demo')
  const [password, setPassword] = useState('demo12345')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [sessions, setSessions] = useState<ApiSession[]>([])
  const [selectedDay, setSelectedDay] = useState(() => formatLocalDate(new Date()))
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<SessionMessage[] | null>(null)
  const [newSessionTitle, setNewSessionTitle] = useState('')
  const [draftMessage, setDraftMessage] = useState('')
  const [uploadFiles, setUploadFiles] = useState<File[]>([])

  const sessionsForDay = useMemo(() => {
    const target = new Date(selectedDay + 'T00:00:00')
    return sessions.filter((s) => isSameLocalDay(parseApiDate(s.created_at), target))
  }, [selectedDay, sessions])

  const dayTotals = useMemo(() => {
    return {
      sessions: sessionsForDay.length,
      messagesLoaded: messages?.length ?? 0,
    }
  }, [sessionsForDay.length, messages?.length])

  async function handleAuth() {
    setBusy(true)
    setError(null)
    try {
      const res =
        authMode === 'login'
          ? await login(apiBase, { email, password })
          : await register(apiBase, { email, password, name })
      setAccessToken(res.tokens.access_token)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function refreshSessions() {
    if (!accessToken) return
    setBusy(true)
    setError(null)
    try {
      const rows = await listSessions(apiBase, accessToken)
      setSessions(rows)
      if (!selectedSessionId && rows.length) setSelectedSessionId(rows[0]!.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleIngestPdfs() {
    if (!accessToken) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await ingestPdfs(apiBase, accessToken)
      setNotice(`Ingestion done: ${result.chunks_ingested} chunks from ${result.docs_path}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleUploadAndIngest() {
    if (!accessToken) return
    if (uploadFiles.length === 0) {
      setError('Please choose at least one PDF file.')
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await uploadAndIngestPdfs(apiBase, accessToken, uploadFiles)
      setUploadFiles([])
      setNotice(`Upload + ingestion done: ${result.chunks_ingested} chunks from ${result.docs_path}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function loadMessages(sessionId: string) {
    if (!accessToken) return
    setBusy(true)
    setError(null)
    try {
      const page = await getSessionMessages(apiBase, accessToken, sessionId, { limit: 200, offset: 0 })
      setMessages(page.messages)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateSession() {
    if (!accessToken) return
    setBusy(true)
    setError(null)
    try {
      const created = await createSession(apiBase, accessToken, { title: newSessionTitle.trim() || undefined })
      setNewSessionTitle('')
      await refreshSessions()
      setSelectedSessionId(created.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleSendMessage() {
    if (!accessToken || !selectedSessionId || !draftMessage.trim()) return
    setBusy(true)
    setError(null)
    try {
      const now = new Date().toISOString()
      const optimisticUser: SessionMessage = { role: 'user', content: draftMessage, created_at: now }
      setMessages((prev) => (prev ? [...prev, optimisticUser] : [optimisticUser]))
      const sent = draftMessage
      setDraftMessage('')
      const assistant = await sendMessage(apiBase, accessToken, selectedSessionId, sent)
      setMessages((prev) => (prev ? [...prev, assistant] : [assistant]))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      await loadMessages(selectedSessionId)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!accessToken) return
    void refreshSessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, apiBase])

  useEffect(() => {
    if (!selectedSessionId) {
      setMessages(null)
      return
    }
    void loadMessages(selectedSessionId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSessionId])

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId],
  )

  const summary = useMemo(() => (messages ? summarizeMessages(messages) : null), [messages])

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <div className="dot" />
          <div>
            <div className="title">Working Day</div>
            <div className="subtitle">Day 5 • Sessions timeline</div>
          </div>
        </div>

        <div className="controls">
          <label className="field">
            <span>API</span>
            <input value={apiBase} onChange={(e) => setApiBase(e.target.value)} placeholder="http://localhost:8009" />
          </label>

          <label className="field">
            <span>Day</span>
            <input type="date" value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} />
          </label>

          <button className="button" onClick={refreshSessions} disabled={!accessToken || busy}>
            Refresh
          </button>
          <button className="button" onClick={handleIngestPdfs} disabled={!accessToken || busy}>
            Ingest PDFs
          </button>
          <label className="button fileButton">
            Choose PDFs
            <input
              type="file"
              accept=".pdf,application/pdf"
              multiple
              onChange={(e) => setUploadFiles(Array.from(e.target.files ?? []))}
              disabled={!accessToken || busy}
            />
          </label>
          <button className="button" onClick={handleUploadAndIngest} disabled={!accessToken || busy || uploadFiles.length === 0}>
            Upload + Ingest
          </button>

          <button
            className="button secondary"
            onClick={() => {
              setAccessToken(null)
              setSessions([])
              setSelectedSessionId(null)
              setMessages(null)
            }}
            disabled={!accessToken || busy}
          >
            Logout
          </button>
        </div>
      </header>

      {error ? <div className="alert">{error}</div> : null}
      {notice ? <div className="alert notice">{notice}</div> : null}
      {uploadFiles.length > 0 ? <div className="alert notice">Selected: {uploadFiles.map((f) => f.name).join(', ')}</div> : null}

      {!accessToken ? (
        <main className="auth">
          <div className="card">
            <div className="cardTitle">Sign in</div>
            <div className="segmented">
              <button
                className={authMode === 'login' ? 'active' : ''}
                onClick={() => setAuthMode('login')}
                disabled={busy}
              >
                Login
              </button>
              <button
                className={authMode === 'register' ? 'active' : ''}
                onClick={() => setAuthMode('register')}
                disabled={busy}
              >
                Register
              </button>
            </div>

            <label className="field">
              <span>Email</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {authMode === 'register' ? (
              <label className="field">
                <span>Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
            ) : null}
            <label className="field">
              <span>Password</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>

            <button className="button primary" onClick={handleAuth} disabled={busy}>
              {busy ? 'Please wait…' : authMode === 'login' ? 'Login' : 'Create account'}
            </button>

            <div className="hint">
              Uses your FastAPI endpoints: <code>/auth/login</code>, <code>/auth/register</code>, <code>/sessions</code>,
              <code> /session/{'{id}'}</code>.
            </div>
          </div>
        </main>
      ) : (
        <main className="grid">
          <section className="panel">
            <div className="panelHeader">
              <div>
                <div className="panelTitle">Sessions ({sessionsForDay.length})</div>
                <div className="panelSubtitle">
                  Showing sessions created on <b>{selectedDay}</b>
                </div>
              </div>
              <div className="pillRow">
                <span className="pill">Sessions: {dayTotals.sessions}</span>
                <span className="pill">Msgs (loaded): {dayTotals.messagesLoaded}</span>
              </div>
            </div>

            <div className="composer">
              <input
                placeholder="New session title (optional)"
                value={newSessionTitle}
                onChange={(e) => setNewSessionTitle(e.target.value)}
              />
              <button className="button primary" onClick={handleCreateSession} disabled={busy}>
                New Session
              </button>
            </div>

            <div className="list">
              {sessionsForDay.length === 0 ? (
                <div className="empty">No sessions for this day yet.</div>
              ) : (
                sessionsForDay.map((s) => (
                  <button
                    key={s.id}
                    className={'listItem ' + (s.id === selectedSessionId ? 'selected' : '')}
                    onClick={() => setSelectedSessionId(s.id)}
                    disabled={busy}
                  >
                    <div className="listMain">
                      <div className="listTitle">{s.title?.trim() ? s.title : 'Untitled session'}</div>
                      <div className="listMeta">{formatLocalTime(parseApiDate(s.created_at))}</div>
                    </div>
                    <div className="chev">›</div>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panelHeader">
              <div>
                <div className="panelTitle">Timeline</div>
                <div className="panelSubtitle">
                  {selectedSession ? (
                    <>
                      <b>{selectedSession.title?.trim() ? selectedSession.title : 'Untitled session'}</b> •{' '}
                      {formatLocalDate(parseApiDate(selectedSession.created_at))} {formatLocalTime(parseApiDate(selectedSession.created_at))}
                    </>
                  ) : (
                    'Select a session'
                  )}
                </div>
              </div>

              {summary ? (
                <div className="pillRow">
                  <span className="pill">User: {summary.userCount} msgs</span>
                  <span className="pill">Assistant: {summary.assistantCount} msgs</span>
                  <span className="pill">Words: {summary.userWords + summary.assistantWords}</span>
                </div>
              ) : null}
            </div>

            <div className="timeline">
              {!selectedSessionId ? (
                <div className="empty">Pick a session on the left.</div>
              ) : messages === null ? (
                <div className="empty">Loading…</div>
              ) : messages.length === 0 ? (
                <div className="empty">No messages yet.</div>
              ) : (
                messages.map((m, idx) => (
                  <div key={idx} className={'msg ' + (m.role === 'user' ? 'user' : 'assistant')}>
                    <div className="msgHead">
                      <span className="role">{m.role}</span>
                      <span className="time">{formatLocalTime(parseApiDate(m.created_at))}</span>
                    </div>
                    <div className="msgBody">{m.content}</div>
                  </div>
                ))
              )}
            </div>

            <div className="composer">
              <input
                placeholder={selectedSessionId ? 'Ask something to begin...' : 'Create/select a session first'}
                value={draftMessage}
                onChange={(e) => setDraftMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void handleSendMessage()
                  }
                }}
                disabled={!selectedSessionId || busy}
              />
              <button
                className="button primary"
                onClick={handleSendMessage}
                disabled={!selectedSessionId || !draftMessage.trim() || busy}
              >
                Send
              </button>
            </div>
          </section>
        </main>
      )}
    </div>
  )
}

