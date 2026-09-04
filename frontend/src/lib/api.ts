import type { Settings, Task } from './types'

// En producción (Vercel) se usa VITE_BACKEND_URL para llamar al backend directamente
// (CORS ya configurado en Render). El valor debe ser el ORIGEN del backend,
// p. ej. `https://pomopopo.onrender.com` (se añade /api aquí). Si la variable ya
// termina en /api, se evita duplicarla. En local sin variable se usa el proxy
// /api de Vite hacia localhost:4000.
const rawBackend = (import.meta.env.VITE_BACKEND_URL as string | undefined)?.trim().replace(/\/+$/, '')
const BASE = rawBackend ? `${rawBackend.replace(/\/api$/i, '')}/api` : '/api'

// Timeout per attempt + retry with backoff for cold starts (Render free tier).
export interface RequestOptions {
  timeoutMs?: number
  retries?: number
  retryDelaysMs?: number[]
}

const DEFAULT_TIMEOUT_MS = 15000
const DEFAULT_RETRY_DELAYS_MS = [1000, 2000, 4000]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryable(err: unknown, status?: number): boolean {
  if (typeof status === 'number') return status >= 500
  if (err instanceof DOMException && err.name === 'AbortError') return true
  // Network failures surface as TypeError in fetch.
  return err instanceof TypeError
}

async function request<T>(path: string, init?: RequestInit, opts?: RequestOptions): Promise<T> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const retryDelays = opts?.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS
  const retries = opts?.retries ?? 0
  const attempts = Math.max(1, retries + 1)
  let lastError: unknown = null

  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const onExternalAbort = (): void => controller.abort()
    init?.signal?.addEventListener('abort', onExternalAbort, { once: true })
    try {
      const res = await fetch(`${BASE}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...init,
        signal: controller.signal,
      })
      if (!res.ok) {
        const text = await res.text().catch(() => 'error')
        const err = new Error(`${res.status} ${res.statusText}: ${text}`)
        if (attempt < attempts - 1 && res.status >= 500) {
          lastError = err
          await sleep(retryDelays[Math.min(attempt, retryDelays.length - 1)])
          continue
        }
        throw err
      }
      return (await res.json()) as T
    } catch (err) {
      if (err instanceof Error && !(err instanceof TypeError) && !(err instanceof DOMException)) throw err
      lastError = err
      const status = undefined
      if (attempt < attempts - 1 && isRetryable(err, status)) {
        await sleep(retryDelays[Math.min(attempt, retryDelays.length - 1)])
        continue
      }
      throw err
    } finally {
      clearTimeout(timer)
      init?.signal?.removeEventListener('abort', onExternalAbort)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Request failed')
}

// GETs used at startup retry through the backend cold start window.
const BOOTSTRAP_OPTS: RequestOptions = { retries: 3 }

export const api = {
  getTasks: () => request<Task[]>('/tasks', undefined, BOOTSTRAP_OPTS),
  createTask: (title: string, estimatedPomodoros = 1) =>
    request<Task>('/tasks', { method: 'POST', body: JSON.stringify({ title, estimatedPomodoros }) }),
  updateTask: (id: string, patch: Partial<Task>) =>
    request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteTask: (id: string) =>
    request<{ id: string }>(`/tasks/${id}`, { method: 'DELETE' }),

  getSettings: () => request<Settings>('/settings', undefined, BOOTSTRAP_OPTS),
  saveSettings: (s: Settings) =>
    request<Settings>('/settings', { method: 'PUT', body: JSON.stringify(s) }),

  getSessions: () => request<{ sessionsDone: number }>('/stats/sessions', undefined, BOOTSTRAP_OPTS),
  addSession: () => request<{ sessionsDone: number }>('/stats/sessions', { method: 'POST' }),
}