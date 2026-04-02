export type TokenPair = {
  access_token: string
  refresh_token: string
  token_type: string
}

export type AuthResponse = {
  user: { id: string; email: string; name: string }
  tokens: TokenPair
}

export type ApiSession = {
  id: string
  title: string | null
  created_at: string
}

export type SessionMessage = {
  role: 'user' | 'assistant' | string
  content: string
  created_at: string
}

export type SessionMessagePage = {
  session_id: string
  total: number
  limit: number
  offset: number
  messages: SessionMessage[]
}

export type IngestResponse = {
  status: string
  chunks_ingested: number
  docs_path: string
}

function joinUrl(base: string, path: string) {
  const b = base.replace(/\/+$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  return `${b}${p}`
}

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const data = (await res.json()) as any
      if (typeof data?.detail === 'string') detail = data.detail
    } catch {
      // ignore
    }
    throw new Error(detail)
  }
  return (await res.json()) as T
}

export async function login(apiBase: string, payload: { email: string; password: string }) {
  return await http<AuthResponse>(joinUrl(apiBase, '/auth/login'), {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function register(apiBase: string, payload: { email: string; name: string; password: string }) {
  return await http<AuthResponse>(joinUrl(apiBase, '/auth/register'), {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function listSessions(apiBase: string, accessToken: string) {
  return await http<ApiSession[]>(joinUrl(apiBase, '/sessions'), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

export async function createSession(apiBase: string, accessToken: string, payload?: { title?: string }) {
  return await http<ApiSession>(joinUrl(apiBase, '/session'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ title: payload?.title ?? null }),
  })
}

export async function getSessionMessages(
  apiBase: string,
  accessToken: string,
  sessionId: string,
  args?: { limit?: number; offset?: number },
) {
  const qs = new URLSearchParams()
  if (args?.limit != null) qs.set('limit', String(args.limit))
  if (args?.offset != null) qs.set('offset', String(args.offset))
  const url = joinUrl(apiBase, `/session/${sessionId}`) + (qs.toString() ? `?${qs}` : '')
  return await http<SessionMessagePage>(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

export async function sendMessage(apiBase: string, accessToken: string, sessionId: string, content: string) {
  return await http<SessionMessage>(joinUrl(apiBase, `/session/${sessionId}`), {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ content }),
  })
}

export async function ingestPdfs(apiBase: string, accessToken: string) {
  return await http<IngestResponse>(joinUrl(apiBase, '/ingest'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

export async function uploadAndIngestPdfs(apiBase: string, accessToken: string, files: File[]) {
  const form = new FormData()
  for (const file of files) form.append('files', file)

  const res = await fetch(joinUrl(apiBase, '/ingest/upload'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  })
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const data = (await res.json()) as any
      if (typeof data?.detail === 'string') detail = data.detail
    } catch {
      // ignore
    }
    throw new Error(detail)
  }
  return (await res.json()) as IngestResponse
}

