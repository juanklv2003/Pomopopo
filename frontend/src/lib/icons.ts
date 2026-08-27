// Helper de iconos con la librería Lucide (sin emojis).
import { createIcons } from 'lucide'
import {
  Timer,
  Settings,
  RotateCcw,
  SkipForward,
  ListTodo,
  Plus,
  Minus,
  Check,
  X,
  Bell,
  VolumeX,
  CloudRain,
  Coffee,
  Wind,
} from 'lucide'
import type { IconNode } from 'lucide'

// Mapa de iconos registrados. Las claves deben coincidir con el atributo
// data-lucide (en kebab-case) usado en el HTML.
const ICONS: Record<string, IconNode> = {
  Timer,
  Settings,
  RotateCcw,
  SkipForward,
  ListTodo,
  Plus,
  Minus,
  Check,
  X,
  Bell,
  VolumeX,
  CloudRain,
  Coffee,
  Wind,
}

/**
 * Sustituye todos los elementos `<i data-lucide="...">` por su SVG.
 * Debe llamarse tras cualquier render que introduzca iconos en el DOM.
 */
export function renderIcons(root: ParentNode = document): void {
  createIcons({ icons: ICONS, root: root as HTMLElement })
}
