// Paletas de tema (color de fondo / tarjeta del temporizador)
export interface Theme {
  id: string
  label: string
  brand: string
  dark: string
}

export const THEMES: Theme[] = [
  { id: 'red', label: 'Rojo', brand: '#e44747', dark: '#a83535' },
  { id: 'blue', label: 'Azul', brand: '#3a7c9e', dark: '#2c5f7a' },
  { id: 'green', label: 'Verde', brand: '#3f8a5c', dark: '#2f6b46' },
  { id: 'purple', label: 'Violeta', brand: '#7056a6', dark: '#573f8f' },
  { id: 'yellow', label: 'Ámbar', brand: '#d09a3e', dark: '#a5772b' },
  { id: 'pink', label: 'Rosa', brand: '#d05072', dark: '#a83d5c' },
]

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

export function applyTheme(brand: string, dark: string): void {
  const root = document.documentElement
  root.style.setProperty('--brand', brand)
  root.style.setProperty('--brand-dark', dark)
}