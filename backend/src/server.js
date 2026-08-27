import express from 'express'
import cors from 'cors'
import { Store } from './store.js'

const app = express()
const store = new Store()

const PORT = process.env.PORT || 4000

app.use(cors())
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

// Fallback JSON amigable
app.use((_req, res) => {
  res.status(404).json({ error: 'No encontrado' })
})

app.listen(PORT, () => {
  console.log(`Pomopopo backend en http://localhost:${PORT}`)
})