// Tipos compartidos de Pomopopo

export type Mode = 'focus' | 'shortBreak' | 'longBreak'

export interface Task {
  id: string
  title: string
  estimatedPomodoros: number
  completedPomodoros: number
  done: boolean
  active: boolean
  createdAt: string
  order: number
}

export interface Settings {
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  longBreakInterval: number // cada cuántos pomodoros hay un descanso largo
  autoStartBreaks: boolean
  autoStartFocus: boolean
  alarmSound: string
  ambientSound: string
  theme: string
}

export const DEFAULT_SETTINGS: Settings = {
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

export interface ServerState {
  tasks: Task[]
  settings: Settings
  sessionsToday: number
}