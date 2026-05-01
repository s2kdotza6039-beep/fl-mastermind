// Studio Sensei startup tone — synthesized "dojo kiai" (IYAAAH-style shout)
// All Web Audio. No external asset needed.
// Plays once per browser session; gated by a one-time user gesture if the
// browser blocks autoplay.

const SESSION_KEY = "studio-sensei-boot-tone-played";

let armed = false;

export const playSenseiBootTone = async () => {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});

    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);

    // Master envelope — short, punchy
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.55, now + 0.04);
    master.gain.exponentialRampToValueAtTime(0.4, now + 0.55);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);

    // ---- 1. Tonal "shout" body — saw + square stack with a vowel-like formant filter sweep
    const buildVoice = (freq: number, detune: number, gain: number, type: OscillatorType) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g);
      return { o, g };
    };

    // Pitch glide mimics "iyaaah" — rises then drops
    const v1 = buildVoice(180, -8, 0.35, "sawtooth");
    const v2 = buildVoice(180, +8, 0.3, "sawtooth");
    const v3 = buildVoice(360, 0, 0.18, "square");

    [v1, v2, v3].forEach(({ o }) => {
      o.frequency.setValueAtTime(150, now);
      o.frequency.exponentialRampToValueAtTime(310, now + 0.12); // "EE-YAA"
      o.frequency.exponentialRampToValueAtTime(220, now + 0.45);
      o.frequency.exponentialRampToValueAtTime(140, now + 1.2);
    });

    // Vowel formant sweep — bandpass moving from "ee" to "ah"
    const formant = ctx.createBiquadFilter();
    formant.type = "bandpass";
    formant.Q.value = 2.5;
    formant.frequency.setValueAtTime(2400, now);
    formant.frequency.exponentialRampToValueAtTime(900, now + 0.35);
    formant.frequency.exponentialRampToValueAtTime(700, now + 1.1);

    // Mild low-shelf for chest weight
    const chest = ctx.createBiquadFilter();
    chest.type = "lowshelf";
    chest.frequency.value = 220;
    chest.gain.value = 5;

    [v1, v2, v3].forEach(({ g }) => g.connect(formant));
    formant.connect(chest);
    chest.connect(master);

    // ---- 2. Breath / aspiration noise burst at attack
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 3500;
    noiseFilter.Q.value = 0.9;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.35, now + 0.02);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(master);

    // ---- 3. Low boom — dojo impact under the shout
    const boom = ctx.createOscillator();
    boom.type = "sine";
    boom.frequency.setValueAtTime(110, now);
    boom.frequency.exponentialRampToValueAtTime(45, now + 0.35);
    const boomGain = ctx.createGain();
    boomGain.gain.setValueAtTime(0.0001, now);
    boomGain.gain.exponentialRampToValueAtTime(0.6, now + 0.015);
    boomGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    boom.connect(boomGain);
    boomGain.connect(master);

    // ---- Start / stop everything
    [v1.o, v2.o, v3.o].forEach((o) => {
      o.start(now);
      o.stop(now + 1.45);
    });
    noise.start(now);
    noise.stop(now + 0.25);
    boom.start(now);
    boom.stop(now + 0.55);

    // Cleanup
    setTimeout(() => ctx.close().catch(() => {}), 1700);
  } catch {
    /* ignore — audio is non-critical */
  }
};

/**
 * Plays the boot tone once per browser session.
 * Browsers block audio without a user gesture, so on first call we either play
 * immediately (if allowed) or arm a one-time listener for the next click/key press.
 */
export const armSenseiBootTone = () => {
  if (armed) return;
  if (sessionStorage.getItem(SESSION_KEY) === "1") return;
  armed = true;

  const fire = () => {
    sessionStorage.setItem(SESSION_KEY, "1");
    playSenseiBootTone();
    window.removeEventListener("pointerdown", fire);
    window.removeEventListener("keydown", fire);
  };

  // Try to play right away. If the AudioContext can't start without a gesture,
  // browsers will refuse silently and we fall back to the gesture listeners.
  const tryNow = async () => {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const probe = new Ctx();
      const allowed = probe.state === "running";
      await probe.close().catch(() => {});
      if (allowed) {
        fire();
      } else {
        window.addEventListener("pointerdown", fire, { once: false });
        window.addEventListener("keydown", fire, { once: false });
      }
    } catch {
      window.addEventListener("pointerdown", fire, { once: false });
      window.addEventListener("keydown", fire, { once: false });
    }
  };
  tryNow();
};
