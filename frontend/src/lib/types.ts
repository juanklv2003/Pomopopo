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
  backgroundPattern: string
  alarmVolume: number
  ambientVolume: number
  customColor: string
  savedColors: string[]
  hiddenThemes: string[]
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
  backgroundPattern: 'none',
  alarmVolume: 80,
  ambientVolume: 50,
  customColor: '#ba4949',
  savedColors: [],
  hiddenThemes: [],
}

export interface ServerState {
  tasks: Task[]
  settings: Settings
  sessionsToday: number
}