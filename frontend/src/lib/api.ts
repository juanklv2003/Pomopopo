import type { Settings, Task } from './types'

// En producción concreto (Vercel) se usa VITE_BACKEND_URL para llamar al backend
// directamente (CORS ya configurado en Render). En local sin variable se usa el
// proxy /api de Vite hacia localhost:4000.
const BASE = (import.meta.env.VITE_BACKEND_URL as string | undefined)?.replace(/\/+$/, '') || '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => 'error')
    throw new Error(`${res.status} ${res.statusText}: ${text}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  getTasks: () => request<Task[]>('/tasks'),
  createTask: (title: string, estimatedPomodoros = 1) =>
    request<Task>('/tasks', { method: 'POST', body: JSON.stringify({ title, estimatedPomodoros }) }),
  updateTask: (id: string, patch: Partial<Task>) =>
    request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteTask: (id: string) =>
    request<{ id: string }>(`/tasks/${id}`, { method: 'DELETE' }),

  getSettings: () => request<Settings>('/settings'),
  saveSettings: (s: Settings) =>
    request<Settings>('/settings', { method: 'PUT', body: JSON.stringify(s) }),

  getSessions: () => request<{ sessionsDone: number }>('/stats/sessions'),
  addSession: () => request<{ sessionsDone: number }>('/stats/sessions', { method: 'POST' }),
}