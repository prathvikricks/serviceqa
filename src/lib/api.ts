/**
 * API client for the Flask JSON backend.
 *
 * Auth is cookie/session based (Flask-Login), so every request sends
 * `credentials: 'include'`. Mutating requests carry a CSRF token fetched once
 * from `/api/v1/auth/csrf` and echoed in the `X-CSRFToken` header (Flask-WTF
 * reads that header by default).
 */

// Same-origin by default (relative `/api/v1`, dev proxy / co-hosted prod).
// Set VITE_API_URL at build time to point at a separately-hosted backend
// (e.g. https://rezize-app.onrender.com/api/v1) for static hosting on R2/S3.
export const API_BASE = import.meta.env.VITE_API_URL ?? '/api/v1'
const BASE = API_BASE

/**
 * Build a ws:// (or wss://) URL for a backend path relative to API_BASE.
 * WebSockets can't carry the X-CSRFToken header, so callers authorize with a
 * short-lived ticket passed as a query param (see the VM web terminal).
 */
export function wsUrl(path: string): string {
  const abs = API_BASE.startsWith('http')
    ? new URL(API_BASE)
    : new URL(API_BASE, window.location.origin)
  const proto = abs.protocol === 'https:' ? 'wss:' : 'ws:'
  const basePath = abs.pathname.replace(/\/$/, '') // e.g. "/api/v1"
  return `${proto}//${abs.host}${basePath}${path}`
}

export class ApiError extends Error {
  status: number
  data: unknown
  constructor(status: number, message: string, data?: unknown) {
    super(message)
    this.status = status
    this.data = data
  }
}

let csrfToken: string | null = null

async function ensureCsrf(): Promise<string> {
  if (csrfToken) return csrfToken
  const res = await fetch(`${BASE}/auth/csrf`, { credentials: 'include' })
  const data = await res.json()
  csrfToken = data.csrf_token
  return csrfToken as string
}

type Options = {
  method?: string
  body?: unknown
  // Lets callers opt out of throwing on 401 (used by the auth bootstrap).
  silent401?: boolean
}

async function request<T>(path: string, opts: Options = {}): Promise<T> {
  const method = opts.method ?? 'GET'
  const headers: Record<string, string> = { Accept: 'application/json' }
  const init: RequestInit = { method, credentials: 'include', headers }

  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(opts.body)
  }
  if (method !== 'GET' && method !== 'HEAD') {
    headers['X-CSRFToken'] = await ensureCsrf()
  }

  const res = await fetch(`${BASE}${path}`, init)

  if (res.status === 204) return undefined as T

  let data: unknown = null
  const text = await res.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (!res.ok) {
    // A stale CSRF token surfaces as 400 — drop it so the next call refetches.
    if (res.status === 400) csrfToken = null
    if (res.status === 401 && opts.silent401) {
      throw new ApiError(401, 'unauthenticated', data)
    }
    const message =
      (data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : null) ?? `Request failed (${res.status})`
    throw new ApiError(res.status, message, data)
  }

  return data as T
}

/** Multipart upload (e.g. static-site files). Lets the browser set the
 * multipart boundary — do NOT set Content-Type ourselves. */
async function upload<T>(path: string, form: FormData): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-CSRFToken': await ensureCsrf(),
  }
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: form,
  })
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  if (!res.ok) {
    if (res.status === 400) csrfToken = null
    const message =
      (data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : null) ?? `Upload failed (${res.status})`
    throw new ApiError(res.status, message, data)
  }
  return data as T
}

/** Multipart upload with real upload-progress (bytes). Uses XMLHttpRequest
 * because fetch can't report upload progress. `onProgress` gets 0–100. */
async function uploadWithProgress<T>(
  path: string,
  form: FormData,
  onProgress?: (pct: number) => void,
): Promise<T> {
  const token = await ensureCsrf()
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE}${path}`)
    xhr.withCredentials = true
    xhr.setRequestHeader('Accept', 'application/json')
    xhr.setRequestHeader('X-CSRFToken', token)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }
    xhr.onload = () => {
      let data: unknown = null
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null
      } catch {
        data = xhr.responseText
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as T)
      } else {
        if (xhr.status === 400) csrfToken = null
        const message =
          data && typeof data === 'object' && 'error' in data
            ? String((data as { error: unknown }).error)
            : `Upload failed (${xhr.status})`
        reject(new ApiError(xhr.status, message, data))
      }
    }
    xhr.onerror = () => reject(new ApiError(0, 'Network error during upload.'))
    xhr.send(form)
  })
}

interface StreamHandlers {
  onToken?: (text: string) => void
  onDone?: (data: Record<string, unknown>) => void | Promise<void>
}

/** POST that consumes a Server-Sent-Events response. Uses fetch + a ReadableStream
 * reader (NOT EventSource) so the session cookie + CSRF header still apply. Calls
 * `onToken` per `event: token` and `onDone` on the terminal `event: done`. */
async function stream(path: string, body: unknown, handlers: StreamHandlers): Promise<void> {
  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
    'Content-Type': 'application/json',
    'X-CSRFToken': await ensureCsrf(),
  }
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok || !res.body) {
    if (res.status === 400) csrfToken = null
    let message = `Request failed (${res.status})`
    try {
      const d = await res.json()
      if (d && typeof d === 'object' && 'error' in d) message = String(d.error)
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let sep: number
    while ((sep = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, sep)
      buf = buf.slice(sep + 2)
      let event = 'message'
      let dataStr = ''
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) dataStr += line.slice(5).trim()
        // ": …" heartbeat comments are ignored
      }
      if (!dataStr) continue
      let data: Record<string, unknown>
      try {
        data = JSON.parse(dataStr)
      } catch {
        continue
      }
      if (event === 'token') handlers.onToken?.(String(data.text ?? ''))
      else if (event === 'done') await handlers.onDone?.(data)
    }
  }
}

export const api = {
  get: <T>(path: string, opts?: Options) => request<T>(path, { ...opts, method: 'GET' }),
  stream,
  post: <T>(path: string, body?: unknown, opts?: Options) =>
    request<T>(path, { ...opts, method: 'POST', body }),
  upload,
  uploadWithProgress,
  put: <T>(path: string, body?: unknown, opts?: Options) =>
    request<T>(path, { ...opts, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, opts?: Options) =>
    request<T>(path, { ...opts, method: 'PATCH', body }),
  delete: <T>(path: string, opts?: Options) => request<T>(path, { ...opts, method: 'DELETE' }),
}
