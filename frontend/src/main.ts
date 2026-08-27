import './style.css'
import { api } from './lib/api'
import { AudioEngine, ALARMS, AMBIENT } from './lib/audio'
import { THEMES, getTheme, applyTheme } from './lib/themes'
import { renderIcons } from './lib/icons'
import type { Mode, Settings, Task } from './lib/types'
import { DEFAULT_SETTINGS } from './lib/types'

const audio = new AudioEngine()

// ---------- Estado interno ----------
const state = {
  settings: { ...DEFAULT_SETTINGS },
  tasks: [] as Task[],
  sessionsToday: 0,
  mode: 'focus' as Mode,
  running: false,
  timeLeft: DEFAULT_SETTINGS.focusMinutes * 60,
  total: DEFAULT_SETTINGS.focusMinutes * 60,
  cycle: 0, // pomodoros completados dentro del ciclo actual (para descanso largo)
  activeTaskId: null as string | null,
  timerId: 0 as number,
}

// Circunferencia real del anillo (SVG con r=45 => 2·π·45)
const RING = 2 * Math.PI * 45

// ---------- Utilidades ----------
function fmt(s: number): string {
  const total = Math.floor(s) // solo segundos enteros, sin milisegundos
  const m = Math.floor(total / 60)
  const sec = total % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function secondsForMode(mode: Mode, s: Settings): number {
  if (mode === 'focus') return s.focusMinutes * 60
  if (mode === 'shortBreak') return s.shortBreakMinutes * 60
  return s.longBreakMinutes * 60
}

function modeLabel(m: Mode): string {
  if (m === 'focus') return 'Pomodoro'
  if (m === 'shortBreak') return 'Descanso corto'
  return 'Descanso largo'
}

// Contenedor raíz
const app = document.querySelector<HTMLDivElement>('#app') as HTMLDivElement

app.innerHTML = `
  <header class="topbar">
    <div class="brand">
      <span class="logo"><i data-lucide="timer"></i></span>
      <span>Pomopopo</span>
    </div>
    <div class="topbar-actions">
      <button class="icon-btn" id="btn-settings" title="Ajustes"><i data-lucide="settings"></i></button>
    </div>
  </header>

  <p class="session-count">
    <i data-lucide="timer"></i>
    <span>Completados hoy:</span>
    <strong id="session-num">0</strong>
  </p>

  <section class="timer-card">
    <div class="tabs" id="tabs"></div>
    <div class="timer-ring">
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        <circle class="bg-ring" cx="50" cy="50" r="45"></circle>
        <circle class="bar-ring" id="ring-bar" cx="50" cy="50" r="45"
          stroke-dasharray="${RING}" stroke-dashoffset="0"></circle>
      </svg>
      <div class="timer-time" id="time">25:00</div>
    </div>
    <div class="timer-task" id="current-task">#1 — Tarea de ejemplo</div>
    <div class="timer-controls">
      <button class="ctrl-btn" id="btn-reset" title="Reiniciar"><i data-lucide="rotate-ccw"></i></button>
      <button class="main-btn" id="btn-toggle">Comenzar</button>
      <button class="ctrl-btn" id="btn-skip" title="Saltar"><i data-lucide="skip-forward"></i></button>
    </div>
  </section>

  <section class="tasks-card">
    <div class="tasks-head">
      <h2><i data-lucide="list-todo"></i> Tareas <span class="progress-pill" id="tasks-progress"></span></h2>
    </div>
    <div class="add-task">
      <input id="new-task" type="text" placeholder="¿Qué tarea quieres hacer?" maxlength="120" />
      <button id="add-task" title="Añadir tarea"><i data-lucide="plus"></i></button>
    </div>
    <ul class="task-list" id="task-list"></ul>
    <div class="tasks-empty hidden" id="tasks-empty">Añade una tarea para empezar</div>
  </section>

  <p class="footer-note">Pomopopo · Técnica Pomodoro</p>
`
// ---------- Referencias DOM ----------
const el = {
  tabs: document.querySelector<HTMLDivElement>('#tabs') as HTMLDivElement,
  time: document.querySelector<HTMLDivElement>('#time') as HTMLDivElement,
  ringBar: document.querySelector<SVGCircleElement>('#ring-bar') as SVGCircleElement,
  currentTask: document.querySelector<HTMLDivElement>('#current-task') as HTMLDivElement,
  btnToggle: document.querySelector<HTMLButtonElement>('#btn-toggle') as HTMLButtonElement,
  btnReset: document.querySelector<HTMLButtonElement>('#btn-reset') as HTMLButtonElement,
  btnSkip: document.querySelector<HTMLButtonElement>('#btn-skip') as HTMLButtonElement,
  btnSettings: document.querySelector<HTMLButtonElement>('#btn-settings') as HTMLButtonElement,
  sessionNum: document.querySelector<HTMLElement>('#session-num') as HTMLElement,
  taskList: document.querySelector<HTMLUListElement>('#task-list') as HTMLUListElement,
  tasksEmpty: document.querySelector<HTMLDivElement>('#tasks-empty') as HTMLDivElement,
  tasksProgress: document.querySelector<HTMLSpanElement>('#tasks-progress') as HTMLSpanElement,
  newTask: document.querySelector<HTMLInputElement>('#new-task') as HTMLInputElement,
  addTask: document.querySelector<HTMLButtonElement>('#add-task') as HTMLButtonElement,
}

// ---------- Render ----------
function activeTask(): Task | null {
  return state.tasks.find((t) => t.id === state.activeTaskId) ?? state.tasks.find((t) => !t.done) ?? null
}

function renderTabs(): void {
  const modes: Mode[] = ['focus', 'shortBreak', 'longBreak']
  el.tabs.innerHTML = modes
    .map(
      (m) =>
        `<button class="tab-btn ${state.mode === m ? 'active' : ''}" data-mode="${m}">${modeLabel(m)}</button>`,
    )
    .join('')
  el.tabs.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach((b) => {
    b.addEventListener('click', () => switchMode(b.dataset.mode as Mode))
  })
}

function renderTimer(): void {
  el.time.textContent = fmt(state.timeLeft)
  const progress = state.total > 0 ? state.timeLeft / state.total : 0
  el.ringBar.setAttribute('stroke-dashoffset', String(RING * (1 - progress)))
  el.btnToggle.textContent = state.running ? 'Pausar' : 'Comenzar'
  const t = activeTask()
  el.currentTask.textContent = t ? `#${t.estimatedPomodoros - t.completedPomodoros} — ${t.title}` : 'Selecciona o crea una tarea'
  document.title = `${fmt(state.timeLeft)} · ${modeLabel(state.mode)} — Pomopopo`
  el.sessionNum.textContent = String(state.sessionsToday)
}
function renderTasks(): void {
  const open = state.tasks.filter((t) => !t.done)
  const done = state.tasks.filter((t) => t.done)
  const tokens = state.tasks.reduce((a, t) => a + t.estimatedPomodoros, 0)
  const remaining = open.reduce((a, t) => a + (t.estimatedPomodoros - t.completedPomodoros), 0)

  el.tasksProgress.textContent = `${remaining}/${tokens}`
  el.tasksEmpty.classList.toggle('hidden', state.tasks.length > 0)

  el.taskList.innerHTML = [...open, ...done]
    .sort((a, b) => a.order - b.order)
    .map((t) => {
      const isActive = t.id === state.activeTaskId
      const left = Math.max(0, t.estimatedPomodoros - t.completedPomodoros)
      return `<li class="task-item ${t.done ? 'done-on' : ''} ${isActive ? 'active' : ''}" data-id="${t.id}">
        <span class="task-check ${t.done ? 'done' : ''}" title="Completar tarea"><i data-lucide="check"></i></span>
        <span class="task-title">${escapeHtml(t.title)}</span>
        <span class="task-meta">
          <span class="est">
            <button class="est-minus"><i data-lucide="minus"></i></button><span>${left}</span>
          </span>
          <button class="task-del" title="Eliminar"><i data-lucide="x"></i></button>
        </span>
      </li>`
    })
    .join('')

  renderIcons(el.taskList)

  el.taskList.querySelectorAll<HTMLElement>('.task-item').forEach((li) => {
    const id = li.dataset.id as string
    li.querySelector('.task-check')?.addEventListener('click', (e) => {
      e.stopPropagation()
      toggleDone(id)
    })
    li.querySelector('.est-minus')?.addEventListener('click', (e) => {
      e.stopPropagation()
      decEst(id)
    })
    li.querySelector('.task-del')?.addEventListener('click', (e) => {
      e.stopPropagation()
      void removeTask(id)
    })
    li.querySelector('.task-title')?.addEventListener('click', () => setActive(id))
  })
}

// Escapar HTML de títulos para evitar inyección
function escapeHtml(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

// ---------- Acciones de tareas ----------
async function addTask(title: string): Promise<void> {
  const trimmed = title.trim()
  if (!trimmed) return
  try {
    const t = await api.createTask(trimmed)
    state.tasks.push(t)
    if (!state.activeTaskId) state.activeTaskId = t.id
    renderTasks()
    renderTimer()
  } catch (err) {
    alert(`No se pudo añadir la tarea: ${(err as Error).message}`)
  }
}

async function removeTask(id: string): Promise<void> {
  try {
    await api.deleteTask(id)
  } catch {
    /* el borrado local es suficiente incluso si la API falla */
  }
  state.tasks = state.tasks.filter((t) => t.id !== id)
  if (state.activeTaskId === id) state.activeTaskId = null
  renderTasks()
  renderTimer()
}

async function toggleDone(id: string): Promise<void> {
  const t = state.tasks.find((x) => x.id === id)
  if (!t) return
  const next = !t.done
  Object.assign(t, await api.updateTask(id, { done: next }))
  if (next && state.activeTaskId === id) state.activeTaskId = null
  renderTasks()
  renderTimer()
}

function decEst(id: string): void {
  const t = state.tasks.find((x) => x.id === id)
  if (!t || t.estimatedPomodoros <= 1) return
  t.estimatedPomodoros -= 1
  void api.updateTask(id, { estimatedPomodoros: t.estimatedPomodoros })
  renderTasks()
}

function setActive(id: string): void {
  state.activeTaskId = id
  renderTasks()
  renderTimer()
}
// ---------- Lógica del temporizador ----------
function render(): void {
  renderTabs()
  renderTimer()
  renderTasks()
}

function switchMode(mode: Mode): void {
  stopTimer()
  state.mode = mode
  state.total = secondsForMode(mode, state.settings)
  state.timeLeft = state.total
  render()
}

function startTimer(): void {
  if (state.timeLeft <= 0) state.timeLeft = state.total
  state.running = true
  // Desbloquear el contexto de audio en el gesto del usuario
  audio.activate()
  state.timerId = window.setInterval(tick, 250)
  render()
}

function stopTimer(): void {
  state.running = false
  window.clearInterval(state.timerId)
  render()
}

function resetTimer(): void {
  stopTimer()
  state.timeLeft = state.total
  render()
}

function tick(): void {
  if (!state.running) return
  state.timeLeft -= 0.25
  if (state.timeLeft <= 0) {
    state.timeLeft = 0
    stopTimer()
    completeSession()
    return
  }
  renderTimer()
}

// Al terminar un periodo
function completeSession(): void {
  if (state.mode === 'focus') {
    // Se terminó un pomodoro de trabajo
    void api.addSession()
    state.sessionsToday += 1
    state.cycle += 1

    // Marca progreso en la tarea activa
    const t = activeTask()
    if (t && !t.done) {
      t.completedPomodoros += 1
      void api.updateTask(t.id, { completedPomodoros: t.completedPomodoros })
      if (t.completedPomodoros >= t.estimatedPomodoros) {
        void api.updateTask(t.id, { done: true })
        t.done = true
        if (state.activeTaskId === t.id) state.activeTaskId = null
      }
    }

    audio.playAlarm(state.settings.alarmSound)

    // ¿Descanso largo?
    const longDue = state.cycle % state.settings.longBreakInterval === 0
    state.mode = longDue ? 'longBreak' : 'shortBreak'
  } else {
    // Terminó un descanso -> volver a focus
    audio.playAlarm(state.settings.alarmSound)
    state.mode = 'focus'
  }

  state.total = secondsForMode(state.mode, state.settings)
  state.timeLeft = state.total

  render()

  // Auto-arranque
  const auto = state.mode === 'focus' ? state.settings.autoStartFocus : state.settings.autoStartBreaks
  if (auto) startTimer()
}
// ---------- Modal de ajustes ----------
function openSettings(): void {
  const s = state.settings
  const backdrop = document.createElement('div')
  backdrop.className = 'backdrop'
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head">
        <h2><i data-lucide="settings"></i> Ajustes</h2>
        <button class="close-btn" id="modal-close"><i data-lucide="x"></i></button>
      </div>

      <div class="setting-group">
        <h3>Tiempos</h3>
        <div class="time-grid">
          <div class="field">
            <label>Pomodoro <small>minutos</small></label>
            <input type="number" id="set-focus" min="1" max="120" value="${s.focusMinutes}" />
          </div>
          <div class="field">
            <label>Descanso corto <small>minutos</small></label>
            <input type="number" id="set-short" min="1" max="60" value="${s.shortBreakMinutes}" />
          </div>
          <div class="field">
            <label>Descanso largo <small>minutos</small></label>
            <input type="number" id="set-long" min="1" max="120" value="${s.longBreakMinutes}" />
          </div>
        </div>
        <div class="toggle-row">
          <span>Descanso largo cada</span>
          <span style="display:flex;align-items:center;gap:6px">
            <input type="number" id="set-interval" min="2" max="12" value="${s.longBreakInterval}" style="width:64px" />
            <span>pomodoros</span>
          </span>
        </div>
        <div class="toggle-row">
          <span>Iniciar descansos automáticamente</span>
          <button class="toggle ${s.autoStartBreaks ? 'on' : ''}" id="set-autobrek"><span class="knob"></span></button>
        </div>
        <div class="toggle-row">
          <span>Iniciar pomodoros automáticamente</span>
          <button class="toggle ${s.autoStartFocus ? 'on' : ''}" id="set-autofocus"><span class="knob"></span></button>
        </div>
      </div>

      <div class="setting-group">
        <h3>Sonido de alarma</h3>
        <div class="option-list" id="alarm-list">
          ${ALARMS.map((a) => `
            <button class="option-btn ${s.alarmSound === a.id ? 'active' : ''}" data-alarm="${a.id}">
              <i data-lucide="bell" class="demo"></i><span>${a.label}</span>
            </button>`).join('')}
        </div>
      </div>

      <div class="setting-group">
        <h3>Sonido ambiente</h3>
        <div class="option-list" id="ambient-list">
          ${AMBIENT.map((a) => `
            <button class="option-btn ${s.ambientSound === a.id ? 'active' : ''}" data-ambient="${a.id}">
              <i data-lucide="${a.icon}"></i><span>${a.label}</span>
            </button>`).join('')}
        </div>
      </div>

      <div class="setting-group">
        <h3>Tema (color)</h3>
        <div class="theme-grid" id="theme-grid">
          ${THEMES.map((t) => `
            <button class="swatch ${s.theme === t.id ? 'active' : ''}" data-theme="${t.id}"
              style="background:${t.brand}" title="${t.label}"></button>`).join('')}
        </div>
      </div>

      <div class="modal-foot">
        <button class="btn-ghost" id="modal-cancel">Cancelar</button>
        <button class="btn-dark" id="modal-save">Guardar</button>
      </div>
    </div>`

  document.body.appendChild(backdrop)
  renderIcons(backdrop)

  const close = () => backdrop.remove()
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close()
  })
  backdrop.querySelector<HTMLButtonElement>('#modal-close')!.addEventListener('click', close)
  backdrop.querySelector<HTMLButtonElement>('#modal-cancel')!.addEventListener('click', close)

  // Preview de alarmas al pulsar sobre su icono
  backdrop.querySelectorAll<HTMLButtonElement>('[data-alarm]').forEach((b) => {
    const demo = b.querySelector<HTMLElement>('.demo')
    demo?.addEventListener('click', (e) => {
      e.stopPropagation()
      audio.previewAlarm(b.dataset.alarm as string)
    })
  })

  // Navegación de alarma / ambiente / tema: marca el botón activo
  function bindPick(sel: string): void {
    backdrop.querySelectorAll<HTMLButtonElement>(sel).forEach((b) => {
      b.addEventListener('click', () => {
        backdrop.querySelectorAll(sel).forEach((x) => x.classList.remove('active'))
        b.classList.add('active')
      })
    })
  }
  bindPick('[data-alarm]')
  bindPick('[data-ambient]')
  bindPick('[data-theme]')
// Guardar
  backdrop.querySelector<HTMLButtonElement>('#modal-save')!.addEventListener('click', () => {
    const num = (sel: string): number =>
      Math.max(1, Number((backdrop.querySelector(sel) as HTMLInputElement).value) || 25)
    const newSettings: Settings = {
      ...state.settings,
      focusMinutes: num('#set-focus'),
      shortBreakMinutes: num('#set-short'),
      longBreakMinutes: num('#set-long'),
      longBreakInterval: Math.max(2, Number((backdrop.querySelector('#set-interval') as HTMLInputElement).value) || 4),
      autoStartBreaks: backdrop.querySelector('#set-autobrek')!.classList.contains('on'),
      autoStartFocus: backdrop.querySelector('#set-autofocus')!.classList.contains('on'),
      alarmSound: backdrop.querySelector<HTMLButtonElement>('[data-alarm].active')?.dataset.alarm ?? state.settings.alarmSound,
      ambientSound: backdrop.querySelector<HTMLButtonElement>('[data-ambient].active')?.dataset.ambient ?? state.settings.ambientSound,
      theme: backdrop.querySelector<HTMLButtonElement>('[data-theme].active')?.dataset.theme ?? state.settings.theme,
    }
    applySettings(newSettings)
    void api.saveSettings(newSettings).catch(() => {})
    close()
  })

  // Toggles
  backdrop.querySelectorAll<HTMLButtonElement>('.toggle').forEach((t) => {
    t.addEventListener('click', () => t.classList.toggle('on'))
  })
}

function applySettings(s: Settings): void {
  state.settings = { ...s }
  const theme = getTheme(s.theme)
  applyTheme(theme.brand, theme.dark)
  // Reinicia el temporizador con la nueva duración del modo actual
  state.total = secondsForMode(state.mode, s)
  if (!state.running) state.timeLeft = state.total
  audio.setAmbient(s.ambientSound)
  render()
}

// ---------- Arranque / inicialización ----------
el.btnToggle.addEventListener('click', () => (state.running ? stopTimer() : startTimer()))
el.btnReset.addEventListener('click', resetTimer)
el.btnSkip.addEventListener('click', () => {
  if (!state.running && state.timeLeft === state.total) return
  completeSession()
})
el.btnSettings.addEventListener('click', openSettings)
el.newTask.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') void submitTask()
})
el.addTask.addEventListener('click', () => void submitTask())

function submitTask(): void {
  const title = el.newTask.value
  el.newTask.value = ''
  void addTask(title)
}

async function bootstrap(): Promise<void> {
  try {
    const [tasks, settings, sessions] = await Promise.all([
      api.getTasks(),
      api.getSettings(),
      api.getSessions(),
    ])
    state.tasks = tasks
    state.settings = { ...DEFAULT_SETTINGS, ...settings }
    state.sessionsToday = sessions.sessionsDone
    state.activeTaskId = tasks.find((t) => !t.done)?.id ?? null
  } catch (err) {
    console.warn('No se pudo cargar la API, se usan valores por defecto.', err)
  }

  // Aplica ajustes guardados
  const theme = getTheme(state.settings.theme)
  applyTheme(theme.brand, theme.dark)
  state.mode = 'focus'
  state.total = secondsForMode('focus', state.settings)
  state.timeLeft = state.total
  audio.setAmbient(state.settings.ambientSound)
  render()
  renderIcons()
}

void bootstrap()