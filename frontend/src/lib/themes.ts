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

export function getTheme(id: string, customColor?: string): Theme {
  if (id === 'custom' && customColor) {
    return { id: 'custom', label: 'Personalizado', brand: customColor, dark: darkenColor(customColor) }
  }
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

export function applyTheme(brand: string, dark: string): void {
  const root = document.documentElement
  root.style.setProperty('--brand', brand)
  root.style.setProperty('--brand-dark', dark)
}

/** Oscurece un color hex un ~35% */
export function darkenColor(hex: string): string {
  const h = hex.replace('#', '')
  const r = Math.max(0, Math.floor(parseInt(h.substring(0, 2), 16) * 0.65))
  const g = Math.max(0, Math.floor(parseInt(h.substring(2, 4), 16) * 0.65))
  const b = Math.max(0, Math.floor(parseInt(h.substring(4, 6), 16) * 0.65))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}