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
  btn: HTMLButtonElement
  min: HTMLButtonElement
} | null = null
// Estado de minimizado propio de la ventana flotante (persiste entre aperturas).
// Arranca minimizado: la ventana abre directo en barra compacta ~48px.
let pipMinimized = true

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
    font: inherit;
    font-size: 16px;
    font-weight: 700;
    line-height: 1;
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
  /* Estado minimizado: barra compacta horizontal solo con hora + pausa. */
  .pip-wrap.minimized {
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 12px;
    min-height: 48px;
    padding: 8px 48px 8px 12px;
  }
  .pip-wrap.minimized .pip-mode { display: none; }
  .pip-wrap.minimized .pip-time { font-size: clamp(20px, 9vmin, 28px); }
  .pip-wrap.minimized .pip-btn { padding: 6px 14px; font-size: 12px; box-shadow: none; }
  .pip-wrap.minimized .pip-btn:active { transform: scale(0.96); }
  @media (prefers-reduced-motion: reduce) {
    .pip-btn, .pip-min, .pip-wrap { transition: none; }
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

function applyMinimized(): void {
  if (!pipEls) return
  pipEls.wrap.classList.toggle('minimized', pipMinimized)
  pipEls.min.textContent = pipMinimized ? '▢' : '–'
  const label = pipMinimized ? 'Restaurar' : 'Minimizar'
  pipEls.min.title = label
  pipEls.min.setAttribute('aria-label', label)
  pipEls.min.setAttribute('aria-expanded', pipMinimized ? 'false' : 'true')
}

function buildMiniDom(pipDoc: Document, cb: PiPCallbacks): void {
  const wrap = pipDoc.createElement('div')
  wrap.className = 'pip-wrap'
  wrap.innerHTML = `
    <button class="pip-min" type="button" title="Restaurar" aria-label="Restaurar" aria-expanded="false">▢</button>
    <span class="pip-mode"></span>
    <div class="pip-time"></div>
    <button class="pip-btn" type="button"></button>`
  pipDoc.body.appendChild(wrap)
  const mode = wrap.querySelector('.pip-mode') as HTMLElement
  const time = wrap.querySelector('.pip-time') as HTMLDivElement
  const btn = wrap.querySelector('.pip-btn') as HTMLButtonElement
  const min = wrap.querySelector('.pip-min') as HTMLButtonElement
  btn.addEventListener('click', cb.onToggle)
  min.addEventListener('click', () => {
    pipMinimized = !pipMinimized
    applyMinimized()
  })
  pipEls = { wrap, mode, time, btn, min }
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
  const root = pipWindow.document.documentElement
  root.style.setProperty('--brand', s.brand)
  root.style.setProperty('--brand-dark', s.brandDark)
  pipEls.mode.textContent = s.modeLabel
  pipEls.time.textContent = s.time
  pipEls.btn.textContent = s.toggleLabel
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
    cb.onClose()
  })
  return true
}

export function closePiP(): void {
  if (pipWindow && !pipWindow.closed) pipWindow.close()
  pipWindow = null
  pipEls = null
}

// Sincroniza la ventana flotante; sin efecto si esta cerrada o no hay soporte.
export function pipRender(s: PiPSnapshot): void {
  if (!isPiPOpen()) return
  paint(s)
}
