// Mini temporizador en ventana flotante (Document Picture-in-Picture).
// Mejora progresiva: solo se activa donde la API existe; el resto de
// navegadores sigue con document.title + Notification como respaldo.

export interface PiPSnapshot {
  time: string
  modeLabel: string
  toggleLabel: string
  running: boolean
  brand: string
  brandDark: string
}

interface PiPCallbacks {
  onToggle: () => void
  onClose: () => void
}

// La API Document PiP aun no esta en lib.dom de TypeScript.
interface DocumentPiP {
  readonly window: Window | null
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>
}

function getPiP(): DocumentPiP | null {
  const w = window as Window & { documentPictureInPicture?: DocumentPiP }
  return 'documentPictureInPicture' in window && w.documentPictureInPicture
    ? (w.documentPictureInPicture as DocumentPiP)
    : null
}

export function isPiPSupported(): boolean {
  return getPiP() !== null
}

let pipWindow: Window | null = null
let pipEls: {
  wrap: HTMLElement
  mode: HTMLElement
  time: HTMLElement
  state: HTMLElement
  btn: HTMLButtonElement
  min: HTMLButtonElement
} | null = null
// Estado de minimizado propio de la ventana flotante (persiste entre aperturas).
// Arranca minimizado: la ventana abre directo en barra compacta ~48px.
let pipMinimized = true
// Último snapshot para re-pintar el toggle icono/texto al minimizar/restaurar.
let lastSnapshot: PiPSnapshot | null = null

const PIP_STYLE = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; }
  /* OS window frame stays square: no CSS radius can round it.
     Full-bleed strategy — body paints the brand surface edge-to-edge so no
     light gap exposes the square outer corners. Tried transparent body vs
     solid brand: solid wins, transparent flashes white behind the PiP. */
  html { background: var(--brand, #ba4949); overflow: hidden; }
  body {
    font-family: 'Rubik', 'Helvetica Neue', Arial, sans-serif;
    background:
      radial-gradient(circle at 20% 10%, rgba(255, 255, 255, 0.10), transparent 45%),
      radial-gradient(circle at 85% 90%, rgba(0, 0, 0, 0.14), transparent 50%),
      var(--brand, #ba4949);
    color: #fff;
    display: flex;
    align-items: stretch;
    justify-content: center;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
  }
  /* Wrap fills the viewport with zero outer gap; background stays transparent
     so the body gradient runs seamless edge-to-edge. Radius 0: square
     full-bleed bar to match the square OS frame — no rounded-div look. */
  .pip-wrap {
    position: relative;
    width: 100%;
    min-height: 100%;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: clamp(6px, 2vmin, 12px);
    margin: 0;
    padding: clamp(12px, 4vmin, 24px);
    padding-top: clamp(20px, 6vmin, 32px);
    text-align: center;
    background: transparent;
    border: none;
    border-radius: 0;
    overflow: hidden;
    transition: padding 180ms cubic-bezier(0.4, 0, 0.2, 1), gap 180ms cubic-bezier(0.4, 0, 0.2, 1);
  }
  .pip-mode {
    font-size: clamp(10px, 3.5vmin, 12px);
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.85);
    background: rgba(0, 0, 0, 0.22);
    padding: 3px 12px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pip-time {
    font-size: clamp(28px, 24vmin, 72px);
    line-height: 1.15;
    font-weight: 700;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
  }
  .pip-btn {
    border: none;
    background: #fff;
    color: var(--brand, #ba4949);
    font: inherit;
    font-weight: 700;
    font-size: clamp(12px, 4vmin, 14px);
    padding: 8px 24px;
    border-radius: 10px;
    cursor: pointer;
    max-width: 100%;
    box-shadow: 0 4px 0 rgba(0, 0, 0, 0.15);
    transition: transform 150ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 150ms cubic-bezier(0.4, 0, 0.2, 1), background 150ms cubic-bezier(0.4, 0, 0.2, 1);
  }
  .pip-btn:hover { transform: translateY(-1px); }
  .pip-btn:active { transform: translateY(2px); box-shadow: none; }
  .pip-btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.7);
  }
  .pip-min {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.22);
    background: rgba(0, 0, 0, 0.22);
    color: #fff;
    border-radius: 8px;
    cursor: pointer;
    transition: background 150ms cubic-bezier(0.4, 0, 0.2, 1), transform 150ms cubic-bezier(0.4, 0, 0.2, 1);
  }
  .pip-min:hover { background: rgba(0, 0, 0, 0.34); }
  .pip-min:active { transform: scale(0.94); }
  .pip-min:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.7);
  }
  /* Iconos inline SVG (trazo grueso estilo Phosphor bold, currentColor):
     tamano fijo 14px, el grid los mantiene centrados en el hit-area 28px. */
  .pip-min svg,
  .pip-btn.is-icon svg {
    display: block;
    width: 14px;
    height: 14px;
    flex: 0 0 auto;
  }
  /* Etiqueta de estado compacta: solo visible en barra minimizada.
     Secundaria frente a la hora (hero): texto tenue, una linea, con ellipsis. */
  .pip-state {
    display: none;
    font-size: clamp(10px, 3.5vmin, 11px);
    font-weight: 600;
    letter-spacing: 0.04em;
    line-height: 1.4;
    color: rgba(255, 255, 255, 0.78);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* Estado minimizado: barra compacta horizontal con hora (hero) + estado + pausa.
     A 280px todo compite por ~220px útiles: la hora es el hero, el estado
     muestra solo el modo (una palabra) + punto de actividad, y el toggle es
     icono solo (32px) para no robar ancho al texto. */
  .pip-wrap.minimized {
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
    min-height: 48px;
    max-height: 56px;
    padding: 6px 42px 6px 10px;
  }
  .pip-wrap.minimized .pip-mode { display: none; }
  .pip-wrap.minimized .pip-time { font-size: clamp(20px, 9vmin, 24px); flex: 0 0 auto; }
  .pip-wrap.minimized .pip-state {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1 1 auto;
    min-width: 0;
    max-width: none;
    text-align: left;
  }
  .pip-wrap.minimized .pip-state::before {
    content: '';
    flex: 0 0 auto;
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.45);
  }
  .pip-wrap.minimized .pip-state.is-running::before {
    background: #fff;
    animation: pip-pulse 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }
  @keyframes pip-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.45; transform: scale(0.8); }
  }
  .pip-wrap.minimized .pip-min {
    top: 50%;
    right: 6px;
    margin-top: -14px;
  }
  .pip-wrap.minimized .pip-btn { padding: 6px 14px; font-size: 12px; box-shadow: none; flex: 0 0 auto; }
  .pip-wrap.minimized .pip-btn:active { transform: scale(0.96); }
  /* Toggle icono-solo en minimizado: 32px táctil, sin texto que empuje al estado. */
  .pip-wrap.minimized .pip-btn.is-icon {
    width: 32px;
    height: 32px;
    padding: 0;
    display: grid;
    place-items: center;
    border-radius: 8px;
  }
  @media (prefers-reduced-motion: reduce) {
    .pip-btn, .pip-min, .pip-wrap { transition: none; }
    .pip-wrap.minimized .pip-state.is-running::before { animation: none; }
  }
`

// Copia los estilos del documento principal a la ventana PiP.
// Las hojas entre dominios (Google Fonts) lanzan al leer cssRules:
// se copian como <link> y se sigue con las locales.
function copyStyles(pipDoc: Document): void {
  const links: string[] = []
  let inline = ''
  for (const sheet of Array.from(document.styleSheets)) {
    const href = (sheet as CSSStyleSheet).href
    if (href) {
      links.push(href)
      continue
    }
    try {
      const rules = (sheet as CSSStyleSheet).cssRules
      for (const rule of Array.from(rules)) inline += rule.cssText + '\n'
    } catch {
      // Hoja entre dominios sin href accesible: se omite sin romper.
    }
  }
  for (const href of links) {
    const link = pipDoc.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    pipDoc.head.appendChild(link)
  }
  if (inline) {
    const style = pipDoc.createElement('style')
    style.textContent = inline
    pipDoc.head.appendChild(style)
  }
  const pipStyle = pipDoc.createElement('style')
  pipStyle.textContent = PIP_STYLE
  pipDoc.head.appendChild(pipStyle)
}

// Iconos inline SVG para los botones de la ventana PiP (restaurar, minimizar,
// reproducir, pausar). El documento PiP no hereda de forma fiable las fuentes
// del documento principal, asi que los glifos de texto (↑ – ▶ ❚❚) dependen de
// la fuente del sistema y se ven disparejos; el SVG vectorial rinde identico
// en cualquier plataforma. Trazo grueso con puntas redondas (stroke 2.5,
// round caps) para igualar la estetica Phosphor bold de la app; currentColor
// hereda el color del boton. Los svg son decorativos: el boton conserva
// aria-label/title en espanol.
const PIP_ICONS = {
  up: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="3.5 10.5 8 6 12.5 10.5"/></svg>',
  minus:
    '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true" focusable="false"><line x1="4" y1="8" x2="12" y2="8"/></svg>',
  play: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 3.5v9l6.5-4.5Z"/></svg>',
  pause:
    '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false"><rect x="4.2" y="3.5" width="2.8" height="9" rx="1.4"/><rect x="9" y="3.5" width="2.8" height="9" rx="1.4"/></svg>',
} as const

function applyMinimized(): void {
  if (!pipEls) return
  pipEls.wrap.classList.toggle('minimized', pipMinimized)
  pipEls.min.innerHTML = pipMinimized ? PIP_ICONS.up : PIP_ICONS.minus
  const label = pipMinimized ? 'Restaurar' : 'Minimizar'
  pipEls.min.title = label
  pipEls.min.setAttribute('aria-label', label)
  pipEls.min.setAttribute('aria-expanded', pipMinimized ? 'false' : 'true')
  renderToggle()
}

// En minimizado el toggle es icono-solo (SVG reproducir/pausar) con
// aria-label en español; en expandido conserva el texto completo
// ("Comenzar" / "Pausar").
function renderToggle(): void {
  if (!pipEls || !lastSnapshot) return
  if (pipMinimized) {
    pipEls.btn.innerHTML = lastSnapshot.running ? PIP_ICONS.pause : PIP_ICONS.play
    pipEls.btn.classList.add('is-icon')
  } else {
    pipEls.btn.textContent = lastSnapshot.toggleLabel
    pipEls.btn.classList.remove('is-icon')
  }
  pipEls.btn.title = lastSnapshot.toggleLabel
  pipEls.btn.setAttribute('aria-label', lastSnapshot.toggleLabel)
}

function buildMiniDom(pipDoc: Document, cb: PiPCallbacks): void {
  const wrap = pipDoc.createElement('div')
  wrap.className = 'pip-wrap'
  wrap.innerHTML = `
    <button class="pip-min" type="button" title="Restaurar" aria-label="Restaurar" aria-expanded="false"></button>
    <span class="pip-mode"></span>
    <div class="pip-time"></div>
    <span class="pip-state" aria-live="polite"></span>
    <button class="pip-btn" type="button"></button>`
  pipDoc.body.appendChild(wrap)
  const mode = wrap.querySelector('.pip-mode') as HTMLElement
  const time = wrap.querySelector('.pip-time') as HTMLDivElement
  const state = wrap.querySelector('.pip-state') as HTMLElement
  const btn = wrap.querySelector('.pip-btn') as HTMLButtonElement
  const min = wrap.querySelector('.pip-min') as HTMLButtonElement
  btn.addEventListener('click', cb.onToggle)
  min.addEventListener('click', () => {
    pipMinimized = !pipMinimized
    applyMinimized()
  })
  pipEls = { wrap, mode, time, state, btn, min }
  applyMinimized()
}

// Document PiP title bar always shows the origin (localhost / domain) as
// mandatory anti-spoofing browser chrome — web content CANNOT remove it.
// Customizable: document.title / <title> text shown alongside the origin.
// Not customizable: the origin label itself or the square OS frame.
function setPiPTitle(pipDoc: Document): void {
  let titleEl = pipDoc.querySelector('title')
  if (!titleEl) {
    titleEl = pipDoc.createElement('title')
    pipDoc.head.appendChild(titleEl)
  }
  titleEl.textContent = 'Pomopopo'
  pipDoc.title = 'Pomopopo'
}

function paint(s: PiPSnapshot): void {
  if (!pipWindow || !pipEls) return
  lastSnapshot = s
  const root = pipWindow.document.documentElement
  root.style.setProperty('--brand', s.brand)
  root.style.setProperty('--brand-dark', s.brandDark)
  pipEls.mode.textContent = s.modeLabel
  pipEls.time.textContent = s.time
  // Barra minimizada: solo el modo (legible a 280px) + punto pulsante;
  // el detalle En curso/En pausa vive en title para tooltip sin robar ancho.
  pipEls.state.textContent = s.modeLabel
  pipEls.state.title = `${s.modeLabel} · ${s.running ? 'En curso' : 'En pausa'}`
  pipEls.state.setAttribute('aria-label', `${s.modeLabel} · ${s.running ? 'En curso' : 'En pausa'}`)
  pipEls.state.classList.toggle('is-running', s.running)
  renderToggle()
}

export function isPiPOpen(): boolean {
  return pipWindow !== null && !pipWindow.closed
}

export async function openPiP(cb: PiPCallbacks, initial: PiPSnapshot): Promise<boolean> {
  const pip = getPiP()
  if (!pip) return false
  if (isPiPOpen()) {
    paint(initial)
    return true
  }
  try {
    pipWindow = await pip.requestWindow({ width: 280, height: 180 })
  } catch {
    pipWindow = null
    return false
  }
  copyStyles(pipWindow.document)
  setPiPTitle(pipWindow.document)
  buildMiniDom(pipWindow.document, cb)
  paint(initial)
  pipWindow.addEventListener('pagehide', () => {
    pipWindow = null
    pipEls = null
    lastSnapshot = null
    cb.onClose()
  })
  return true
}

export function closePiP(): void {
  if (pipWindow && !pipWindow.closed) pipWindow.close()
  pipWindow = null
  pipEls = null
  lastSnapshot = null
}

// Sincroniza la ventana flotante; sin efecto si esta cerrada o no hay soporte.
export function pipRender(s: PiPSnapshot): void {
  if (!isPiPOpen()) return
  paint(s)
}
