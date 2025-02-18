import { createBuffer, createVad } from "./utils.js";
import { Transcriber } from "./Transcriber.js";

/**
 * Transcribe an audio stream (e.g microhpone input) to text using the whisper.cpp speech-to-text implementation. This is experimental and not working in Firefox because sample rate conversion with AudioContext is not supported. Also, transcribe.wasm is way to slow for real-time transcription.
 *
 * @class StreamTranscriber
 * @extends Transcriber
 * @experimental
 */
export class StreamTranscriber extends Transcriber {
  /**
   * Path to the audio worklet scripts (vad.js and buffer.js).
   */
  _audioWorkletsPath;

  /**
   * Callback when init is ready.
   * @private
   * @type {import("./types.d.ts").StreamTranscriberOptions.onReady}
   */
  _onReady = () => {};

  /**
   * Is stream transcriber running.
   *
   * @type boolean
   * @private
   */
  _isStreamRunning = false;

  /**
   * Audio context for stream transcription.
   *
   * @private
   * @type {AudioContext}
   */
  _streamAudioContext = null;

  /**
   * Media source for stream transcription.
   *
   * @private
   * @type {MediaStreamAudioSourceNode}
   */
  _streamMediaSource = null;

  /**
   * Create a new StreamTranscriber instance.
   *
   * @constructor
   * @param {import("./types.d.ts").StreamTranscriberOptions} options
   */
  constructor(options) {
    super(options);

    this._onReady = options.onReady ?? (() => {});
    this._audioWorkletsPath =
      options.audioWorkletsPath?.trim().replace(/\/$/, "") ?? "";

    // worker commands called from wasm
    this.onSegment = options.onSegment;
    this.onStreamStatus = options.onStreamStatus;
  }

  /**
   * Stream running state.
   *
   * @param {boolean} state
   */
  get isStreamRunning() {
    return this._isStreamRunning;
  }

  /**
   * Called when a new transcription from stream is ready.
   *
   * @type {import("./types.d.ts").StreamTranscriberOptions.onSegment}
   */
  set onSegment(callback = () => {}) {
    this.Module.onStreamTranscription = callback;
  }

  /**
   * Called when stream status changes.
   *
   * @type {import("./types.d.ts").StreamTranscriberOptions.onStreamStatus}
   */
  set onStreamStatus(callback = () => {}) {
    this.Module.onStreamStatus = callback;
  }

  /**
   * Get path to the audio worklet scripts (vad.js and buffer.js).
   *
   * @param {string} filename
   * @param {URL|string} [baseUrl=import.meta.url]
   * @returns {string}
   */
  getAudioWorkletPath(filename, baseUrl = import.meta?.url) {
    if (this._audioWorkletsPath) {
      return `${this._audioWorkletsPath}/${filename}`;
    } else if (baseUrl) {
      const url = new URL(`audio-worklets/${filename}`, baseUrl);
      return url.href;
    } else {
      throw new Error("Cannot determine audio worklet path.");
    }
  }

  /**
   * Load model and create a new shout instance.
   *
   * @return {Promise<void>}
   */
  async init() {
    await super.init();

    // create audio context for stream transcription
    this._streamAudioContext = new AudioContext({
      sampleRate: 16000,
      channelCount: 1,
      echoCancellation: false,
      autoGainControl: true,
      noiseSuppression: true,
    });

    await this._streamAudioContext.suspend();
    await this._streamAudioContext.audioWorklet.addModule(
      this.getAudioWorkletPath("vad.js")
    );
    await this._streamAudioContext.audioWorklet.addModule(
      this.getAudioWorkletPath("buffer.js")
    );

    this._onReady();
    this._isReady = true;
  }

  /**
   * Start stream transcription.
   *
   * @param {import("./types.d.ts").StreamStartOptions} options
   * @param {string} [options.lang="auto"] Language code
   * @param {number} [options.threads=this.maxThreads] Number of threads to use
   * @param {boolean} [options.translate=false] Translate the text
   * @param {boolean} [options.suppress_non_speech=true] Suppress non-speech
   * @param {number} [options.max_tokens=16] Maximum tokens
   * @param {number} [options.audio_ctx=512] Audio context size
   * @returns {Promise<void>}
   */
  async start({
    lang = "auto",
    threads = this.maxThreads,
    translate = false,
    suppress_non_speech = true,
    max_tokens = 32,
    audio_ctx = 756,
  } = {}) {
    if (this.isStreamRunning) {
      console.log("Stream already running.");
      return;
    }

    if (threads > this.maxThreads) {
      console.warn(
        `Number of threads (${threads}) exceeds hardware concurrency (${this.maxThreads}).`
      );
    }

    // leave at least 1 thread for audio worklet
    threads = threads - 1 > 0 ? threads - 1 : 1;
    await this._streamAudioContext.resume();

    this.Module.startStream(
      this.modelInternalFilename,
      lang,
      threads,
      translate,
      max_tokens,
      audio_ctx,
      suppress_non_speech
    );

    this._isStreamRunning = true;
  }

  /**
   * Stop stream transcription.
   *
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.isStreamRunning) {
      console.log("Stream not running.");
      return;
    }

    await this._streamAudioContext?.suspend();
    this._streamMediaSource?.disconnect();
    this.Module.stopStream();
    this._isStreamRunning = false;
  }

  /**
   * Transcribe stream audio.
   *
   * @param {MediaStream} stream
   * @param {import("./types.d.ts").StreamTranscribeOptions} options
   * @param {number} [options.preRecordMs=500] Audio in ms to include before the begin of speech detected.
   * @param {number} [options.maxRecordMs=5000] Maximum record time in ms before calling transcribe (aka. flush buffer).
   * @param {number} [options.minSilenceMs=500] Minimum time in ms of silence before transcribe is called.
   * @param {function (isSpeaking: boolean): void} [options.onVoiceActivity=null] Callback when voice activity detected.
   * @returns {Promise<void>}
   */
  async transcribe(
    stream,
    {
      preRecordMs = 1000,
      maxRecordMs = 10000,
      minSilenceMs = 700,
      onVoiceActivity = null,
    } = {}
  ) {
    if (!this.isStreamRunning) {
      console.log("Stream not running.");
      return;
    }

    if (!stream.active) {
      console.log("Stream not active.");
      return;
    }

    try {
      let chunks = [];
      let isSpeaking = false;

      const preRecordSamplesCnt =
        (preRecordMs * this._streamAudioContext.sampleRate) / 1000;

      const maxRecordSamplesCnt =
        (maxRecordMs * this._streamAudioContext.sampleRate) / 1000;

      this._streamMediaSource =
        this._streamAudioContext.createMediaStreamSource(stream);

      // Buffer
      function onBuffer(pcm32f) {
        if (pcm32f.length <= 0) return;

        if (!isSpeaking) {
          // transcribe if is silence and smth is buffered
          if (chunks.length > preRecordSamplesCnt + pcm32f.length) {
            this.Module.setStreamAudio(new Float32Array(chunks));
          }

          // keep some samples before speech detected
          if (chunks.length > preRecordSamplesCnt) {
            chunks = chunks.slice(-(preRecordSamplesCnt - pcm32f.length));
          }
          chunks.push(...pcm32f);
        } else {
          // add to buffer while speaking
          chunks.push(...pcm32f);

          // transcribe if buffer is full
          if (chunks.length > maxRecordSamplesCnt) {
            this.Module.setStreamAudio(new Float32Array(chunks));
            chunks = chunks.slice(-(preRecordSamplesCnt - pcm32f.length));
          }
        }
      }

      const buffer = createBuffer(
        this._streamAudioContext,
        onBuffer.bind(this),
        100 // buffer size in ms
      );

      this._streamMediaSource.connect(buffer);

      // VAD
      function onSpeech() {
        isSpeaking = true;
        onVoiceActivity?.(isSpeaking);
      }

      function onSilence() {
        isSpeaking = false;
        onVoiceActivity?.(isSpeaking);
      }

      const vad = createVad(
        this._streamAudioContext,
        onSpeech,
        onSilence,
        minSilenceMs
      );
      this._streamMediaSource.connect(vad);
    } catch (error) {
      console.log(error);
    }
  }

  destroy() {
    super.destroy();
    this._streamAudioContext?.close();
    this._onReady = null;
    this._isReady = false;
  }
}
