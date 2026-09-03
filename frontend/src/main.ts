import './style.css'
import '@phosphor-icons/web/bold'
import { api } from './lib/api'
import { AudioEngine, ALARMS, AMBIENT } from './lib/audio'
import { THEMES, getTheme, applyTheme, darkenColor } from './lib/themes'
import { closePiP, isPiPOpen, isPiPSupported, openPiP, pipRender } from './lib/pip'
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
  taskPage: 0,
  taskTab: 'active' as 'active' | 'done',
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

// Aviso al terminar una fase cuando la pestaña no esta visible.
// Solo dispara si el usuario ya concedio permiso (no se pide aqui).
function notifyPhaseEnd(title: string, body: string): void {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body })
    }
  } catch {
    // Las notificaciones son un respaldo opcional: nunca deben romper el flujo.
  }
}

// Contenedor raíz
const app = document.querySelector<HTMLDivElement>('#app') as HTMLDivElement

app.innerHTML = `
  <header class="topbar">
    <div class="brand">
      <span class="logo">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="M16 7.8 C10.5 6.6 3.5 9.8 3.5 16 C3.5 22.5 9.2 28.5 16 28.5 C22.8 28.5 28.5 22.5 28.5 16 C28.5 9.8 21.5 9 16 7.8 Z" fill="#f0554b"/>
          <ellipse cx="8.5" cy="10.5" rx="3" ry="2.2" fill="rgba(255,255,255,0.35)"/>
          <path d="M16 6.8 L12.5 3.2 L14 6.6 Z M16 6.8 L19.5 3.2 L18 6.6 Z M16 6.8 L21 5.2 L19.2 7.6 Z M16 6.8 L11 5.2 L12.8 7.6 Z" fill="#4c9c63"/>
          <path d="M16 6.8 L16.1 2.4 C16.1 1.8 16.9 1.7 17.1 2.4 L17.5 3.6" stroke="#3f8a5c" stroke-width="1.6" fill="none" stroke-linecap="round"/>
        </svg>
      </span>
      <span>Pomopopo</span>
    </div>
    <div class="topbar-actions">
      <button class="icon-btn" id="btn-pip" title="Ventana flotante" aria-label="Ventana flotante"><i class="ph-bold ph-picture-in-picture"></i></button>
      <button class="icon-btn" id="btn-settings" title="Ajustes" aria-label="Ajustes"><i class="ph-bold ph-gear"></i></button>
    </div>
  </header>

  <p class="session-count">
    <i class="ph-bold ph-timer"></i>
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
      <button class="ctrl-btn" id="btn-reset" title="Reiniciar"><i class="ph-bold ph-arrow-counter-clockwise"></i></button>
      <button class="main-btn" id="btn-toggle">Comenzar</button>
      <button class="ctrl-btn" id="btn-skip" title="Saltar"><i class="ph-bold ph-skip-forward"></i></button>
    </div>
  </section>

  <section class="tasks-card">
    <div class="tasks-head">
      <div class="tasks-tabs" role="tablist" aria-label="Listas de tareas">
        <button class="task-tab" id="tab-tasks" role="tab" aria-selected="true" aria-controls="panel-tasks" data-task-tab="active">Tareas <span class="tab-count" id="count-open">0</span></button>
        <button class="task-tab" id="tab-done" role="tab" aria-selected="false" aria-controls="panel-done" data-task-tab="done" tabindex="-1">Finalizadas <span class="tab-count" id="count-done">0</span></button>
      </div>
      <span class="progress-pill" id="tasks-progress"></span>
    </div>
    <div class="add-task">
      <input id="new-task" type="text" placeholder="¿Qué tarea quieres hacer?" maxlength="120" />
      <button id="add-task" title="Añadir tarea"><i class="ph-bold ph-plus"></i></button>
    </div>
    <div class="tasks-body">
      <div class="tasks-col tasks-col-main" id="panel-tasks" role="tabpanel" aria-labelledby="tab-tasks" tabindex="0">
        <ul class="task-list" id="task-list"></ul>
        <div class="task-pagination" id="task-pagination"></div>
        <div class="tasks-empty hidden" id="tasks-empty">Añade una tarea para empezar</div>
      </div>
      <div class="tasks-col tasks-col-done hidden" id="done-section" role="tabpanel" aria-labelledby="tab-done" tabindex="0">
        <ul class="task-list done-list" id="done-list"></ul>
        <div class="tasks-empty hidden" id="done-empty">Todavía no hay tareas finalizadas</div>
      </div>
    </div>
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
  btnPip: document.querySelector<HTMLButtonElement>('#btn-pip') as HTMLButtonElement,
  btnSettings: document.querySelector<HTMLButtonElement>('#btn-settings') as HTMLButtonElement,
  sessionNum: document.querySelector<HTMLElement>('#session-num') as HTMLElement,
  taskList: document.querySelector<HTMLUListElement>('#task-list') as HTMLUListElement,
  doneList: document.querySelector<HTMLUListElement>('#done-list') as HTMLUListElement,
  doneSection: document.querySelector<HTMLDivElement>('#done-section') as HTMLDivElement,
  taskPagination: document.querySelector<HTMLDivElement>('#task-pagination') as HTMLDivElement,
  tasksEmpty: document.querySelector<HTMLDivElement>('#tasks-empty') as HTMLDivElement,
  tasksProgress: document.querySelector<HTMLSpanElement>('#tasks-progress') as HTMLSpanElement,
  tabTasks: document.querySelector<HTMLButtonElement>('#tab-tasks') as HTMLButtonElement,
  tabDone: document.querySelector<HTMLButtonElement>('#tab-done') as HTMLButtonElement,
  panelTasks: document.querySelector<HTMLDivElement>('#panel-tasks') as HTMLDivElement,
  countOpen: document.querySelector<HTMLSpanElement>('#count-open') as HTMLSpanElement,
  countDone: document.querySelector<HTMLSpanElement>('#count-done') as HTMLSpanElement,
  doneEmpty: document.querySelector<HTMLDivElement>('#done-empty') as HTMLDivElement,
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
  const brand = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || '#ba4949'
  const brandDark =
    getComputedStyle(document.documentElement).getPropertyValue('--brand-dark').trim() || '#8f3d3d'
  pipRender({
    time: fmt(state.timeLeft),
    modeLabel: modeLabel(state.mode),
    toggleLabel: state.running ? 'Pausar' : 'Comenzar',
    running: state.running,
    brand,
    brandDark,
  })
}
const TASKS_PER_PAGE = 4

function renderTasks(): void {
  const open = state.tasks.filter((t) => !t.done).sort((a, b) => a.order - b.order)
  const done = state.tasks.filter((t) => t.done).sort((a, b) => a.order - b.order)
  const tokens = state.tasks.reduce((a, t) => a + t.estimatedPomodoros, 0)
  const remaining = open.reduce((a, t) => a + (t.estimatedPomodoros - t.completedPomodoros), 0)

  el.tasksProgress.textContent = `${remaining}/${tokens}`
  renderTaskTabs(open.length, done.length)

  // Paginación de tareas abiertas
  const totalPages = Math.max(1, Math.ceil(open.length / TASKS_PER_PAGE))
  if (state.taskPage >= totalPages) state.taskPage = totalPages - 1
  const pageStart = state.taskPage * TASKS_PER_PAGE
  const pageTasks = open.slice(pageStart, pageStart + TASKS_PER_PAGE)

  el.taskList.innerHTML = pageTasks
    .map((t) => {
      const isActive = t.id === state.activeTaskId
      const left = Math.max(0, t.estimatedPomodoros - t.completedPomodoros)
      return `<li class="task-item ${isActive ? 'active' : ''}" data-id="${t.id}">
        <span class="task-check" title="Completar tarea"><i class="ph-bold ph-check"></i></span>
        <span class="task-title">${escapeHtml(t.title)}</span>
        <span class="task-meta">
          <span class="est">
            <button class="est-minus"><i class="ph-bold ph-minus"></i></button><span>${left}</span><button class="est-plus"><i class="ph-bold ph-plus"></i></button>
          </span>
          <button class="task-del" title="Eliminar"><i class="ph-bold ph-x"></i></button>
        </span>
      </li>`
    })
    .join('')

  // Controles de paginación
  if (open.length > TASKS_PER_PAGE) {
    el.taskPagination.innerHTML = `
      <button class="page-btn" id="page-prev" ${state.taskPage === 0 ? 'disabled' : ''}><i class="ph-bold ph-caret-left"></i></button>
      <span class="page-info">${state.taskPage + 1} / ${totalPages}</span>
      <button class="page-btn" id="page-next" ${state.taskPage >= totalPages - 1 ? 'disabled' : ''}><i class="ph-bold ph-caret-right"></i></button>`
    el.taskPagination.querySelector('#page-prev')?.addEventListener('click', () => {
      state.taskPage--
      renderTasks()
    })
    el.taskPagination.querySelector('#page-next')?.addEventListener('click', () => {
      state.taskPage++
      renderTasks()
    })
  } else {
    el.taskPagination.innerHTML = ''
  }

  // Lista de finalizadas (panel único visible según la pestaña activa)
  el.doneList.innerHTML = done
    .map((t) => {
      const left = Math.max(0, t.estimatedPomodoros - t.completedPomodoros)
      return `<li class="task-item done-on" data-id="${t.id}">
        <span class="task-check done" title="Desmarcar"><i class="ph-bold ph-check"></i></span>
        <span class="task-title">${escapeHtml(t.title)}</span>
        <span class="task-meta">
          <span class="est">
            <button class="est-minus"><i class="ph-bold ph-minus"></i></button><span>${left}</span><button class="est-plus"><i class="ph-bold ph-plus"></i></button>
          </span>
          <button class="task-del" title="Eliminar"><i class="ph-bold ph-x"></i></button>
        </span>
      </li>`
    })
    .join('')

  // Bind events — tareas abiertas
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
    li.querySelector('.est-plus')?.addEventListener('click', (e) => {
      e.stopPropagation()
      incEst(id)
    })
    li.querySelector('.task-del')?.addEventListener('click', (e) => {
      e.stopPropagation()
      void removeTask(id)
    })
    li.querySelector('.task-title')?.addEventListener('click', () => setActive(id))
  })

  // Bind events — finalizadas (sin setActive: reactivar es con Desmarcar)
  el.doneList.querySelectorAll<HTMLElement>('.task-item').forEach((li) => {
    const id = li.dataset.id as string
    li.querySelector('.task-check')?.addEventListener('click', (e) => {
      e.stopPropagation()
      toggleDone(id)
    })
    li.querySelector('.est-minus')?.addEventListener('click', (e) => {
      e.stopPropagation()
      decEst(id)
    })
    li.querySelector('.est-plus')?.addEventListener('click', (e) => {
      e.stopPropagation()
      incEst(id)
    })
    li.querySelector('.task-del')?.addEventListener('click', (e) => {
      e.stopPropagation()
      void removeTask(id)
    })
  })
}

// ---------- Pestañas Tareas | Finalizadas (solo module state: sin prefs en localStorage) ----------
function renderTaskTabs(openCount: number, doneCount: number): void {
  const showDone = state.taskTab === 'done'
  el.tabTasks.classList.toggle('active', !showDone)
  el.tabDone.classList.toggle('active', showDone)
  el.tabTasks.setAttribute('aria-selected', String(!showDone))
  el.tabDone.setAttribute('aria-selected', String(showDone))
  el.tabTasks.tabIndex = showDone ? -1 : 0
  el.tabDone.tabIndex = showDone ? 0 : -1
  el.countOpen.textContent = String(openCount)
  el.countDone.textContent = String(doneCount)
  el.panelTasks.classList.toggle('hidden', showDone)
  el.doneSection.classList.toggle('hidden', !showDone)
  el.tasksEmpty.classList.toggle('hidden', showDone || openCount > 0)
  el.doneEmpty.classList.toggle('hidden', !showDone || doneCount > 0)
  el.taskPagination.classList.toggle('hidden', showDone)
}

function setTaskTab(tab: 'active' | 'done', focus = false): void {
  if (state.taskTab === tab) return
  state.taskTab = tab
  const openCount = state.tasks.filter((t) => !t.done).length
  const doneCount = state.tasks.filter((t) => t.done).length
  renderTaskTabs(openCount, doneCount)
  if (focus) (tab === 'done' ? el.tabDone : el.tabTasks).focus()
}

function bindTaskTabs(): void {
  el.tabTasks.addEventListener('click', () => setTaskTab('active'))
  el.tabDone.addEventListener('click', () => setTaskTab('done'))
  for (const btn of [el.tabTasks, el.tabDone]) {
    btn.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      // Con dos pestañas ambas flechas alternan; el foco sigue a la selección (roving tabindex)
      setTaskTab(btn === el.tabTasks ? 'done' : 'active', true)
    })
  }
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
    // Ir a la última página para ver la tarea nueva
    const open = state.tasks.filter((tk) => !tk.done)
    state.taskPage = Math.max(0, Math.ceil(open.length / TASKS_PER_PAGE) - 1)
    state.taskTab = 'active'
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

function incEst(id: string): void {
  const t = state.tasks.find((x) => x.id === id)
  if (!t) return
  t.estimatedPomodoros += 1
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

// Al terminar un periodo.
// - Llamada normal (desde tick): al llegar a 0, puede auto-arrancar la siguiente fase.
// - Con skip=true (botón saltar): avanza a la siguiente fase pero SIN arrancar.
function completeSession(opts: { skip?: boolean } = {}): void {
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
  // Asegurar que la siguiente fase queda parada (el salto no debe dejarla corriendo)
  state.running = false
  window.clearInterval(state.timerId)

  render()

  notifyPhaseEnd('Pomopopo', `Terminó el periodo. Siguiente: ${modeLabel(state.mode)}.`)

  // Auto-arranque solo en finalización normal (al llegar a 0), no al saltar
  if (!opts.skip) {
    const auto = state.mode === 'focus' ? state.settings.autoStartFocus : state.settings.autoStartBreaks
    if (auto) startTimer()
  }
}
// ---------- Modal de ajustes ----------
const PATTERNS = [
  { id: 'none', label: 'Ninguno', icon: 'ph-bold ph-prohibit' },
  { id: 'stars', label: 'Estrellas', icon: 'ph-bold ph-star' },
  { id: 'circles', label: 'Círculos', icon: 'ph-bold ph-circle' },
  { id: 'triangles', label: 'Triángulos', icon: 'ph-bold ph-triangle' },
  { id: 'flowers', label: 'Flores', icon: 'ph-bold ph-flower' },
  { id: 'paws', label: 'Patitas', icon: 'ph-bold ph-paw-print' },
]

function renderThemeGrid(backdrop: HTMLElement, s: Settings): void {
  const grid = backdrop.querySelector('#theme-grid')
  if (!grid) return
  const hidden = s.hiddenThemes || []
  grid.innerHTML = `
    ${THEMES.filter((t) => !hidden.includes(t.id)).map((t) => `
      <span class="swatch theme-swatch ${s.theme === t.id ? 'active' : ''}" data-theme="${t.id}"
        style="background:${t.brand}" title="${t.label}">
        <button class="theme-del" data-theme-id="${t.id}"><i class="ph-bold ph-x"></i></button>
      </span>`).join('')}
    ${(s.savedColors || []).map((c) => `
      <span class="swatch saved-swatch ${s.theme === 'custom' && s.customColor === c ? 'active' : ''}"
        data-saved-color="${c}" style="background:${c}" title="${c}">
        <button class="saved-del" data-del-color="${c}"><i class="ph-bold ph-x"></i></button>
      </span>`).join('')}`

  // Actualizar preview del picker
  const preview = backdrop.querySelector('.custom-preview') as HTMLElement | null
  if (preview) preview.style.background = s.customColor || '#ba4949'

  // Re-bind events
  grid.querySelectorAll<HTMLElement>('[data-theme]').forEach((b) => {
    b.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.theme-del')) return
      grid.querySelectorAll('[data-theme]').forEach((x) => x.classList.remove('active'))
      grid.querySelectorAll('.saved-swatch').forEach((x) => x.classList.remove('active'))
      b.classList.add('active')
      const t = getTheme(b.dataset.theme!)
      applyTheme(t.brand, t.dark)
    })
  })

  grid.querySelectorAll<HTMLElement>('.theme-del').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const id = btn.dataset.themeId!
      if (s.theme === id) return // no borrar el activo
      const hidden = state.settings.hiddenThemes || []
      if (!hidden.includes(id)) {
        hidden.push(id)
        state.settings.hiddenThemes = hidden
        void api.saveSettings(state.settings).catch(() => {})
        renderThemeGrid(backdrop, s)
      }
    })
  })

  grid.querySelectorAll<HTMLElement>('.saved-swatch').forEach((el) => {
    el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.saved-del')) return
      grid.querySelectorAll('[data-theme]').forEach((x) => x.classList.remove('active'))
      grid.querySelectorAll('.saved-swatch').forEach((x) => x.classList.remove('active'))
      el.classList.add('active')
      const hex = el.dataset.savedColor!
      const input = backdrop.querySelector<HTMLInputElement>('#custom-color')
      if (input) input.value = hex
      if (preview) preview.style.background = hex
      applyTheme(hex, darkenColor(hex))
    })
  })

  grid.querySelectorAll<HTMLElement>('.saved-del').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const hex = btn.dataset.delColor!
      state.settings.savedColors = (state.settings.savedColors || []).filter((c) => c !== hex)
      void api.saveSettings(state.settings).catch(() => {})
      renderThemeGrid(backdrop, s)
    })
  })
}

function openSettings(): void {
  const s = state.settings
  const origTheme = s.theme
  const origCustomColor = s.customColor
  const origPattern = s.backgroundPattern
  const origSavedColors = [...(s.savedColors || [])]
  const origHiddenThemes = [...(s.hiddenThemes || [])]
  const origAlarmVol = s.alarmVolume
  const origAmbientVol = s.ambientVolume
  const backdrop = document.createElement('div')
  backdrop.className = 'backdrop'
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head">
        <h2><i class="ph-bold ph-gear"></i> Ajustes</h2>
        <button class="close-btn" id="modal-close"><i class="ph-bold ph-x"></i></button>
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
        <div class="volume-row">
          <i class="ph-bold ph-speaker-high"></i>
          <input type="range" id="set-alarm-vol" min="0" max="100" value="${s.alarmVolume}" />
          <span class="vol-val" id="set-alarm-vol-val">${s.alarmVolume}%</span>
        </div>
        <div class="select-row">
          <span class="select-icon" id="alarm-icon"><i class="ph-bold ph-${ALARMS.find((a) => a.id === s.alarmSound)?.icon ?? 'bell-ringing'}"></i></span>
          <select class="sound-select" id="alarm-select" aria-label="Sonido de alarma">
            ${ALARMS.map((a) => `
              <option value="${a.id}" ${s.alarmSound === a.id ? 'selected' : ''}>${a.label}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="setting-group">
        <h3>Sonido ambiente</h3>
        <div class="volume-row">
          <i class="ph-bold ph-speaker-high"></i>
          <input type="range" id="set-ambient-vol" min="0" max="100" value="${s.ambientVolume}" />
          <span class="vol-val" id="set-ambient-vol-val">${s.ambientVolume}%</span>
        </div>
        <div class="select-row">
          <span class="select-icon" id="ambient-icon"><i class="ph-bold ph-${AMBIENT.find((a) => a.id === s.ambientSound)?.icon ?? 'speaker-high'}"></i></span>
          <select class="sound-select" id="ambient-select" aria-label="Sonido ambiente">
            ${AMBIENT.map((a) => `
              <option value="${a.id}" ${s.ambientSound === a.id ? 'selected' : ''}>${a.label}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="setting-group">
        <h3>Tema (color)</h3>
        <div class="theme-grid" id="theme-grid">
          ${THEMES.filter((t) => !(s.hiddenThemes || []).includes(t.id)).map((t) => `
            <span class="swatch theme-swatch ${s.theme === t.id ? 'active' : ''}" data-theme="${t.id}"
              style="background:${t.brand}" title="${t.label}">
              <button class="theme-del" data-theme-id="${t.id}"><i class="ph-bold ph-x"></i></button>
            </span>`).join('')}
          ${(s.savedColors || []).map((c) => `
            <span class="swatch saved-swatch ${s.theme === 'custom' && s.customColor === c ? 'active' : ''}"
              data-saved-color="${c}" style="background:${c}" title="${c}">
              <button class="saved-del" data-del-color="${c}"><i class="ph-bold ph-x"></i></button>
            </span>`).join('')}
        </div>
        <div class="custom-color-row">
          <label class="custom-pick" title="Elegir color">
            <input type="color" id="custom-color" value="${s.customColor || '#ba4949'}" />
            <span class="custom-preview" style="background:${s.customColor || '#ba4949'}"></span>
            <i class="ph-bold ph-palette"></i>
          </label>
          <button class="save-color-btn" id="save-color-btn" title="Guardar color"><i class="ph-bold ph-floppy-disk"></i> Guardar</button>
        </div>
      </div>

      <div class="setting-group">
        <h3>Decoración de fondo</h3>
        <div class="pattern-list" id="pattern-list">
          ${PATTERNS.map((p) => `
            <button class="pattern-btn ${s.backgroundPattern === p.id ? 'active' : ''}" data-pattern="${p.id}">
              <i class="ph-bold ${p.icon}"></i><span>${p.label}</span>
            </button>`).join('')}
        </div>
      </div>

      <div class="modal-foot">
        <button class="btn-ghost" id="modal-cancel">Cancelar</button>
        <button class="btn-dark" id="modal-save">Guardar</button>
      </div>
    </div>`

  document.body.appendChild(backdrop)
  // Fuerza dos frames para que la transición de entrada se aplique
  requestAnimationFrame(() => requestAnimationFrame(() => backdrop.classList.add('open')))

  // Cierre con transición de salida (desliza hacia la derecha y desvanece)
  const close = (revert = false) => {
    clearTimeout(ambientPreviewTimer)
    if (revert) {
      audio.stopAmbient()
      audio.setAlarmVolume(origAlarmVol)
      audio.setAmbientVolume(origAmbientVol)
      state.settings.savedColors = origSavedColors
      state.settings.hiddenThemes = origHiddenThemes
      const origThemeObj = getTheme(origTheme, origCustomColor)
      applyTheme(origThemeObj.brand, origThemeObj.dark)
      applyBackgroundPattern(origPattern)
    }
    backdrop.classList.remove('open')
    backdrop.addEventListener('transitionend', () => backdrop.remove(), { once: true })
    // Respaldo por si 'transitionend' no dispara
    setTimeout(() => backdrop.remove(), 400)
  }
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close(true)
  })
  backdrop.querySelector<HTMLButtonElement>('#modal-close')!.addEventListener('click', () => close(true))
  backdrop.querySelector<HTMLButtonElement>('#modal-cancel')!.addEventListener('click', () => close(true))

  // Icono + preview al cambiar el desplegable de alarma
  const alarmSelect = backdrop.querySelector<HTMLSelectElement>('#alarm-select')!
  const alarmIcon = backdrop.querySelector<HTMLElement>('#alarm-icon')!
  alarmSelect.addEventListener('change', () => {
    const def = ALARMS.find((a) => a.id === alarmSelect.value)
    alarmIcon.innerHTML = `<i class="ph-bold ph-${def?.icon ?? 'bell-ringing'}"></i>`
    audio.previewAlarm(alarmSelect.value)
  })

  // Preview de ambiente al cambiar (reproduce 3s y para)
  let ambientPreviewTimer = 0
  const ambientSelect = backdrop.querySelector<HTMLSelectElement>('#ambient-select')!
  const ambientIcon = backdrop.querySelector<HTMLElement>('#ambient-icon')!
  ambientSelect.addEventListener('change', () => {
    clearTimeout(ambientPreviewTimer)
    const id = ambientSelect.value
    const def = AMBIENT.find((a) => a.id === id)
    ambientIcon.innerHTML = `<i class="ph-bold ph-${def?.icon ?? 'speaker-high'}"></i>`
    if (id === 'off') {
      audio.stopAmbient()
    } else {
      audio.stopAmbient()
      audio.setAmbient(id)
      ambientPreviewTimer = window.setTimeout(() => audio.stopAmbient(), 3000)
    }
  })

  // Theme: live preview al hacer click
  backdrop.querySelectorAll<HTMLElement>('[data-theme]').forEach((b) => {
    b.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.theme-del')) return
      backdrop.querySelectorAll('[data-theme]').forEach((x) => x.classList.remove('active'))
      backdrop.querySelectorAll('.saved-swatch').forEach((x) => x.classList.remove('active'))
      b.classList.add('active')
      const t = getTheme(b.dataset.theme!)
      applyTheme(t.brand, t.dark)
    })
  })

  // Borrar temas predefinidos
  backdrop.querySelectorAll<HTMLElement>('.theme-del').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const id = btn.dataset.themeId!
      const hidden = state.settings.hiddenThemes || []
      if (!hidden.includes(id)) {
        hidden.push(id)
        state.settings.hiddenThemes = hidden
        void api.saveSettings(state.settings).catch(() => {})
        renderThemeGrid(backdrop, s)
      }
    })
  })

  // Custom color: live preview
  const customColorInput = backdrop.querySelector<HTMLInputElement>('#custom-color')!
  const customPreview = backdrop.querySelector<HTMLElement>('.custom-preview')
  customColorInput.addEventListener('input', () => {
    backdrop.querySelectorAll('[data-theme]').forEach((x) => x.classList.remove('active'))
    backdrop.querySelectorAll('.saved-swatch').forEach((x) => x.classList.remove('active'))
    const hex = customColorInput.value
    if (customPreview) customPreview.style.background = hex
    applyTheme(hex, darkenColor(hex))
  })

  // Guardar color personalizado en la lista
  backdrop.querySelector('#save-color-btn')?.addEventListener('click', () => {
    const hex = customColorInput.value
    const colors = state.settings.savedColors || []
    if (!colors.includes(hex)) {
      colors.push(hex)
      state.settings.savedColors = colors
      void api.saveSettings(state.settings).catch(() => {})
      renderThemeGrid(backdrop, s)
    }
  })

  // Click en colores guardados: seleccionar
  backdrop.querySelectorAll<HTMLElement>('.saved-swatch').forEach((el) => {
    el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.saved-del')) return
      backdrop.querySelectorAll('[data-theme]').forEach((x) => x.classList.remove('active'))
      backdrop.querySelectorAll('.saved-swatch').forEach((x) => x.classList.remove('active'))
      el.classList.add('active')
      const hex = el.dataset.savedColor!
      customColorInput.value = hex
      if (customPreview) customPreview.style.background = hex
      applyTheme(hex, darkenColor(hex))
    })
  })

  // Borrar colores guardados
  backdrop.querySelectorAll<HTMLElement>('.saved-del').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const hex = btn.dataset.delColor!
      state.settings.savedColors = (state.settings.savedColors || []).filter((c) => c !== hex)
      void api.saveSettings(state.settings).catch(() => {})
      renderThemeGrid(backdrop, s)
    })
  })

  // Pattern: live preview al hacer click
  backdrop.querySelectorAll<HTMLButtonElement>('[data-pattern]').forEach((b) => {
    b.addEventListener('click', () => {
      backdrop.querySelectorAll('[data-pattern]').forEach((x) => x.classList.remove('active'))
      b.classList.add('active')
      applyBackgroundPattern(b.dataset.pattern!)
    })
  })

  // Volume sliders: live preview
  const alarmVol = backdrop.querySelector<HTMLInputElement>('#set-alarm-vol')!
  const alarmVolVal = backdrop.querySelector<HTMLSpanElement>('#set-alarm-vol-val')!
  alarmVol.addEventListener('input', () => {
    const v = Number(alarmVol.value)
    alarmVolVal.textContent = `${v}%`
    audio.setAlarmVolume(v)
  })

  const ambientVol = backdrop.querySelector<HTMLInputElement>('#set-ambient-vol')!
  const ambientVolVal = backdrop.querySelector<HTMLSpanElement>('#set-ambient-vol-val')!
  ambientVol.addEventListener('input', () => {
    const v = Number(ambientVol.value)
    ambientVolVal.textContent = `${v}%`
    audio.setAmbientVolume(v)
  })

// Guardar
  backdrop.querySelector<HTMLButtonElement>('#modal-save')!.addEventListener('click', () => {
    const num = (sel: string): number =>
      Math.max(1, Number((backdrop.querySelector(sel) as HTMLInputElement).value) || 25)
    const activeTheme = backdrop.querySelector<HTMLButtonElement>('[data-theme].active')?.dataset.theme
    const isCustom = !activeTheme
    const newSettings: Settings = {
      ...state.settings,
      focusMinutes: num('#set-focus'),
      shortBreakMinutes: num('#set-short'),
      longBreakMinutes: num('#set-long'),
      longBreakInterval: Math.max(2, Number((backdrop.querySelector('#set-interval') as HTMLInputElement).value) || 4),
      autoStartBreaks: backdrop.querySelector('#set-autobrek')!.classList.contains('on'),
      autoStartFocus: backdrop.querySelector('#set-autofocus')!.classList.contains('on'),
      alarmSound: backdrop.querySelector<HTMLSelectElement>('#alarm-select')?.value ?? state.settings.alarmSound,
      ambientSound: backdrop.querySelector<HTMLSelectElement>('#ambient-select')?.value ?? state.settings.ambientSound,
      theme: isCustom ? 'custom' : activeTheme,
      customColor: isCustom ? customColorInput.value : state.settings.customColor,
      backgroundPattern: backdrop.querySelector<HTMLButtonElement>('[data-pattern].active')?.dataset.pattern ?? state.settings.backgroundPattern,
      alarmVolume: Number(alarmVol.value),
      ambientVolume: Number(ambientVol.value),
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
  const theme = getTheme(s.theme, s.customColor)
  applyTheme(theme.brand, theme.dark)
  applyBackgroundPattern(s.backgroundPattern)
  // Aplicar volúmenes
  audio.setAlarmVolume(s.alarmVolume)
  audio.setAmbientVolume(s.ambientVolume)
  // Forzar restart del ambiente para que siempre aplique
  audio.stopAmbient()
  audio.setAmbient(s.ambientSound)
  // Reinicia el temporizador con la nueva duración del modo actual
  state.total = secondsForMode(state.mode, s)
  if (!state.running) state.timeLeft = state.total
  render()
}

function applyBackgroundPattern(pattern: string): void {
  // 'butterflies' es el id antiguo de 'flowers': se migra para ajustes ya guardados.
  if (pattern === 'butterflies') pattern = 'flowers'
  const body = document.body
  body.classList.remove('bg-stars', 'bg-circles', 'bg-triangles', 'bg-butterflies', 'bg-flowers', 'bg-paws')
  if (pattern && pattern !== 'none') {
    body.classList.add(`bg-${pattern}`)
  }
}

// ---------- Arranque / inicialización ----------
function currentSnapshot(): { time: string; modeLabel: string; toggleLabel: string; running: boolean; brand: string; brandDark: string } {
  const brand = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || '#ba4949'
  const brandDark =
    getComputedStyle(document.documentElement).getPropertyValue('--brand-dark').trim() || '#8f3d3d'
  return {
    time: fmt(state.timeLeft),
    modeLabel: modeLabel(state.mode),
    toggleLabel: state.running ? 'Pausar' : 'Comenzar',
    running: state.running,
    brand,
    brandDark,
  }
}

function refreshPipButton(): void {
  el.btnPip.classList.toggle('active', isPiPOpen())
  el.btnPip.setAttribute('aria-pressed', isPiPOpen() ? 'true' : 'false')
}

// La ventana flotante es opt-in y debe abrirse dentro del gesto del usuario.
el.btnPip.addEventListener('click', () => {
  if (!isPiPSupported()) return
  if (isPiPOpen()) {
    closePiP()
    refreshPipButton()
    return
  }
  void openPiP(
    {
      onToggle: () => (state.running ? stopTimer() : startTimer()),
      onClose: () => refreshPipButton(),
    },
    currentSnapshot(),
  ).then((ok) => {
    if (ok) refreshPipButton()
  })
})
if (!isPiPSupported()) el.btnPip.classList.add('hidden')

el.btnToggle.addEventListener('click', () => {
  // Respaldo sin PiP: pedir permiso de notificaciones en el gesto del usuario.
  if (!isPiPSupported() && 'Notification' in window && Notification.permission === 'default') {
    void Notification.requestPermission().catch(() => {})
  }
  return state.running ? stopTimer() : startTimer()
})
el.btnReset.addEventListener('click', resetTimer)
el.btnSkip.addEventListener('click', () => {
  if (!state.running && state.timeLeft === state.total) return
  // Salta a la siguiente fase (descanso) pero la deja PARADA, sin que corra el tiempo
  completeSession({ skip: true })
})
window.addEventListener('pagehide', () => closePiP())
el.btnSettings.addEventListener('click', openSettings)
el.newTask.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') void submitTask()
})
el.addTask.addEventListener('click', () => void submitTask())
bindTaskTabs()

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
    // Migraciones de ids antiguos (ajustes ya guardados siguen funcionando)
    if (state.settings.ambientSound === 'cafe') state.settings.ambientSound = 'fireplace'
    if (state.settings.backgroundPattern === 'butterflies') state.settings.backgroundPattern = 'flowers'
    state.sessionsToday = sessions.sessionsDone
    state.activeTaskId = tasks.find((t) => !t.done)?.id ?? null
  } catch (err) {
    console.warn('No se pudo cargar la API, se usan valores por defecto.', err)
  }

  // Aplica ajustes guardados
  const theme = getTheme(state.settings.theme, state.settings.customColor)
  applyTheme(theme.brand, theme.dark)
  applyBackgroundPattern(state.settings.backgroundPattern)
  audio.setAlarmVolume(state.settings.alarmVolume)
  audio.setAmbientVolume(state.settings.ambientVolume)
  state.mode = 'focus'
  state.total = secondsForMode('focus', state.settings)
  state.timeLeft = state.total
  audio.setAmbient(state.settings.ambientSound)
  render()
}

void bootstrap()