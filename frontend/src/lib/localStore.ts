import type { Settings, Task } from './types'
import { DEFAULT_SETTINGS } from './types'

const STORAGE_KEY = 'pomopopo:v1'

export interface PersistedClientState {
  tasks: Task[]
  settings: Settings
  activeTaskId: string | null
}

function isTask(value: unknown): value is Task {
  if (!value || typeof value !== 'object') return false
  const t = value as Task
  return (
    typeof t.id === 'string' &&
    typeof t.title === 'string' &&
    typeof t.estimatedPomodoros === 'number' &&
    typeof t.completedPomodoros === 'number' &&
    typeof t.done === 'boolean'
  )
}

export function loadPersistedClientState(): PersistedClientState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as Partial<PersistedClientState>
    if (!Array.isArray(data.tasks) || !data.settings || typeof data.settings !== 'object') return null
    const tasks = data.tasks.filter(isTask)
    const settings = { ...DEFAULT_SETTINGS, ...data.settings }
    let activeTaskId = typeof data.activeTaskId === 'string' ? data.activeTaskId : null
    if (activeTaskId && !tasks.some((t) => t.id === activeTaskId)) {
      activeTaskId = tasks.find((t) => !t.done)?.id ?? null
    }
    return { tasks, settings, activeTaskId }
  } catch {
    return null
  }
}

export function savePersistedClientState(snapshot: PersistedClientState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch (err) {
    console.warn('No se pudo guardar en localStorage', err)
  }
}
