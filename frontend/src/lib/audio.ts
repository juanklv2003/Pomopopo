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
  { id: 'arpeggio', label: 'Arpegio' },
  { id: 'chime', label: 'Carillón' },
  { id: 'sunrise', label: 'Amanecer' },
]

export const AMBIENT: AmbientDef[] = [
  { id: 'off', label: 'Sin sonido', icon: 'speaker-none' },
  { id: 'rain', label: 'Lluvia', icon: 'cloud-rain' },
  { id: 'fireplace', label: 'Chimenea', icon: 'fire' },
  { id: 'wind', label: 'Viento', icon: 'wind' },
]

export class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private alarmGain: GainNode | null = null
  private ambientGain: GainNode | null = null
  private ambientNodes: AudioNode[] = []
  private ambientTimer = 0
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
      this.alarmGain = this.ctx.createGain()
      this.alarmGain.gain.value = 1
      this.alarmGain.connect(this.master)
      this.ambientGain = this.ctx.createGain()
      this.ambientGain.gain.value = 0.5
      this.ambientGain.connect(this.master)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  /** Volumen de alarma (0-100) */
  setAlarmVolume(v: number): void {
    this.ensure()
    ;(this.alarmGain as GainNode).gain.value = Math.max(0, Math.min(1, v / 100))
  }

  /** Volumen de ambiente (0-100) */
  setAmbientVolume(v: number): void {
    this.ensure()
    ;(this.ambientGain as GainNode).gain.value = Math.max(0, Math.min(1, v / 100))
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
      case 'arpeggio':
        this.arpeggio()
        break
      case 'chime':
        this.chime()
        break
      case 'sunrise':
        this.sunrise()
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
    const alarmGain = this.alarmGain as GainNode
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
      g.connect(alarmGain)
      osc.start(ctx.currentTime + s.t)
      osc.stop(ctx.currentTime + s.t + s.d + 0.05)
    }
  }

  private digital(): void {
    for (let i = 0; i < 3; i++) {
      this.tone(i % 2 === 0 ? 1760 : 1245, 'square', 0.14, 0.4, i * 200)
    }
  }

  /** Arpegio mayor ascendente (Do-Mi-Sol-Do), brillante y claro. */
  private arpeggio(): void {
    const notes = [523, 659, 784, 1047]
    notes.forEach((f, i) => this.tone(f, 'sine', 0.7, 0.7, i * 130))
  }

  /** Carillón: campanadas superpuestas con caída larga. */
  private chime(): void {
    this.tone(659, 'triangle', 1.6, 0.6)
    this.tone(988, 'triangle', 1.6, 0.5, 140)
    this.tone(1319, 'triangle', 1.8, 0.4, 280)
  }

  /** Amanecer: secuencia suave ascendente para despertar sin sobresaltos. */
  private sunrise(): void {
    const notes = [392, 523, 659, 784]
    notes.forEach((f, i) => this.tone(f, 'sine', 0.9, 0.5, i * 220))
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
    g.connect(this.alarmGain as GainNode)
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
  }

  // ---------------- Sonido ambiente ----------------

  get ambientId(): string {
    return this.currentAmbient
  }

  setAmbient(id: string): void {
    // Migración: el antiguo 'cafe' no sonaba convincente y ahora es 'fireplace'.
    if (id === 'cafe') id = 'fireplace'
    if (id === this.currentAmbient) return
    this.stopAmbient()
    this.currentAmbient = id
    if (id === 'off') return
    const ctx = this.ensure()
    const vol = 0.3
    if (id === 'rain') this.playRain(ctx, vol)
    else if (id === 'fireplace') this.playFireplace(ctx, vol)
    else if (id === 'wind') this.playWind(ctx, vol)
  }

  stopAmbient(): void {
    if (this.ambientTimer) {
      clearInterval(this.ambientTimer)
      this.ambientTimer = 0
    }
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
    g.connect(this.ambientGain as GainNode)
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
    g.connect(this.ambientGain as GainNode)
    src.start()
    lfo.start()
    this.ambientNodes.push(src, hp, g, lfo, lfoGain)
  }

  private playFireplace(ctx: AudioContext, vol: number): void {
    // Base grave y cálida del fuego con ruido marrón filtrado.
    this.loopNoise(ctx, this.brownNoiseBuffer(ctx), 320, vol)
    // Chispas y crepitaciones: estallidos cortos de ruido con filtro aleatorio.
    const spark = this.pinkNoiseBuffer(ctx, 1)
    const target = this.ambientGain as GainNode
    this.ambientTimer = window.setInterval(() => {
      if (Math.random() < 0.4) return
      const src = ctx.createBufferSource()
      src.buffer = spark
      const f = ctx.createBiquadFilter()
      f.type = 'bandpass'
      f.frequency.value = 1200 + Math.random() * 3300
      f.Q.value = 1.2
      const g = ctx.createGain()
      const t = ctx.currentTime
      const peak = vol * (0.5 + Math.random() * 0.9)
      const dur = 0.03 + Math.random() * 0.07
      g.gain.setValueAtTime(peak, t)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      src.connect(f)
      f.connect(g)
      g.connect(target)
      try {
        src.start(t, Math.random() * 0.8, dur + 0.05)
      } catch {
        /* noop */
      }
      src.stop(t + dur + 0.06)
    }, 90)
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