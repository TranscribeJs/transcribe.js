import { Transcriber } from "./Transcriber.js";
import { audioFileToPcm32 } from "./utils.js";

/**
 * Transcribe audio to text using the whisper.cpp speech-to-text implementation.
 *
 * @class FileTranscriber
 * @extends Transcriber
 */
export class FileTranscriber extends Transcriber {
  /**
   * @private
   * @type {import("./types.d.ts").DtwType}
   */
  _dtwType = "";

  /**
   * VAD model file.
   *
   * @private
   * @type {string|File|null}
   */
  _vadModel = null;

  /**
   * VAD model filename in wasm filesystem.
   *
   * @private
   * @type {string}
   */
  _vadModelFilename = "vad-model.bin";

  /**
   * Is VAD model file loaded.
   *
   * @private
   * @type {boolean}
   */
  _isVadModelFileLoaded = false;

  /**
   * Callback when init is ready.
   *
   * @private
   * @type {import("./types.d.ts").FileTranscriberOptions.onReady}
   */
  _onReady = () => {};

  /**
   * Callback when transcription is done.
   *
   * @private
   * @type {import("./types.d.ts").FileTranscriberOptions.onComplete}
   */
  _onComplete = () => {};

  /**
   * Callback when transcription got canceled.
   *
   * @private
   * @type {import("./types.d.ts").FileTranscriberOptions.onCanceled}
   */
  _onCanceled = () => {};

  /**
   * Resolve callback for cancel.
   *
   * @private
   * @type {function(): void | null}
   */
  _resolveCancel = null;

  /**
   * Resolve callback for transcribe complete.
   *
   * @private
   * @type {function(): void | null}
   */
  _resolveComplete = null;

  /**
   * Create a new FileTranscriber instance.
   *
   * @constructor
   * @param {import("./types.d.ts").FileTranscriberOptions} options
   */
  constructor(options) {
    super(options);

    this._dtwType = options.dtwType ?? "";
    this._vadModel = options.vadModel ?? null;
    this._onReady = options.onReady ?? (() => {});

    this.onComplete = options.onComplete;
    this.onCanceled = options.onCanceled;
    this.onProgress = options.onProgress;
    this.onSegment = options.onSegment;

    this.Module.onTranscribed = this._onTranscribed.bind(this);
    this.Module.onCanceled = this._onCancel.bind(this);
  }

  /**
   * DTW type.
   *
   * @type {DtwType}
   */
  get dtwType() {
    return this._dtwType;
  }

  /**
   * VAD model file.
   *
   * @type {string|File|null}
   */
  get vadModel() {
    return this._vadModel;
  }

  /**
   * Filename of the VAD model in wasm filesystem.
   *
   * @type {string}
   */
  get vadModelInternalFilename() {
    return this._vadModelFilename;
  }

  /**
   * Is VAD model file loaded.
   *
   * @type {boolean}
   */
  get isVadModelFileLoaded() {
    return this._isVadModelFileLoaded;
  }

  /**
   * Called when transcription is complete.
   *
   * @type {import("./types.d.ts").FileTranscriberOptions.onComplete}
   */
  set onComplete(callback = () => {}) {
    this._onComplete = callback;
  }

  /**
   * Called when transcription is canceled.
   *
   * @type {import("./types.d.ts").FileTranscriberOptions.onCanceled}
   */
  set onCanceled(callback = () => {}) {
    this._onCanceled = callback;
  }

  /**
   * Called on transcriber progress.
   *
   * @type {import("./types.d.ts").FileTranscriberOptions.onProgress}
   */
  set onProgress(callback = () => {}) {
    this.Module.onProgress = callback;
  }

  /**
   * Called when a new transcribed segment is ready.
   *
   * @type {import("./types.d.ts").FileTranscriberOptions.onSegment}
   */
  set onSegment(callback = () => {}) {
    this.Module.onNewSegment = callback;
  }

  /**
   * Load model and create a new shout instance.
   */
  async init() {
    await super.init();

    if (this.vadModel && !this.isVadModelFileLoaded) {
      await this._loadVadModel();
    }

    // Module.init() may return a Promise when the WebGPU build
    await Promise.resolve(
      this.Module.init(this.modelInternalFilename, this.dtwType),
    );

    this._onReady();
    this._isReady = true;
  }

  /**
   * Load VAD model file into wasm filesystem.
   *
   * @private
   * @returns {Promise<void>}
   */
  async _loadVadModel() {
    this._vadModelFilename = await this._loadModelFile(
      this.vadModel,
      this._vadModelFilename,
    );

    this._isVadModelFileLoaded = true;
  }

  /**
   * Unload model files and free wasm memory.
   *
   * @protected
   */
  _freeWasmModule() {
    super._freeWasmModule();

    if (this.isVadModelFileLoaded) {
      try {
        this.Module.FS_unlink(this.vadModelInternalFilename);
      } catch (e) {
        // file doesn't exist, ignore
      }

      this._isVadModelFileLoaded = false;
    }
  }

  /**
   * Transcribe audio to text.
   *
   * @param {File|string} audio  Audio file or URL.
   * @param {import("./types.d.ts").FileTranscribeOptions} [options]
   * @param {string} [options.lang="auto"] Language code.
   * @param {number} [options.threads=this.maxThreads] Number of threads to use.
   * @param {boolean} [options.translate=false] Translate the text.
   * @param {number} [options.max_len=0] Maximum segment length in characters.
   * @param {boolean} [options.split_on_word=false] Split the text on word.
   * @param {boolean} [options.suppress_non_speech=false] Suppress non-speech.
   * @param {boolean} [options.token_timestamps=true] Calculate token timestamps.
   * @param {boolean} [options.vad=false] Use VAD to only transcribe speech segments. Requires `vadModel` to be set in the constructor.
   * @param {number} [options.vad_threshold=0.5] VAD speech probability threshold.
   * @param {number} [options.vad_min_speech_duration_ms=250] Minimum speech segment duration in ms.
   * @param {number} [options.vad_min_silence_duration_ms=100] Minimum silence duration in ms to end a speech segment.
   * @param {number} [options.vad_max_speech_duration_s=Infinity] Maximum speech segment duration in seconds.
   * @param {number} [options.vad_speech_pad_ms=30] Padding added before/after detected speech segments in ms.
   * @param {number} [options.vad_samples_overlap=0.1] Overlap in seconds between speech segments.
   * @returns {Promise<import("./types.d.ts").TranscribeResult>}
   */
  async transcribe(
    audio,
    {
      lang = "auto",
      threads = this.maxThreads,
      translate = false,
      max_len = 0,
      split_on_word = false,
      suppress_non_speech = false,
      token_timestamps = true,
      vad = false,
      vad_threshold = 0.5,
      vad_min_speech_duration_ms = 250,
      vad_min_silence_duration_ms = 100,
      vad_max_speech_duration_s = Infinity,
      vad_speech_pad_ms = 30,
      vad_samples_overlap = 0.1,
    } = {},
  ) {
    if (!this.isReady) {
      throw new Error("FileTranscriber not initialized.");
    }

    if (threads > this.maxThreads) {
      console.warn(
        `Number of threads (${threads}) exceeds hardware concurrency (${this.maxThreads}).`,
      );
    }

    if (vad && !this.isVadModelFileLoaded) {
      throw new Error(
        "The vad option requires a vadModel to be provided in the FileTranscriber constructor.",
      );
    }

    const audioPcm = await this._loadAudio(audio);

    return new Promise((resolve) => {
      this._resolveComplete = resolve;

      this.Module.transcribe(
        audioPcm,
        lang,
        threads,
        translate,
        max_len,
        split_on_word,
        suppress_non_speech,
        token_timestamps,
        vad,
        vad ? this.vadModelInternalFilename : "",
        vad_threshold,
        vad_min_speech_duration_ms,
        vad_min_silence_duration_ms,
        vad_max_speech_duration_s,
        vad_speech_pad_ms,
        vad_samples_overlap,
      );
    });
  }

  /**
   * Cancel the transcription. May take some time.
   *
   * @returns {Promise<void>}
   */
  async cancel() {
    if (!this.isRuntimeInitialized) return;

    return new Promise((resolve) => {
      const is_running = this.Module.cancel();

      if (!is_running) {
        resolve();
      } else {
        this._resolveCancel = resolve;
      }
    });
  }

  /**
   * Free wasm module and clean up callbacks.
   */
  destroy() {
    super.destroy();
    this._onReady = null;
    this._onComplete = null;
    this._onCanceled = null;
    this._resolveCancel = null;
    this._resolveComplete = null;
    this._isReady = false;
  }

  /**
   * Just for resolving the cancel promise.
   *
   * @private
   */
  _onCancel() {
    if (typeof this._resolveCancel === "function") {
      this._resolveCancel();
      this._resolveCancel = null;
    }

    this._onCanceled();
  }

  /**
   * Just for resolving the transcribe complete promise.
   *
   * @private
   */
  _onTranscribed(result) {
    if (typeof this._resolveComplete === "function") {
      this._resolveComplete(result);
      this._resolveComplete = null;
    }

    this._onComplete(result);
  }

  /**
   * Load audio, convert to 16kHz mono.
   *
   * @private
   * @param {File|string} file Audio file or URL
   * @returns {Promise<Float32Array>}
   */
  async _loadAudio(file) {
    let audioFile;

    if (typeof file === "string") {
      audioFile = await fetch(file);

      if (!audioFile.ok) {
        throw new Error(`Failed to fetch audio file: ${file}`);
      }
    } else {
      audioFile = file;
    }

    return await audioFileToPcm32(audioFile, 16000, true);
  }
}
