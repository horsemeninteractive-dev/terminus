import { ZombieVariant } from '../types/combat';
import mainMenuMusicUrl from '../assets/music/mainmenu.mp3';
import gameplayMusicUrl from '../assets/music/gameplay.mp3';

// ==========================================
// Web Audio Soundscape & Music Engine (§15)
// Dual-track streaming music & procedural SFX
// ==========================================

export interface SoundSettings {
  radioVoiceEnabled?: boolean;
  radioVoiceVolume?: number;
  radioVoiceAssignments?: Record<RadioVoiceCharacter, string>;
  masterVolume: number; // 0.0 to 1.0
  musicVolume: number; // 0.0 to 1.0
  ambientVolume: number; // 0.0 to 1.0
  sfxVolume: number; // 0.0 to 1.0
  muted: boolean;
  musicEnabled: boolean;
  ambientEnabled: boolean;
  sfxEnabled: boolean;
}

const STORAGE_KEY = 'survivor_sound_settings_v1';

export type RadioVoiceCharacter = 'vance' | 'operator' | 'system';

export type ToastKind = 'info' | 'success' | 'warn' | 'danger';

/** A UI notification payload. `notify()` plays the matching chime AND broadcasts
 * this to subscribers so the on-screen toast and its audio cue stay in sync. */
export interface ToastMessage {
  title: string;
  desc: string;
  type: ToastKind;
}

const DEFAULT_RADIO_VOICE_ASSIGNMENTS: Record<RadioVoiceCharacter, string> = {
  vance: '',
  operator: '',
  system: '',
};

function getVoiceForCharacter(character: RadioVoiceCharacter): SpeechSynthesisVoice | undefined {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return undefined;
  const voices = window.speechSynthesis.getVoices();
  const assignedName = soundService.getSettings().radioVoiceAssignments?.[character];
  const englishVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith('en'));
  const preferredIndex = character === 'vance' ? 0 : character === 'operator' ? 1 : 2;
  return voices.find((voice) => voice.name === assignedName)
    || englishVoices[preferredIndex]
    || englishVoices[0]
    || voices[0];
}

function loadSavedSettings(): SoundSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        masterVolume: parsed.masterVolume ?? 0.7,
        musicVolume: parsed.musicVolume ?? 0.65,
        ambientVolume: parsed.ambientVolume ?? 0.55,
        sfxVolume: parsed.sfxVolume ?? 0.75,
        muted: parsed.muted ?? false,
        musicEnabled: parsed.musicEnabled ?? true,
        ambientEnabled: parsed.ambientEnabled ?? true,
        sfxEnabled: parsed.sfxEnabled ?? true,
        radioVoiceEnabled: parsed.radioVoiceEnabled ?? true,
        radioVoiceVolume: parsed.radioVoiceVolume ?? 0.9,
        radioVoiceAssignments: { ...DEFAULT_RADIO_VOICE_ASSIGNMENTS, ...(parsed.radioVoiceAssignments || {}) },
      };
    }
  } catch (e) {
    // Ignore storage errors
  }
  return {
    masterVolume: 0.7,
    musicVolume: 0.65,
    ambientVolume: 0.55,
    sfxVolume: 0.75,
    muted: false,
    musicEnabled: true,
    ambientEnabled: true,
    sfxEnabled: true,
    radioVoiceEnabled: true,
    radioVoiceVolume: 0.9,
    radioVoiceAssignments: DEFAULT_RADIO_VOICE_ASSIGNMENTS,
  };
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private radioGain: GainNode | null = null;

  private settings: SoundSettings = loadSavedSettings();
  private notificationListeners = new Set<(msg: ToastMessage) => void>();
  private isInitialized = false;
  private isInGame = false;

  // Background Music tracks & crossfade state
  private menuMusic: HTMLAudioElement | null = null;
  private gameplayMusic: HTMLAudioElement | null = null;
  private currentTrack: 'none' | 'menu' | 'gameplay' = 'none';
  private fadeInterval: number | null = null;
  private hasUserStarted = false;

  // Ambient nodes
  private windSource: AudioNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;

  private nightDroneOsc1: OscillatorNode | null = null;
  private nightDroneOsc2: OscillatorNode | null = null;
  private nightDroneGain: GainNode | null = null;
  private nightFilter: BiquadFilterNode | null = null;

  // Lair proximity bed: a low infected-murmur layer whose volume tracks how
  // close the nearest DISCOVERED, standing lair is, so a known nest literally
  // sounds alive as a squad approaches it.
  private lairBedGain: GainNode | null = null;
  private lairBedFilter: BiquadFilterNode | null = null;
  private lastLairGroanAt = 0;
  private lairProximity = 0;

  private dangerDroneOsc: OscillatorNode | null = null;
  private dangerGain: GainNode | null = null;
  private dangerFilter: BiquadFilterNode | null = null;

  private pulseInterval: number | null = null;

  // Current ambient state
  private currentPhase: 'dawn' | 'day' | 'dusk' | 'night' = 'day';
  private currentIsNight = false;
  private currentDangerLevel = 0; // 0.0 to 1.0

  // Cooldown timers to prevent audio clipping during high entity counts
  private lastSoundTimes: Map<string, number> = new Map();

  constructor() {
    // Lazy initialization on first user interaction
  }

  private getEffectiveMusicVolume(): number {
    if (this.settings.muted || !this.settings.musicEnabled) return 0;
    return Math.max(0, Math.min(1, this.settings.masterVolume * this.settings.musicVolume));
  }

  private initMusicElements() {
    if (typeof window === 'undefined') return;
    if (!this.menuMusic) {
      this.menuMusic = new Audio(mainMenuMusicUrl);
      this.menuMusic.loop = true;
      this.menuMusic.preload = 'auto';
    }
    if (!this.gameplayMusic) {
      this.gameplayMusic = new Audio(gameplayMusicUrl);
      this.gameplayMusic.loop = true;
      this.gameplayMusic.preload = 'auto';
    }
  }

  private crossfade(
    fadeOutAudio: HTMLAudioElement | null,
    fadeInAudio: HTMLAudioElement | null,
    durationMs: number = 2000
  ) {
    if (this.fadeInterval !== null) {
      clearInterval(this.fadeInterval);
      this.fadeInterval = null;
    }

    const targetVol = this.getEffectiveMusicVolume();

    if (fadeInAudio) {
      fadeInAudio.volume = 0;
      const playPromise = fadeInAudio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {});
      }
    }

    const startTime = Date.now();
    const initialFadeOutVol = fadeOutAudio ? fadeOutAudio.volume : 0;

    this.fadeInterval = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / durationMs);

      if (fadeOutAudio) {
        fadeOutAudio.volume = Math.max(0, initialFadeOutVol * (1 - progress));
      }

      if (fadeInAudio) {
        fadeInAudio.volume = Math.min(1, targetVol * progress);
      }

      if (progress >= 1) {
        if (this.fadeInterval !== null) {
          clearInterval(this.fadeInterval);
          this.fadeInterval = null;
        }
        if (fadeOutAudio) {
          fadeOutAudio.pause();
          fadeOutAudio.volume = 0;
        }
        if (fadeInAudio) {
          fadeInAudio.volume = targetVol;
        }
      }
    }, 30);
  }

  /**
   * Play main menu music with optional cross-fade.
   */
  public playMenuMusic(fade = true, durationMs = 1800) {
    this.initMusicElements();
    if (this.currentTrack === 'menu' && this.menuMusic && !this.menuMusic.paused) {
      this.menuMusic.volume = this.getEffectiveMusicVolume();
      return;
    }

    const previousTrack = this.currentTrack;
    this.currentTrack = 'menu';

    if (!fade || previousTrack === 'none' || !this.gameplayMusic) {
      if (this.fadeInterval !== null) {
        clearInterval(this.fadeInterval);
        this.fadeInterval = null;
      }
      if (this.gameplayMusic) {
        this.gameplayMusic.pause();
        this.gameplayMusic.volume = 0;
      }
      if (this.menuMusic) {
        this.menuMusic.volume = this.getEffectiveMusicVolume();
        const p = this.menuMusic.play();
        if (p !== undefined) p.catch(() => {});
      }
    } else {
      this.crossfade(this.gameplayMusic, this.menuMusic, durationMs);
    }
  }

  /**
   * Play gameplay music with smooth cross-fade from menu music and loop.
   */
  public playGameplayMusic(fade = true, durationMs = 2000) {
    this.initMusicElements();
    if (this.currentTrack === 'gameplay' && this.gameplayMusic && !this.gameplayMusic.paused) {
      this.gameplayMusic.volume = this.getEffectiveMusicVolume();
      return;
    }

    const previousTrack = this.currentTrack;
    this.currentTrack = 'gameplay';

    if (!fade || previousTrack === 'none' || !this.menuMusic) {
      if (this.fadeInterval !== null) {
        clearInterval(this.fadeInterval);
        this.fadeInterval = null;
      }
      if (this.menuMusic) {
        this.menuMusic.pause();
        this.menuMusic.volume = 0;
      }
      if (this.gameplayMusic) {
        this.gameplayMusic.volume = this.getEffectiveMusicVolume();
        const p = this.gameplayMusic.play();
        if (p !== undefined) p.catch(() => {});
      }
    } else {
      this.crossfade(this.menuMusic, this.gameplayMusic, durationMs);
    }
  }

  /**
   * Called when player clicks/taps to start the game on the initial start screen.
   */
  public onUserStart() {
    this.hasUserStarted = true;
    this.init();
    if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
    this.playMenuMusic(false);
  }

  /**
   * Activate or deactivate in-game audio context and cross-fade music.
   * Ambient generators and simulation SFX will ONLY emit when in-game is true.
   */
  public setInGame(inGame: boolean) {
    this.isInGame = inGame;
    // Never create/resume Web Audio from a React effect. Browsers require the
    // context to be created or resumed from a user gesture.
    if (!this.hasUserStarted) return;
    if (!this.isInitialized) {
      this.init();
    }

    // Music transition
    if (this.hasUserStarted) {
      if (inGame) {
        this.playGameplayMusic(true, 2200);
      } else {
        this.playMenuMusic(true, 1800);
      }
    }

    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (!inGame) {
      if (this.windGain) this.windGain.gain.setTargetAtTime(0, now, 0.15);
      if (this.nightDroneGain) this.nightDroneGain.gain.setTargetAtTime(0, now, 0.15);
      if (this.dangerGain) this.dangerGain.gain.setTargetAtTime(0, now, 0.15);
      if (this.lairBedGain) this.lairBedGain.gain.setTargetAtTime(0, now, 0.15);
    } else {
      this.updateAmbient(this.currentPhase, this.currentIsNight, this.currentDangerLevel);
    }
  }

  public init() {
    if (!this.hasUserStarted) return;
    if (this.isInitialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      this.ctx = new AudioContextClass();

      // Master Gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(
        this.settings.muted ? 0 : this.settings.masterVolume,
        this.ctx.currentTime
      );
      this.masterGain.connect(this.ctx.destination);

      // Ambient Bus
      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.setValueAtTime(
        this.settings.ambientEnabled ? this.settings.ambientVolume : 0,
        this.ctx.currentTime
      );
      this.ambientGain.connect(this.masterGain);

      // SFX Bus
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(
        this.settings.sfxEnabled ? this.settings.sfxVolume : 0,
        this.ctx.currentTime
      );
      this.sfxGain.connect(this.masterGain);

      // Speech synthesis is browser-managed, but this bus is retained as the
      // independent radio-volume setting source used by utterances.
      this.radioGain = this.ctx.createGain();
      this.radioGain.gain.setValueAtTime(this.settings.radioVoiceEnabled === false ? 0 : this.settings.radioVoiceVolume ?? 0.9, this.ctx.currentTime);
      this.radioGain.connect(this.masterGain);

      this.initAmbientNodes();
      this.isInitialized = true;
    } catch (err) {
      console.warn('Web Audio initialization error:', err);
    }
  }

  /**
   * Procedural Ambient Sound Generator:
   * 1. Dynamic Wind / Air noise layer with modulating frequency
   * 2. Night drone with dark sub-harmonics
   * 3. Danger tension layer scaling with combat/outbreak threat
   * 4. Lair murmur bed — proximity-driven infected nest ambience
   */
  private initAmbientNodes() {
    if (!this.ctx || !this.ambientGain) return;

    try {
      // 1. Wind Noise Layer (Pink/Brown noise)
      const bufferSize = this.ctx.sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        output[i] *= 0.11;
        b6 = white * 0.115926;
      }

      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      noiseSource.loop = true;

      this.windFilter = this.ctx.createBiquadFilter();
      this.windFilter.type = 'lowpass';
      this.windFilter.frequency.setValueAtTime(260, this.ctx.currentTime);
      this.windFilter.Q.setValueAtTime(1.5, this.ctx.currentTime);

      this.windGain = this.ctx.createGain();
      this.windGain.gain.setValueAtTime(this.isInGame ? 0.18 : 0.0, this.ctx.currentTime);

      noiseSource.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(this.ambientGain);
      noiseSource.start();
      this.windSource = noiseSource;

      // 1b. Lair murmur bed — shares the wind noise buffer through a darker
      // lowpass; gain is driven purely by lair proximity (updateLairAmbient).
      this.lairBedFilter = this.ctx.createBiquadFilter();
      this.lairBedFilter.type = 'lowpass';
      this.lairBedFilter.frequency.setValueAtTime(140, this.ctx.currentTime);
      this.lairBedFilter.Q.setValueAtTime(2.2, this.ctx.currentTime);

      this.lairBedGain = this.ctx.createGain();
      this.lairBedGain.gain.setValueAtTime(0, this.ctx.currentTime);

      const lairNoise = this.ctx.createBufferSource();
      lairNoise.buffer = noiseBuffer;
      lairNoise.loop = true;
      lairNoise.playbackRate.setValueAtTime(0.6, this.ctx.currentTime); // slower = deeper churning
      lairNoise.connect(this.lairBedFilter);
      this.lairBedFilter.connect(this.lairBedGain);
      this.lairBedGain.connect(this.ambientGain);
      lairNoise.start();

      // 2. Night Tension Drone (Dual detuned low oscillators)
      this.nightDroneOsc1 = this.ctx.createOscillator();
      this.nightDroneOsc1.type = 'sawtooth';
      this.nightDroneOsc1.frequency.setValueAtTime(55, this.ctx.currentTime); // A1

      this.nightDroneOsc2 = this.ctx.createOscillator();
      this.nightDroneOsc2.type = 'triangle';
      this.nightDroneOsc2.frequency.setValueAtTime(58.2, this.ctx.currentTime); // Slight dissonance

      this.nightFilter = this.ctx.createBiquadFilter();
      this.nightFilter.type = 'lowpass';
      this.nightFilter.frequency.setValueAtTime(140, this.ctx.currentTime);
      this.nightFilter.Q.setValueAtTime(3.0, this.ctx.currentTime);

      this.nightDroneGain = this.ctx.createGain();
      this.nightDroneGain.gain.setValueAtTime(0.0, this.ctx.currentTime); // Starts muted

      this.nightDroneOsc1.connect(this.nightFilter);
      this.nightDroneOsc2.connect(this.nightFilter);
      this.nightFilter.connect(this.nightDroneGain);
      this.nightDroneGain.connect(this.ambientGain);

      this.nightDroneOsc1.start();
      this.nightDroneOsc2.start();

      // 3. Danger / Combat Sub Drone
      this.dangerDroneOsc = this.ctx.createOscillator();
      this.dangerDroneOsc.type = 'sawtooth';
      this.dangerDroneOsc.frequency.setValueAtTime(43.65, this.ctx.currentTime); // F1

      this.dangerFilter = this.ctx.createBiquadFilter();
      this.dangerFilter.type = 'bandpass';
      this.dangerFilter.frequency.setValueAtTime(110, this.ctx.currentTime);
      this.dangerFilter.Q.setValueAtTime(4.0, this.ctx.currentTime);

      this.dangerGain = this.ctx.createGain();
      this.dangerGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

      this.dangerDroneOsc.connect(this.dangerFilter);
      this.dangerFilter.connect(this.dangerGain);
      this.dangerGain.connect(this.ambientGain);
      this.dangerDroneOsc.start();
    } catch (e) {
      console.warn('Failed to build ambient synth:', e);
    }
  }

  /**
   * Update the dynamic ambient soundscape based on day/night state and calculated danger level
   */
  public updateAmbient(
    phase: 'dawn' | 'day' | 'dusk' | 'night',
    isNight: boolean,
    dangerLevel: number // 0.0 (calm) to 1.0 (extreme threat / horde)
  ) {
    this.currentPhase = phase;
    this.currentIsNight = isNight;
    this.currentDangerLevel = Math.max(0, Math.min(1, dangerLevel));

    if (!this.ctx || !this.isInitialized) return;
    const now = this.ctx.currentTime;

    if (!this.isInGame) {
      if (this.windGain) this.windGain.gain.setTargetAtTime(0, now, 0.15);
      if (this.nightDroneGain) this.nightDroneGain.gain.setTargetAtTime(0, now, 0.15);
      if (this.dangerGain) this.dangerGain.gain.setTargetAtTime(0, now, 0.15);
      return;
    }

    // 1. Wind filter & volume adjustments
    if (this.windFilter && this.windGain) {
      const targetWindFreq = isNight ? 180 + dangerLevel * 140 : 300 + (phase === 'dusk' ? 60 : 0);
      const targetWindGain = isNight ? 0.24 + dangerLevel * 0.15 : 0.15;
      this.windFilter.frequency.setTargetAtTime(targetWindFreq, now, 1.5);
      this.windGain.gain.setTargetAtTime(targetWindGain, now, 1.5);
    }

    // 2. Night drone adjustments
    if (this.nightDroneGain && this.nightFilter) {
      const nightIntensity = isNight ? 0.28 : phase === 'dusk' ? 0.12 : phase === 'dawn' ? 0.06 : 0.0;
      const targetFilter = 120 + dangerLevel * 180;
      this.nightDroneGain.gain.setTargetAtTime(nightIntensity, now, 2.0);
      this.nightFilter.frequency.setTargetAtTime(targetFilter, now, 2.0);
    }

    // 3. Danger drone adjustments (escalates during active combat / outbreaks / horde alerts)
    if (this.dangerGain && this.dangerFilter) {
      const targetDangerGain = dangerLevel * 0.35;
      const targetDangerFreq = 80 + dangerLevel * 140;
      this.dangerGain.gain.setTargetAtTime(targetDangerGain, now, 0.8);
      this.dangerFilter.frequency.setTargetAtTime(targetDangerFreq, now, 0.8);
    }
  }

  /**
   * Proximity bed for DISCOVERED, standing lairs: `lairProximity` 0..1 tracks
   * how close the nearest known nest is (1 = at its doorstep). Drives a low
   * churning murmur so a nest audibly "breathes" as a squad closes in, and
   * schedules distant groans whose cadence quickens with proximity. Volume
   * follows the ambient bus (ambientVolume + ambientEnabled) and is silenced
   * outside the game and for cleared nests.
   */
  public updateLairAmbient(proximity: number) {
    this.lairProximity = Math.max(0, Math.min(1, proximity));
    if (!this.ctx || !this.isInitialized || !this.isInGame) return;
    const now = this.ctx.currentTime;

    if (this.lairBedGain && this.lairBedFilter) {
      const target = this.settings.ambientEnabled && !this.settings.muted
        ? this.lairProximity * this.lairProximity * 0.5
        : 0;
      this.lairBedGain.gain.setTargetAtTime(target, now, 1.2);
      // Rising pitch with proximity: the murmur gets higher/ angrier closer in.
      this.lairBedFilter.frequency.setTargetAtTime(110 + this.lairProximity * 90, now, 1.2);
    }

    // Distant groans: every 9–22s scaled down to 3.5–9s at the doorstep.
    if (
      this.lairProximity > 0.15 &&
      this.settings.ambientEnabled &&
      !this.settings.muted &&
      now - this.lastLairGroanAt > (9 - 5.5 * this.lairProximity) * (0.7 + Math.random() * 0.6)
    ) {
      this.lastLairGroanAt = now;
      this.playLairGroan(this.lairProximity);
    }
  }

  /**
   * A distant infected groan from the nest — deeper and more resonant than the
   * in-combat zombie sounds, as if heard from across the street. `intensity`
   * (0..1, lair proximity) raises volume and opens the filter.
   */
  private playLairGroan(intensity: number) {
    if (!this.ctx || !this.ambientGain) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      const base = 55 + Math.random() * 30; // A1–D2 territory: throat-deep
      osc.frequency.setValueAtTime(base, now);
      osc.frequency.linearRampToValueAtTime(base * (1.15 + Math.random() * 0.2), now + 0.4);
      osc.frequency.exponentialRampToValueAtTime(base * 0.7, now + 1.4);

      // Throat formant filter — opens with proximity so the groan "resolves"
      // from a rumble into a recognisable moan as the squad closes.
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(180 + intensity * 220, now);
      filter.Q.setValueAtTime(4, now);

      // Slow amplitude swell in/out — a distant, wandering groan.
      const gain = this.ctx.createGain();
      const peak = 0.05 + intensity * 0.22;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.5);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.6);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ambientGain);

      osc.start(now);
      osc.stop(now + 1.7);
    } catch {
      // Audio errors are never worth interrupting gameplay for.
    }
  }

  // ==========================================
  // SFX Synthesizers
  // ==========================================

  private canPlaySound(type: string, minIntervalMs: number, requiresInGame = false): boolean {
    if (!this.settings.sfxEnabled || this.settings.muted) return false;
    if (requiresInGame && !this.isInGame) return false;
    const now = Date.now();
    const last = this.lastSoundTimes.get(type) || 0;
    if (now - last < minIntervalMs) return false;
    this.lastSoundTimes.set(type, now);
    return true;
  }

  /**
   * Gunfire SFX: Snappy noise burst with downward pitch transient and resonant crack
   */
  public playGunfire(isCrit = false) {
    if (!this.canPlaySound('gunfire', isCrit ? 60 : 80, true)) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    try {
      const now = this.ctx.currentTime;
      const duration = isCrit ? 0.22 : 0.16;

      // 1. Noise crack
      const bufferSize = Math.floor(this.ctx.sampleRate * duration);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.15));
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = isCrit ? 'bandpass' : 'lowpass';
      filter.frequency.setValueAtTime(isCrit ? 1800 : 1200, now);
      filter.frequency.exponentialRampToValueAtTime(300, now + duration);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(isCrit ? 0.85 : 0.65, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.sfxGain);
      noise.start(now);

      // 2. Low punch thud
      const punchOsc = this.ctx.createOscillator();
      punchOsc.type = 'sine';
      punchOsc.frequency.setValueAtTime(isCrit ? 220 : 160, now);
      punchOsc.frequency.exponentialRampToValueAtTime(45, now + 0.12);

      const punchGain = this.ctx.createGain();
      punchGain.gain.setValueAtTime(isCrit ? 0.7 : 0.5, now);
      punchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      punchOsc.connect(punchGain);
      punchGain.connect(this.sfxGain);
      punchOsc.start(now);
      punchOsc.stop(now + 0.13);
    } catch (e) {
      // Ignore synthesis error
    }
  }

  /**
   * Melee Attack SFX: Quick whoosh swoosh and punchy impact thud
   */
  public playMelee(hit = true) {
    if (!this.canPlaySound('melee', 100, true)) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    try {
      const now = this.ctx.currentTime;

      // Whoosh
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.14);

      const whooshGain = this.ctx.createGain();
      whooshGain.gain.setValueAtTime(0.4, now);
      whooshGain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);

      osc.connect(whooshGain);
      whooshGain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.15);

      // Impact thud
      if (hit) {
        const thudOsc = this.ctx.createOscillator();
        thudOsc.type = 'sine';
        thudOsc.frequency.setValueAtTime(140, now + 0.04);
        thudOsc.frequency.exponentialRampToValueAtTime(35, now + 0.18);

        const thudGain = this.ctx.createGain();
        thudGain.gain.setValueAtTime(0.6, now + 0.04);
        thudGain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

        thudOsc.connect(thudGain);
        thudGain.connect(this.sfxGain);
        thudOsc.start(now + 0.04);
        thudOsc.stop(now + 0.19);
      }
    } catch (e) {}
  }

  /**
   * Per-variant Zombie SFX:
   * - Shambler: Low raspy guttural moan (80Hz -> 65Hz)
   * - Runner: High-pitched screeching frenzy shriek (450Hz-700Hz rapid flutter)
   * - Brute: Deep sub-earthquake roar / slam (45Hz punch with heavy distortion)
   */
  public playZombieSound(variant: ZombieVariant) {
    if (!this.canPlaySound(`zombie_${variant}`, variant === 'brute' ? 400 : 250, true)) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    try {
      const now = this.ctx.currentTime;

      if (variant === 'shambler') {
        // Low guttural moan
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(95, now);
        osc.frequency.linearRampToValueAtTime(110, now + 0.2);
        osc.frequency.exponentialRampToValueAtTime(68, now + 0.6);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(550, now);
        filter.Q.setValueAtTime(3.5, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.35, now + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(now);
        osc.stop(now + 0.66);
      } else if (variant === 'runner') {
        // High screeching shriek
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.linearRampToValueAtTime(740, now + 0.1);
        osc.frequency.exponentialRampToValueAtTime(380, now + 0.45);

        // Tremolo/vibrato LFO
        const lfo = this.ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(28, now);
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.setValueAtTime(60, now);
        lfo.connect(osc.frequency);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(320, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.4, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        lfo.start(now);
        osc.start(now);
        osc.stop(now + 0.46);
        lfo.stop(now + 0.46);
      } else if (variant === 'brute') {
        // Heavy low seismic roar
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(65, now);
        osc.frequency.exponentialRampToValueAtTime(32, now + 0.8);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(220, now);
        filter.Q.setValueAtTime(4.0, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.65, now + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(now);
        osc.stop(now + 0.86);
      }
    } catch (e) {}
  }

  /**
   * Alert SFX: Horde Warning Siren / Klaxon
   */
  public playHordeWarning() {
    if (!this.canPlaySound('alert_horde', 800, true)) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    try {
      const now = this.ctx.currentTime;

      // 2-Stage Klaxon Sweep (440Hz -> 880Hz -> 440Hz)
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.linearRampToValueAtTime(880, now + 0.35);
      osc.frequency.linearRampToValueAtTime(440, now + 0.7);
      osc.frequency.linearRampToValueAtTime(880, now + 1.05);
      osc.frequency.linearRampToValueAtTime(440, now + 1.4);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(650, now);
      filter.Q.setValueAtTime(2.0, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.55, now + 0.08);
      gain.gain.setValueAtTime(0.55, now + 1.2);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.45);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);

      // Low warning undertone
      const subOsc = this.ctx.createOscillator();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(90, now);
      const subGain = this.ctx.createGain();
      subGain.gain.setValueAtTime(0.4, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.45);

      subOsc.connect(subGain);
      subGain.connect(this.sfxGain);

      osc.start(now);
      subOsc.start(now);
      osc.stop(now + 1.46);
      subOsc.stop(now + 1.46);
    } catch (e) {}
  }

  /**
   * Alert SFX: Outbreak Detected Bio-hazard Staccato Alarm
   */
  public playOutbreakAlert() {
    if (!this.canPlaySound('alert_outbreak', 800, true)) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    try {
      const now = this.ctx.currentTime;
      // Staccato dual-tone alternating alert pulses (920Hz / 640Hz)
      const tones = [920, 640, 920, 640, 920];
      const step = 0.12;

      tones.forEach((freq, idx) => {
        const tStart = now + idx * step;
        const osc = this.ctx!.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, tStart);

        const gain = this.ctx!.createGain();
        gain.gain.setValueAtTime(0.45, tStart);
        gain.gain.exponentialRampToValueAtTime(0.001, tStart + step * 0.85);

        osc.connect(gain);
        gain.connect(this.sfxGain!);

        osc.start(tStart);
        osc.stop(tStart + step * 0.9);
      });
    } catch (e) {}
  }

  /**
   * Key UI Action SFX: Building Placed / Adapted / Built
   * Satisfying solid hammer thud + metallic clamp lock
   */
  public playBuildingPlaced() {
    if (!this.canPlaySound('ui_build', 100)) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    try {
      const now = this.ctx.currentTime;

      // Heavy wood/stone settling thud
      const thudOsc = this.ctx.createOscillator();
      thudOsc.type = 'sine';
      thudOsc.frequency.setValueAtTime(180, now);
      thudOsc.frequency.exponentialRampToValueAtTime(45, now + 0.25);

      const thudGain = this.ctx.createGain();
      thudGain.gain.setValueAtTime(0.7, now);
      thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      thudOsc.connect(thudGain);
      thudGain.connect(this.sfxGain);
      thudOsc.start(now);
      thudOsc.stop(now + 0.26);

      // Metallic tool ratchet / clamp click
      const clickOsc = this.ctx.createOscillator();
      clickOsc.type = 'sawtooth';
      clickOsc.frequency.setValueAtTime(1400, now + 0.05);
      clickOsc.frequency.exponentialRampToValueAtTime(600, now + 0.18);

      const clickFilter = this.ctx.createBiquadFilter();
      clickFilter.type = 'bandpass';
      clickFilter.frequency.setValueAtTime(1200, now + 0.05);

      const clickGain = this.ctx.createGain();
      clickGain.gain.setValueAtTime(0.5, now + 0.05);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      clickOsc.connect(clickFilter);
      clickFilter.connect(clickGain);
      clickGain.connect(this.sfxGain);
      clickOsc.start(now + 0.05);
      clickOsc.stop(now + 0.19);
    } catch (e) {}
  }

  /**
   * Key UI Action SFX: Recruitment Encounter Resolved / New Survivors Join
   * Uplifting resonant harmonic chime chord (D4-F#4-A4-D5)
   */
  public playRecruitmentResolved() {
    if (!this.canPlaySound('ui_recruit', 200)) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    try {
      const now = this.ctx.currentTime;
      // D Major arpeggio notes (D4: 293.66, F#4: 369.99, A4: 440, D5: 587.33)
      const freqs = [293.66, 369.99, 440.0, 587.33];

      freqs.forEach((freq, i) => {
        const tStart = now + i * 0.09;
        const osc = this.ctx!.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, tStart);

        const gain = this.ctx!.createGain();
        gain.gain.setValueAtTime(0.35, tStart);
        gain.gain.exponentialRampToValueAtTime(0.001, tStart + 0.65);

        osc.connect(gain);
        gain.connect(this.sfxGain!);

        osc.start(tStart);
        osc.stop(tStart + 0.7);
      });
    } catch (e) {}
  }

  /**
   * Building Repair SFX: Quick wrench / metal hammer taps
   */
  public playRepairSound() {
    if (!this.canPlaySound('ui_repair', 120)) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    try {
      const now = this.ctx.currentTime;
      [0, 0.08].forEach((offset) => {
        const osc = this.ctx!.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, now + offset);
        osc.frequency.exponentialRampToValueAtTime(320, now + offset + 0.06);

        const gain = this.ctx!.createGain();
        gain.gain.setValueAtTime(0.3, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.06);

        osc.connect(gain);
        gain.connect(this.sfxGain!);

        osc.start(now + offset);
        osc.stop(now + offset + 0.07);
      });
    } catch (e) {}
  }

  /**
   * Construction hammer / sawing SFX
   */
  public playConstruction() {
    this.playBuildingPlaced();
  }

  /**
   * Tactical radio chirp / squelch SFX
   */
  public playRadioChirp() {
    if (!this.canPlaySound('ui_radio', 150)) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(2400, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.06);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.065);
    } catch (e) {}
  }

  /**
   * Tactical UI Click SFX
   */
  public playClick() {
    if (!this.canPlaySound('ui_click', 40)) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(700, now + 0.035);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(now);
      osc.stop(now + 0.04);
    } catch (e) {}
  }

  /**
   * Subtle Button Hover SFX (rate-limited)
   */
  public playHover() {
    if (!this.canPlaySound('ui_hover', 45)) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2600, now);
      osc.frequency.exponentialRampToValueAtTime(2200, now + 0.015);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(now);
      osc.stop(now + 0.018);
    } catch (e) {}
  }

  // ==========================================
  // Time Control SFX (§ UI Sounds)
  // ==========================================

  /**
   * Time Pause: Mechanical dampener stop click + low-pitch cutoff
   */
  public playTimePause() {
    if (!this.canPlaySound('ui_time_pause', 80)) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    try {
      const now = this.ctx.currentTime;

      // 1. High crisp mechanical tick
      const tick = this.ctx.createOscillator();
      tick.type = 'triangle';
      tick.frequency.setValueAtTime(1600, now);
      tick.frequency.exponentialRampToValueAtTime(500, now + 0.025);

      const tickGain = this.ctx.createGain();
      tickGain.gain.setValueAtTime(0.22, now);
      tickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

      tick.connect(tickGain);
      tickGain.connect(this.sfxGain);
      tick.start(now);
      tick.stop(now + 0.03);

      // 2. Low-mid dampening cutoff tone
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now + 0.01);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.09);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.25, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + 0.01);
      osc.stop(now + 0.095);
    } catch (e) {}
  }

  /**
   * Time Resume: Energetic snap and rising release chirp
   */
  public playTimeResume() {
    if (!this.canPlaySound('ui_time_resume', 80)) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    try {
      const now = this.ctx.currentTime;

      // 1. Snappy rising chirp
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(1050, now + 0.06);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.065);

      // 2. Subtle high shimmer click
      const click = this.ctx.createOscillator();
      click.type = 'triangle';
      click.frequency.setValueAtTime(1400, now + 0.02);
      click.frequency.exponentialRampToValueAtTime(2200, now + 0.05);

      const clickGain = this.ctx.createGain();
      clickGain.gain.setValueAtTime(0.12, now + 0.02);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      click.connect(clickGain);
      clickGain.connect(this.sfxGain);
      click.start(now + 0.02);
      click.stop(now + 0.055);
    } catch (e) {}
  }

  /**
   * Time Speed Change: Distinct stepped frequency blips
   */
  public playTimeSpeed(speed: number) {
    if (!this.canPlaySound('ui_time_speed', 70)) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    try {
      const now = this.ctx.currentTime;

      if (speed === 0) {
        this.playTimePause();
        return;
      }

      if (speed === 1) {
        // Single crisp 1x blip
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(780, now);
        osc.frequency.exponentialRampToValueAtTime(920, now + 0.04);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.045);
      } else if (speed === 2) {
        // Double rising blip for 2x
        [0, 0.04].forEach((offset, idx) => {
          const osc = this.ctx!.createOscillator();
          osc.type = 'sine';
          const freq = idx === 0 ? 840 : 1120;
          osc.frequency.setValueAtTime(freq, now + offset);
          osc.frequency.exponentialRampToValueAtTime(freq * 1.15, now + offset + 0.035);

          const gain = this.ctx!.createGain();
          gain.gain.setValueAtTime(0.18, now + offset);
          gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.035);

          osc.connect(gain);
          gain.connect(this.sfxGain!);
          osc.start(now + offset);
          osc.stop(now + offset + 0.04);
        });
      } else {
        // Triple fast blip for 3x / 4x
        [0, 0.03, 0.06].forEach((offset, idx) => {
          const osc = this.ctx!.createOscillator();
          osc.type = 'sine';
          const freq = 840 + idx * 300;
          osc.frequency.setValueAtTime(freq, now + offset);
          osc.frequency.exponentialRampToValueAtTime(freq * 1.1, now + offset + 0.028);

          const gain = this.ctx!.createGain();
          gain.gain.setValueAtTime(0.16, now + offset);
          gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.028);

          osc.connect(gain);
          gain.connect(this.sfxGain!);
          osc.start(now + offset);
          osc.stop(now + offset + 0.032);
        });
      }
    } catch (e) {}
  }

  // ==========================================
  // Panel, Drawer & Modal SFX
  // ==========================================

  /**
   * Panel / Modal Open: High-tech smooth tactical slide whoosh + soft harmonic ping
   */
  public playPanelOpen() {
    if (!this.canPlaySound('ui_panel_open', 60)) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    try {
      const now = this.ctx.currentTime;

      // 1. Soft atmospheric bandpass noise sweep
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.16);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * 0.4;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(320, now);
      filter.frequency.exponentialRampToValueAtTime(1100, now + 0.14);
      filter.Q.setValueAtTime(2.2, now);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.01, now);
      noiseGain.gain.linearRampToValueAtTime(0.18, now + 0.05);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.sfxGain);
      noise.start(now);

      // 2. Crisp tactical CRT / HUD harmonic ping
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(940, now + 0.02);
      osc.frequency.exponentialRampToValueAtTime(1380, now + 0.12);

      const oscGain = this.ctx.createGain();
      oscGain.gain.setValueAtTime(0.14, now + 0.02);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.connect(oscGain);
      oscGain.connect(this.sfxGain);
      osc.start(now + 0.02);
      osc.stop(now + 0.16);
    } catch (e) {}
  }

  /**
   * Panel / Modal Close: Crisp descending dismiss click & tactile seal
   */
  public playPanelClose() {
    if (!this.canPlaySound('ui_panel_close', 60)) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    try {
      const now = this.ctx.currentTime;

      // 1. Soft descending filtered noise
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.12);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * 0.3;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(950, now);
      filter.frequency.exponentialRampToValueAtTime(260, now + 0.11);
      filter.Q.setValueAtTime(2.0, now);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.15, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.sfxGain);
      noise.start(now);

      // 2. Mechanical latch click
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(680, now);
      osc.frequency.exponentialRampToValueAtTime(240, now + 0.06);

      const oscGain = this.ctx.createGain();
      oscGain.gain.setValueAtTime(0.16, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(oscGain);
      oscGain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.065);
    } catch (e) {}
  }

  /**
   * Tactical Edge Drawer Open / Slide Out
   */
  public playDrawerOpen() {
    if (!this.canPlaySound('ui_drawer_open', 60)) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    try {
      const now = this.ctx.currentTime;

      // Pneumatic sliding hiss
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.15);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * 0.35;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(450, now);
      filter.frequency.linearRampToValueAtTime(1400, now + 0.13);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.01, now);
      noiseGain.gain.linearRampToValueAtTime(0.18, now + 0.05);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.sfxGain);
      noise.start(now);

      // Deployment click at the end
      const click = this.ctx.createOscillator();
      click.type = 'triangle';
      click.frequency.setValueAtTime(1200, now + 0.1);
      click.frequency.exponentialRampToValueAtTime(600, now + 0.14);

      const clickGain = this.ctx.createGain();
      clickGain.gain.setValueAtTime(0.18, now + 0.1);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      click.connect(clickGain);
      clickGain.connect(this.sfxGain);
      click.start(now + 0.1);
      click.stop(now + 0.145);
    } catch (e) {}
  }

  /**
   * Tactical Edge Drawer Close / Collapse
   */
  public playDrawerClose() {
    if (!this.canPlaySound('ui_drawer_close', 60)) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    try {
      const now = this.ctx.currentTime;

      // Mechanical lock clamp
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(750, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.07);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.075);
    } catch (e) {}
  }

  /**
   * Tab Switch SFX: Crisp tactile micro-click
   */
  public playTabSwitch() {
    if (!this.canPlaySound('ui_tab', 40)) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1850, now);
      osc.frequency.exponentialRampToValueAtTime(1250, now + 0.03);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.035);
    } catch (e) {}
  }

  /**
   * Toggle Switch SFX (state-aware)
   */
  public playToggle(active = true) {
    if (!this.canPlaySound('ui_toggle', 40)) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      if (active) {
        osc.frequency.setValueAtTime(650, now);
        osc.frequency.exponentialRampToValueAtTime(1300, now + 0.04);
      } else {
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(550, now + 0.04);
      }

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.045);
    } catch (e) {}
  }

  // ==========================================
  // Tactical Target Acquisition & Selection SFX
  // ==========================================

  /**
   * Building Selection: Resonant structural radar scan ping
   */
  public playBuildingSelect() {
    if (!this.canPlaySound('ui_building_select', 80)) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    try {
      const now = this.ctx.currentTime;

      // Resonant structural ping
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(640, now);
      osc.frequency.exponentialRampToValueAtTime(860, now + 0.03);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.12);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.125);
    } catch (e) {}
  }

  /**
   * Squad Selection: Military comms / tactical squad squelch blip
   */
  public playSquadSelect() {
    if (!this.canPlaySound('ui_squad_select', 80)) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    try {
      const now = this.ctx.currentTime;

      const osc1 = this.ctx.createOscillator();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(920, now);
      osc1.frequency.setValueAtTime(1380, now + 0.035);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc1.connect(gain);
      gain.connect(this.sfxGain);
      osc1.start(now);
      osc1.stop(now + 0.085);
    } catch (e) {}
  }

  /**
   * Vehicle Selection: Mechanical engine standby / ignition blip
   */
  public playVehicleSelect() {
    if (!this.canPlaySound('ui_vehicle_select', 80)) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    try {
      const now = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.linearRampToValueAtTime(260, now + 0.07);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(450, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.085);
    } catch (e) {}
  }

  /**
   * Resource Node Selection: Material scanner ping
   */
  public playResourceNodeSelect() {
    if (!this.canPlaySound('ui_resource_select', 80)) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1180, now);
      osc.frequency.exponentialRampToValueAtTime(1560, now + 0.04);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.105);
    } catch (e) {}
  }

  // ==========================================
  // Notification & Toast Chimes
  // ==========================================

  /**
   * Toast Notification SFX (by category)
   */
  public playToastSound(type: ToastKind) {
    if (!this.canPlaySound('ui_toast', 100)) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    try {
      const now = this.ctx.currentTime;

      if (type === 'success') {
        // Ascending 3-note harmonic arpeggio
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, i) => {
          const osc = this.ctx!.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + i * 0.045);

          const gain = this.ctx!.createGain();
          gain.gain.setValueAtTime(0.18, now + i * 0.045);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.045 + 0.22);

          osc.connect(gain);
          gain.connect(this.sfxGain!);
          osc.start(now + i * 0.045);
          osc.stop(now + i * 0.045 + 0.24);
        });
      } else if (type === 'danger') {
        // Urgent double warble alert
        [0, 0.09].forEach((offset) => {
          const osc = this.ctx!.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(950, now + offset);
          osc.frequency.linearRampToValueAtTime(650, now + offset + 0.07);

          const filter = this.ctx!.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(1400, now + offset);

          const gain = this.ctx!.createGain();
          gain.gain.setValueAtTime(0.25, now + offset);
          gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.075);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(this.sfxGain!);
          osc.start(now + offset);
          osc.stop(now + offset + 0.08);
        });
      } else if (type === 'warn') {
        // Dissonant caution dual-tone
        [587.33, 622.25].forEach((freq) => {
          const osc = this.ctx!.createOscillator();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now);
          osc.frequency.exponentialRampToValueAtTime(freq * 0.9, now + 0.12);

          const gain = this.ctx!.createGain();
          gain.gain.setValueAtTime(0.18, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

          osc.connect(gain);
          gain.connect(this.sfxGain!);
          osc.start(now);
          osc.stop(now + 0.13);
        });
      } else {
        // 'info' - Pleasant 2-tone chime
        [659.25, 880].forEach((freq, i) => {
          const osc = this.ctx!.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + i * 0.06);

          const gain = this.ctx!.createGain();
          gain.gain.setValueAtTime(0.16, now + i * 0.06);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.18);

          osc.connect(gain);
          gain.connect(this.sfxGain!);
          osc.start(now + i * 0.06);
          osc.stop(now + i * 0.06 + 0.2);
        });
      }
    } catch (e) {}
  }

  // Dedupe window for identical notifications (ms). Several game systems push
  // their events from inside a React state updater; React StrictMode (dev)
  // double-invokes updaters, so the SAME event can reach notify() twice within
  // milliseconds — previously producing doubled toasts AND doubled chimes (e.g.
  // LAIR ESCALATION pairs). Identical events more than DEDUPE_WINDOW_MS apart are
  // legitimate repeats (a lair re-escalates every 120s) and still fire.
  private static readonly DEDUPE_WINDOW_MS = 1200;
  private readonly lastNotifyAt = new Map<string, number>();

  /**
   * Queue a UI notification: plays the matching chime AND broadcast the message
   * to subscribers. The notification tray subscribes to this event bus, so the
   * on-screen toast and its audio cue are driven by the single source and can
   * never fall out of sync. Even when SFX/mute gates silence the chime, the
   * message is still broadcast so the UI toast still appears.
   */
  public notify(msg: ToastMessage) {
    const key = `${msg.type}|${msg.title}|${msg.desc}`;
    const now = Date.now();
    const last = this.lastNotifyAt.get(key);
    if (last !== undefined && now - last < SoundEngine.DEDUPE_WINDOW_MS) {
      return; // duplicate of an event already announced this instant — skip
    }
    if (this.lastNotifyAt.size > 128) {
      for (const [k, t] of this.lastNotifyAt) {
        if (now - t > 10000) this.lastNotifyAt.delete(k);
      }
    }
    this.lastNotifyAt.set(key, now);
    this.playToastSound(msg.type);
    this.notificationListeners.forEach((cb) => {
      try {
        cb(msg);
      } catch {}
    });
  }

  /** Subscribe to UI notification events. Returns an unsubscribe function. */
  public onNotification(cb: (msg: ToastMessage) => void): () => void {
    this.notificationListeners.add(cb);
    return () => {
      this.notificationListeners.delete(cb);
    };
  }

  /**
   * Tech Research Tree Data Unlock Chime
   */
  public playTechUnlock() {
    if (!this.canPlaySound('ui_tech_unlock', 150)) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    try {
      const now = this.ctx.currentTime;
      const notes = [440, 554.37, 659.25, 880, 1108.73, 1318.5];
      notes.forEach((freq, i) => {
        const osc = this.ctx!.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.04);

        const gain = this.ctx!.createGain();
        gain.gain.setValueAtTime(0.16, now + i * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.25);

        osc.connect(gain);
        gain.connect(this.sfxGain!);
        osc.start(now + i * 0.04);
        osc.stop(now + i * 0.04 + 0.28);
      });
    } catch (e) {}
  }

  /**
   * Medical Bed / Healing SFX: Sterile vital monitor pulse
   */
  public playHealSound() {
    if (!this.canPlaySound('ui_heal', 100)) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, now);
      osc.frequency.setValueAtTime(1318.5, now + 0.05);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.18);
    } catch (e) {}
  }

  public playHarvestWood() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.12);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.13);
    } catch (e) {}
  }

  // ==========================================
  // Settings & Controls
  // ==========================================

  public getSettings(): SoundSettings {
    return { ...this.settings };
  }

  /**
   * Cinematic Start Game Impact: Deep sub-bass drop with rising tactical frequency
   */
  public playStartGameImpact() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    try {
      const now = this.ctx.currentTime;

      // 1. Deep Sub Bass Impact
      const subOsc = this.ctx.createOscillator();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(140, now);
      subOsc.frequency.exponentialRampToValueAtTime(32, now + 1.2);

      const subGain = this.ctx.createGain();
      subGain.gain.setValueAtTime(0.8, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.3);

      subOsc.connect(subGain);
      subGain.connect(this.sfxGain);
      subOsc.start(now);
      subOsc.stop(now + 1.35);

      // 2. Rising Tactical Harmonic Layer
      const harmOsc = this.ctx.createOscillator();
      harmOsc.type = 'sawtooth';
      harmOsc.frequency.setValueAtTime(80, now + 0.05);
      harmOsc.frequency.linearRampToValueAtTime(220, now + 0.6);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(250, now);
      filter.frequency.linearRampToValueAtTime(800, now + 0.6);

      const harmGain = this.ctx.createGain();
      harmGain.gain.setValueAtTime(0.01, now + 0.05);
      harmGain.gain.linearRampToValueAtTime(0.35, now + 0.3);
      harmGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

      harmOsc.connect(filter);
      filter.connect(harmGain);
      harmGain.connect(this.sfxGain);
      harmOsc.start(now + 0.05);
      harmOsc.stop(now + 0.85);
    } catch (e) {}
  }

  /**
   * Intro sequence logo transition whoosh and spatial tone
   */
  public playLogoWhoosh() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    try {
      const now = this.ctx.currentTime;

      // Soft spatial whoosh
      const bufferSize = this.ctx.sampleRate * 0.4;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(300, now);
      filter.frequency.linearRampToValueAtTime(700, now + 0.2);
      filter.frequency.linearRampToValueAtTime(200, now + 0.4);
      filter.Q.setValueAtTime(3.0, now);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.01, now);
      noiseGain.gain.linearRampToValueAtTime(0.25, now + 0.15);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.sfxGain);
      noise.start(now);

      // Low resonant hum
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.5);

      const oscGain = this.ctx.createGain();
      oscGain.gain.setValueAtTime(0.2, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      osc.connect(oscGain);
      oscGain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.52);
    } catch (e) {}
  }

  /**
   * Tactical telemetry confirmation chirp
   */
  public playTacticalBeep() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1320, now + 0.05);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.13);
    } catch (e) {}
  }

  public setMasterVolume(vol: number) {
    this.updateSettings({ masterVolume: Math.max(0, Math.min(1, vol)) });
  }

  public playCombatActionSFX(action: string) {
    this.init();
    if (action.includes('fire') || action.includes('assault') || action.includes('shot')) {
      this.playGunfire();
    } else if (action.includes('build') || action.includes('adapt') || action.includes('construct')) {
      this.playBuildingPlaced();
    } else if (action.includes('repair')) {
      this.playRepairSound();
    } else if (action.includes('warning') || action.includes('horde') || action.includes('alarm')) {
      this.playHordeWarning();
    } else if (action.includes('recruit') || action.includes('survivor')) {
      this.playRecruitmentResolved();
    } else {
      this.playClick();
    }
  }  public async speakRadioLine(text: string, character: RadioVoiceCharacter = 'system'): Promise<void> {
    if (!text || this.settings.muted || this.settings.radioVoiceEnabled === false) return;
    if (!this.hasUserStarted || typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const speak = () => {
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = getVoiceForCharacter(character);
      // SpeechSynthesis volume is already independently controlled; do not
      // attenuate radio lines by the legacy master bus. Apply a small boost
      // through the browser's normalized volume range and keep clipping out.
      utterance.volume = Math.max(0, Math.min(1, (this.settings.radioVoiceVolume ?? 0.9) * 1.25));
      utterance.rate = character === 'operator' ? 1.05 : character === 'vance' ? 0.9 : 0.96;
      utterance.pitch = character === 'vance' ? 0.78 : character === 'operator' ? 1.08 : 0.92;
      if (voice) utterance.voice = voice;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    };
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) {
      window.setTimeout(speak, 250);
      return;
    }
    speak();
    return;

    /*
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = getVoiceForCharacter(character);
    if (voice) utterance.voice = voice;
    utterance.volume = Math.max(0, Math.min(1, this.settings.masterVolume * (this.settings.radioVoiceVolume ?? 0.9)));
    utterance.rate = character === 'operator' ? 1.05 : 0.96;
    utterance.pitch = character === 'vance' ? 0.78 : character === 'operator' ? 1.08 : 0.92;

    // Edge populates voices asynchronously. Retry after the browser exposes them.
    if (window.speechSynthesis.getVoices().length === 0) {
      const speakWhenReady = () => {
        window.speechSynthesis.removeEventListener('voiceschanged', speakWhenReady);
        const retryVoice = getVoiceForCharacter(character);
        if (retryVoice) utterance.voice = retryVoice;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      };
      window.speechSynthesis.addEventListener('voiceschanged', speakWhenReady);
      window.setTimeout(speakWhenReady, 500);
      return;
    }
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    */
  }

  public updateSettings(newSettings: Partial<SoundSettings>) {
    this.settings = { ...this.settings, ...newSettings };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch (e) {}

    // Adjust music volume live
    const targetMusicVol = this.getEffectiveMusicVolume();
    if (this.fadeInterval === null) {
      if (this.currentTrack === 'menu' && this.menuMusic) {
        this.menuMusic.volume = targetMusicVol;
        if (targetMusicVol > 0 && this.menuMusic.paused && this.hasUserStarted) {
          this.menuMusic.play().catch(() => {});
        }
      } else if (this.currentTrack === 'gameplay' && this.gameplayMusic) {
        this.gameplayMusic.volume = targetMusicVol;
        if (targetMusicVol > 0 && this.gameplayMusic.paused && this.hasUserStarted) {
          this.gameplayMusic.play().catch(() => {});
        }
      }
    }

    if (this.ctx && this.masterGain && this.ambientGain && this.sfxGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.setTargetAtTime(
        this.settings.muted ? 0 : this.settings.masterVolume,
        now,
        0.05
      );
      this.ambientGain.gain.setTargetAtTime(
        this.settings.ambientEnabled && !this.settings.muted ? this.settings.ambientVolume : 0,
        now,
        0.05
      );
      this.sfxGain.gain.setTargetAtTime(
        this.settings.sfxEnabled && !this.settings.muted ? this.settings.sfxVolume : 0,
        now,
        0.05
      );
      if (this.radioGain) {
        this.radioGain.gain.setTargetAtTime(
          this.settings.radioVoiceEnabled !== false && !this.settings.muted ? (this.settings.radioVoiceVolume ?? 0.9) : 0,
          now,
          0.05
        );
      }
    }
  }

  public toggleMute(): boolean {
    this.updateSettings({ muted: !this.settings.muted });
    return this.settings.muted;
  }
}

export const soundService = new SoundEngine();
export const soundEngine = soundService;
