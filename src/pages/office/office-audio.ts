type Ambience = {
  start: () => void;
  stop: () => void;
  dispose: () => void;
};

const SCALE = [220, 261.63, 293.66, 329.63, 392];

export function createOfficeAmbience(): Ambience {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let timer = 0;
  let stopped = true;

  function tone(freq: number, when: number, dur: number, peak: number, type: OscillatorType) {
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(peak, when + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }

  function keys(when: number) {
    if (!ctx || !master) return;
    for (let i = 0; i < 3; i++) {
      const t = when + i * 0.11;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 150 + Math.random() * 110;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 680;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.005, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.028);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + 0.04);
    }
  }

  function loop() {
    if (!ctx || stopped) return;
    const now = ctx.currentTime;
    [0, 2, 4, 2, 3, 1, 4, 0].forEach((step, i) => {
      tone(SCALE[step], now + i * 0.68, 1.25, i % 4 === 0 ? 0.03 : 0.018, 'triangle');
    });
    keys(now + 0.3);
    keys(now + 2.6);
    timer = window.setTimeout(loop, 5600);
  }

  function ensure() {
    if (ctx && master) return;
    const AudioCtor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    ctx = new AudioCtor();
    master = ctx.createGain();
    master.gain.value = 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 10;
    comp.ratio.value = 2;
    master.connect(comp);
    comp.connect(ctx.destination);

    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 280;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.012;
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(master);
    noise.start();

    const drone = ctx.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = 110;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.011;
    drone.connect(droneGain);
    droneGain.connect(master);
    drone.start();
  }

  return {
    start() {
      stopped = false;
      ensure();
      if (!ctx) return;
      void ctx.resume();
      window.clearTimeout(timer);
      loop();
    },
    stop() {
      stopped = true;
      window.clearTimeout(timer);
      void ctx?.suspend();
    },
    dispose() {
      stopped = true;
      window.clearTimeout(timer);
      void ctx?.close();
      ctx = null;
      master = null;
    },
  };
}
