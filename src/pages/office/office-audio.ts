type Ambience = {
  start: () => void;
  stop: () => void;
  dispose: () => void;
};

const C = 261.63;
const D = 293.66;
const E = 329.63;
const F = 349.23;
const G = 392.0;
const A = 440;
const B = 493.88;

const BARS: number[][] = [
  [C, E, G, B],
  [A / 2, C, E, G],
  [F / 2, A / 2, C, E],
  [G / 2, B / 2, D, F],
  [C, E, G, C * 2],
  [A / 2, C, E, A],
  [F / 2, A / 2, C, F],
  [G / 2, B / 2, D, G],
];

const MELODY = [E * 2, D * 2, C * 2, D * 2, E * 2, G * 2, A * 2, G * 2, E * 2, D * 2, C * 2, B, C * 2, E * 2, D * 2, C * 2];

export function createOfficeAmbience(): Ambience {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let piano: GainNode | null = null;
  let timer = 0;
  let stopped = true;
  let step = 0;

  function note(freq: number, when: number, dur: number, peak: number) {
    if (!ctx || !piano) return;
    const partials = [1, 2, 3, 4.02, 5.04];
    const weights = [1, 0.35, 0.16, 0.07, 0.03];
    partials.forEach((ratio, index) => {
      const osc = ctx!.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * ratio;
      const gain = ctx!.createGain();
      const level = Math.max(0.0001, peak * weights[index]);
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(level, when + 0.018);
      gain.gain.exponentialRampToValueAtTime(level * 0.35, when + 0.28);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      osc.connect(gain);
      gain.connect(piano!);
      osc.start(when);
      osc.stop(when + dur + 0.02);
    });
  }

  function loop() {
    if (!ctx || stopped) return;
    const beat = 0.52;
    const start = ctx.currentTime + 0.05;
    for (let bar = 0; bar < 4; bar++) {
      const chord = BARS[(step + bar) % BARS.length];
      const at = start + bar * beat * 4;
      chord.forEach((freq, index) => {
        note(freq, at + index * beat, beat * 3.2, index === 0 ? 0.03 : 0.022);
      });
      const melody = MELODY[(step + bar) % MELODY.length];
      note(melody, at + beat * 1.5, beat * 2.4, 0.02);
    }
    step = (step + 4) % BARS.length;
    timer = window.setTimeout(loop, beat * 4 * 4 * 1000 - 80);
  }

  function ensure() {
    if (ctx && master && piano) return;
    const AudioCtor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    ctx = new AudioCtor();
    master = ctx.createGain();
    master.gain.value = 0.8;
    piano = ctx.createGain();
    piano.gain.value = 1;
    const warm = ctx.createBiquadFilter();
    warm.type = 'lowpass';
    warm.frequency.value = 2400;
    piano.connect(warm);
    warm.connect(master);
    master.connect(ctx.destination);

    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const air = ctx.createBiquadFilter();
    air.type = 'lowpass';
    air.frequency.value = 500;
    const airGain = ctx.createGain();
    airGain.gain.value = 0.008;
    noise.connect(air);
    air.connect(airGain);
    airGain.connect(master);
    noise.start();

    const drone = ctx.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = C / 2;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.01;
    drone.connect(droneGain);
    droneGain.connect(master);
    drone.start();
  }

  function close() {
    stopped = true;
    window.clearTimeout(timer);
    void ctx?.close();
    ctx = null;
    master = null;
    piano = null;
  }

  return {
    start() {
      if (!stopped && ctx) {
        void ctx.resume();
        return;
      }
      stopped = false;
      ensure();
      if (!ctx) return;
      void ctx.resume();
      window.clearTimeout(timer);
      loop();
    },
    stop: close,
    dispose: close,
  };
}
