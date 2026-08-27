// Motor de audio de Pomopopo usando Web Audio API.
// Las alarmas y los sonidos ambientales se sintetizan, sin necesidad de archivos externos.

export interface AlarmDef {
  id: string
  label: string
}

export interface AmbientDef {
  id: string
  label: string
  icon: string
}

export const ALARMS: AlarmDef[] = [
  { id: 'digital', label: 'Digital' },
  { id: 'bell', label: 'Campana' },
  { id: 'ding', label: 'Dong' },
  { id: 'classic', label: 'Clásico' },
]

export const AMBIENT: AmbientDef[] = [
  { id: 'off', label: 'Sin sonido', icon: 'speaker-none' },
  { id: 'rain', label: 'Lluvia', icon: 'cloud-rain' },
  { id: 'cafe', label: 'Café', icon: 'coffee' },
  { id: 'wind', label: 'Viento', icon: 'wind' },
]

export class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private ambientNodes: AudioNode[] = []
  private currentAmbient = 'off'

  // El AudioContext debe crearse tras un gesto del usuario
  private ensure(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.9
      this.master.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  /** Desbloquea/crea el contexto de audio (debe llamarse en un gesto del usuario). */
  activate(): void {
    this.ensure()
  }

  /** Reproduce el sonido de alarma elegido. */
  playAlarm(id: string): void {
    switch (id) {
      case 'bell':
        this.tone(440, 'sine', 0.5, 0.9)
        this.tone(660, 'sine', 0.5, 0.7, 120)
        break
      case 'ding':
        this.tone(523, 'triangle', 1.4, 0.8)
        this.tone(784, 'triangle', 1.4, 0.6, 60)
        break
      case 'classic':
        this.beepPattern()
        break
      case 'digital':
      default:
        this.digital()
        break
    }
  }

  /** Permite previsualizar una alarma desde ajustes. */
  previewAlarm(id: string): void {
    this.playAlarm(id)
  }

  private beepPattern(): void {
    const ctx = this.ensure()
    const seq = [
      { f: 440, t: 0, d: 0.16 },
      { f: 440, t: 0.2, d: 0.16 },
      { f: 440, t: 0.4, d: 0.16 },
      { f: 620, t: 0.62, d: 0.4 },
    ]
    const master = this.master as GainNode
    for (const s of seq) {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'square'
      osc.frequency.value = s.f
      g.gain.setValueAtTime(0, ctx.currentTime + s.t)
      g.gain.linearRampToValueAtTime(0.5, ctx.currentTime + s.t + 0.02)
      g.gain.setValueAtTime(0.5, ctx.currentTime + s.t + s.d - 0.03)
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + s.t + s.d)
      osc.connect(g)
      g.connect(master)
      osc.start(ctx.currentTime + s.t)
      osc.stop(ctx.currentTime + s.t + s.d + 0.05)
    }
  }

  private digital(): void {
    for (let i = 0; i < 3; i++) {
      this.tone(i % 2 === 0 ? 1760 : 1245, 'square', 0.14, 0.4, i * 200)
    }
  }

  private tone(
    freq: number,
    type: OscillatorType,
    dur: number,
    vol: number,
    delay = 0,
  ): void {
    const ctx = this.ensure()
    const t0 = ctx.currentTime + delay / 1000
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    // Decremento natural (campana/gong)
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(vol, t0 + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g)
    g.connect(this.master as GainNode)
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
  }

  // ---------------- Sonido ambiente ----------------

  get ambientId(): string {
    return this.currentAmbient
  }

  setAmbient(id: string): void {
    if (id === this.currentAmbient) return
    this.stopAmbient()
    this.currentAmbient = id
    if (id === 'off') return
    const ctx = this.ensure()
    const vol = id === 'cafe' ? 0.25 : 0.3
    if (id === 'rain') this.playRain(ctx, vol)
    else if (id === 'cafe') this.playCafe(ctx, vol)
    else if (id === 'wind') this.playWind(ctx, vol)
  }

  stopAmbient(): void {
    this.ambientNodes.forEach((n) => {
      try {
        if ('stop' in n) (n as AudioScheduledSourceNode).stop()
        n.disconnect()
      } catch {
        /* noop */
      }
    })
    this.ambientNodes = []
    this.currentAmbient = 'off'
  }

  private pinkNoiseBuffer(ctx: AudioContext, dur = 2): AudioBuffer {
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate)
    const data = buf.getChannelData(0)
    let b0 = 0
    let b1 = 0
    let b2 = 0
    let white = 0
    for (let i = 0; i < data.length; i++) {
      white = Math.random() * 2 - 1
      b0 = 0.99765 * b0 + white * 0.099046
      b1 = 0.963 * b1 + white * 0.2965164
      b2 = 0.57 * b2 + white * 1.0526913
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.2
    }
    return buf
  }

  private brownNoiseBuffer(ctx: AudioContext, dur = 2): AudioBuffer {
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate)
    const data = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1
      last = (last + 0.02 * white) / 1.02
      data[i] = last * 3.5
    }
    return buf
  }

  private loopNoise(
    ctx: AudioContext,
    buf: AudioBuffer,
    filterFreq: number,
    vol: number,
    type: BiquadFilterType = 'lowpass',
  ): void {
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = filterFreq
    const g = ctx.createGain()
    g.gain.value = vol
    src.connect(f)
    f.connect(g)
    g.connect(this.master as GainNode)
    src.start()
    this.ambientNodes.push(src, f, g)
  }

  private playRain(ctx: AudioContext, vol: number): void {
    this.loopNoise(ctx, this.pinkNoiseBuffer(ctx), 1800, vol)
    const src = ctx.createBufferSource()
    src.buffer = this.pinkNoiseBuffer(ctx, 3)
    src.loop = true
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 4000
    const g = ctx.createGain()
    g.gain.value = vol * 0.4
    // LFO que da el "repiqueteo" de gotas
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.4
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = vol * 0.15
    lfo.connect(lfoGain)
    lfoGain.connect(g.gain)
    src.connect(hp)
    hp.connect(g)
    g.connect(this.master as GainNode)
    src.start()
    lfo.start()
    this.ambientNodes.push(src, hp, g, lfo, lfoGain)
  }

  private playCafe(ctx: AudioContext, vol: number): void {
    this.loopNoise(ctx, this.pinkNoiseBuffer(ctx), 700, vol)
    const pulse = ctx.createBufferSource()
    pulse.buffer = this.pinkNoiseBuffer(ctx, 1.2)
    pulse.loop = true
    const gate = ctx.createGain()
    gate.gain.value = vol * 0.5
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.6
    const lfoG = ctx.createGain()
    lfoG.gain.value = vol * 0.45
    lfo.connect(lfoG)
    lfoG.connect(gate.gain)
    pulse.connect(gate)
    gate.connect(this.master as GainNode)
    pulse.start()
    lfo.start()
    this.ambientNodes.push(pulse, gate, lfo, lfoG)
  }

  private playWind(ctx: AudioContext, vol: number): void {
    this.loopNoise(ctx, this.brownNoiseBuffer(ctx), 500, vol, 'bandpass')
    // oscilación lenta para ondular el viento
    const g = this.ambientNodes[this.ambientNodes.length - 2] as GainNode
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.1
    const lfoG = ctx.createGain()
    lfoG.gain.value = vol * 0.5
    lfo.connect(lfoG)
    lfoG.connect(g.gain)
    lfo.start()
    this.ambientNodes.push(lfo, lfoG)
  }

  dispose(): void {
    this.stopAmbient()
    void this.ctx?.close()
    this.ctx = null
  }
}