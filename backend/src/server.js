import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { Store } from './store.js'

const app = express()
const store = new Store()

const PORT = process.env.PORT || 4000

// Render corre detrás de un proxy: necesario para IPs correctas y cookies seguras.
app.set('trust proxy', 1)
app.use(helmet())

// CORS con allowlist. En local permite Vite (5173) y Go (8080).
// En producción define ALLOWED_ORIGINS="https://tu-front.vercel.app,..."
// Nunca se usa cors() abierto cuando la variable está definida.
const defaultOrigins = ['http://localhost:5173', 'http://localhost:8080']
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  : defaultOrigins

app.use(
  cors({
    origin(origin, callback) {
      // Peticiones sin Origin (curl, healthchecks, mismo origen) se permiten.
      if (!origin) return callback(null, true)
      if (allowedOrigins.includes(origin)) return callback(null, true)
      return callback(new Error('Origen no permitido por CORS'))
    },
  })
)
app.use(express.json())

// ---------- Tareas ----------
app.get('/api/tasks', (_req, res) => {
  res.json(store.listTasks())
})

app.post('/api/tasks', (req, res) => {
  try {
    const task = store.createTask(req.body || {})
    res.status(201).json(task)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.patch('/api/tasks/:id', (req, res) => {
  try {
    const task = store.updateTask(req.params.id, req.body || {})
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada' })
    res.json(task)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.delete('/api/tasks/:id', (req, res) => {
  const ok = store.deleteTask(req.params.id)
  if (!ok) return res.status(404).json({ error: 'Tarea no encontrada' })
  res.json({ id: req.params.id })
})

// ---------- Ajustes ----------
app.get('/api/settings', (_req, res) => {
  res.json(store.getSettings())
})

app.put('/api/settings', (req, res) => {
  const settings = store.saveSettings(req.body || {})
  res.json(settings)
})

// ---------- Sesiones ----------
app.get('/api/stats/sessions', (_req, res) => {
  res.json({ sessionsDone: store.sessionsDone() })
})

app.post('/api/stats/sessions', (_req, res) => {
  const count = store.addSession()
  res.json({ sessionsDone: count })
})

// ---------- Salud (sin DB ni disco: para warmup y healthchecks) ----------
app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

// Fallback JSON amigable
app.use((_req, res) => {
  res.status(404).json({ error: 'No encontrado' })
})

app.listen(PORT, () => {
  console.log(`Pomopopo backend en http://localhost:${PORT}`)
})