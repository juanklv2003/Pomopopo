import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')
const DATA_FILE = join(DATA_DIR, 'db.json')

const DEFAULT_SETTINGS = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakInterval: 4,
  autoStartBreaks: false,
  autoStartFocus: false,
  alarmSound: 'digital',
  ambientSound: 'off',
  theme: 'red',
}

function emptyDb() {
  return {
    tasks: [],
    settings: { ...DEFAULT_SETTINGS },
    // sesiones completadas por fecha (YYYY-MM-DD)
    sessions: {},
  }
}

function load() {
  if (!existsSync(DATA_FILE)) return emptyDb()
  try {
    const raw = JSON.parse(readFileSync(DATA_FILE, 'utf8'))
    return { ...emptyDb(), ...raw, settings: { ...DEFAULT_SETTINGS, ...raw.settings } }
  } catch {
    return emptyDb()
  }
}

function persist(db) {
  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(DATA_FILE, JSON.stringify(db, null, 2))
}

export class Store {
  constructor() {
    this.db = load()
  }

  privateWrite() {
    persist(this.db)
  }

  // ---------- Tareas ----------
  listTasks() {
    return [...this.db.tasks].sort((a, b) => a.order - b.order)
  }

  createTask({ title, estimatedPomodoros = 1 }) {
    const name = String(title || '').trim()
    if (!name) throw new Error('El título no puede estar vacío')
    const task = {
      id: randomUUID(),
      title: name,
      estimatedPomodoros: Math.max(1, Number(estimatedPomodoros) || 1),
      completedPomodoros: 0,
      done: false,
      active: false,
      createdAt: new Date().toISOString(),
      order: this.db.tasks.length,
    }
    this.db.tasks.push(task)
    persist(this.db)
    return task
  }

  getTask(id) {
    return this.db.tasks.find((t) => t.id === id)
  }

  updateTask(id, patch) {
    const t = this.getTask(id)
    if (!t) return null
    const allowed = ['title', 'estimatedPomodoros', 'completedPomodoros', 'done', 'active']
    for (const key of allowed) {
      if (key in patch) {
        if (key === 'title' && patch[key] !== undefined) {
          const name = String(patch[key]).trim()
          if (!name) throw new Error('El título no puede estar vacío')
          t.title = name
        } else if (key === 'estimatedPomodoros') {
          t.estimatedPomodoros = Math.max(0, Number(patch[key]) || 0)
        } else if (key === 'completedPomodoros') {
          t.completedPomodoros = Math.max(0, Number(patch[key]) || 0)
        } else {
          t[key] = Boolean(patch[key])
        }
      }
    }
    persist(this.db)
    return t
  }

  deleteTask(id) {
    const before = this.db.tasks.length
    this.db.tasks = this.db.tasks.filter((t) => t.id !== id)
    if (this.db.tasks.length === before) return false
    persist(this.db)
    return true
  }

  // ---------- Ajustes ----------
  getSettings() {
    return { ...this.db.settings }
  }

  saveSettings(patch) {
    const allowed = [
      'focusMinutes', 'shortBreakMinutes', 'longBreakMinutes', 'longBreakInterval',
      'autoStartBreaks', 'autoStartFocus', 'alarmSound', 'ambientSound', 'theme',
    ]
    for (const key of allowed) {
      if (key in patch) this.db.settings[key] = patch[key]
    }
    persist(this.db)
    return { ...this.db.settings }
  }

  // ---------- Sesiones ----------
  todayKey() {
    return new Date().toISOString().slice(0, 10)
  }

  sessionsDone() {
    return this.db.sessions[this.todayKey()] ?? 0
  }

  addSession() {
    const key = this.todayKey()
    this.db.sessions[key] = (this.db.sessions[key] ?? 0) + 1
    persist(this.db)
    return this.db.sessions[key]
  }
}