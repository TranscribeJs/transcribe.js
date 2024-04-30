declare module '@transcribe/transcriber' {
export type DtwType =
  | "tiny"
  | "base"
  | "small"
  | "tiny.en"
  | "base.en"
  | "small.en";

export type StreamStatus = "loading" | "waiting" | "processing" | "stopped";

export type ExitStatus = {
  name: string;
  message: string;
  status: number;
};

export type TranscribeToken = {
  /** Token id */
  id: number;

  /** Confidence 0..1 */
  p: number;

  /** word level timestamp dtw if enabled */
  dtw?: {
    offset: number;
    /** hh:mm:ss,sss */
    timestamp: string;
  };

  /** Transcribed text. */
  text: string;

  /** Text time offset. */
  offsets: {
    from: number;
    to: number;
  };

  /** Offset as timestamp hh:mm:ss,sss */
  timestamps: {
    /** hh:mm:ss,sss */
    from: string;
    /** hh:mm:ss,sss */
    to: string;
  };
};

type TranscribeSegment = {
  /** Transcribed text. */
  text: string;

  /** Text time offset. */
  offsets: {
    from: number;
    to: number;
  };

  /** Offset as timestamp hh:mm:ss,sss */
  timestamps: {
    /** hh:mm:ss,sss */
    from: string;
    /** hh:mm:ss,sss */
    to: string;
  };

  tokens: TranscribeToken[];
};

export type TranscribeResultSegement = {
  result: {
    /** Language code used by transcriber. */
    language: string;
  };
  segment: TranscribeSegment;
};

export type TranscripeResult = {
  result: {
    /** Language code used by transcriber. */
    language: string;
  };

  /** Transcription results split in segements. */
  transcription: TranscribeSegment[];
};

export type TranscriberOptions = {
  /**
   * Whisper.cpp model file in ggml format.
   * Will fetch if string, otherwise will use the provided file.
   * @see {@link https://huggingface.co/ggerganov/whisper.cpp}
   */
  model: string | File;

  /**
   * Path to shout.wasm.worker.mjs file.
   * If not set, uses the same directory as shout.wasm.js.
   */
  workerPath?: string;

  /**
   * Called on wasm print to stdout.
   *
   * @param {string} message
   */
  print?: (message: string) => void;

  /**
   * Called on wasm print to stderr.
   *
   * @param {string} message
   */
  printErr?: (message: string) => void;

  preInit?: () => void;

  preRun?: () => void;

  onAbort?: () => void;

  onExit?: (exitStatus: ExitStatus) => void;

  /** Used by shout.wasm.js to locate worker.js */
  locateFile?: (file: string) => string;
};

export type FileTranscriberOptions = TranscriberOptions & {
  /**
   * If transcriber should compute word level timestamps using DTW algorithm, specify the type of the model used.
   */
  dtwType?: DtwType;

  /**
   * Called when init is ready.
   */
  onReady?: () => void;

  /**
   * Called on transcriber progress.
   *
   * @param {number} progress 0..100
   */
  onProgress?: (progress: number) => void;

  /**
   * Called when transcription is canceled.
   */
  onCanceled?: () => void;

  /**
   * Called when a new transcribed segment is ready.
   *
   * @param {TranscribeResultSegement} segment
   */
  onSegment?: (segment: TranscribeResultSegement) => void;

  /**
   * Called when transcription is complete.
   *
   * @param {TranscripeResult} result
   */
  onComplete?: (result: TranscripeResult) => void;
};

export type StreamTranscriberOptions = TranscriberOptions & {
  /**
   * Path to the audio worklet scripts (vad.js and buffer.js).
   * Defaults to the ./audio-worklets sub directory from where StreamTranscriber.js gets loaded.
   */
  audioWorkletPath?: string;

  /**
   * Called when init is ready.
   */
  onReady?: () => void;

  /**
   * Called when a new transcription from stream is ready.
   *
   * @param {TranscribeResultSegement} segment
   */
  onSegment?: (segment: TranscribeResultSegement) => void;

  /**
   * Called when stream status changes.
   *
   * @param {StreamStatus} status
   */
  onStreamStatus?: (status: StreamStatus) => void;
};

export type FileTranscribeOptions = {
  /**
   * Language code of the audio, eg. "en"
   * @defaut "auto"
   */
  lang?: string;

  /**
   * Number of threads to use, defaults to max threads available
   */
  threads?: number;

  /**
   * Translate the text to english
   * @default false
   */
  translate?: boolean;

  /**
   * Maximum number of characters in a single segment, 0 for not set
   * @default 0
   */
  max_len?: number;

  /**
   * If true, transcriber will try to split the text on word boundaries
   * @default false
   */
  split_on_word?: boolean;

  /**
   * If true, transcriber will try to suppress non-speech segments
   * @default false
   */
  suppress_non_speech?: boolean;
};

export type StreamStartOptions = {
  /**
   * Language code of the audio, eg. "en"
   */
  lang?: string;

  /**
   * Number of threads to use, defaults to max threads available
   */
  threads?: number;

  /**
   * Translate the text to english
   * @default false
   */
  translate?: boolean;

  /**
   * If true, transcriber will try to suppress non-speech segments
   * @default true
   */
  suppress_non_speech?: boolean;

  /**
   * Maximum number of tokens in a single segment, see whisper.cpp
   * @default 16
   */
  max_tokens?: number;

  /**
   * Audio context buffer size in samples, see whisper.cpp
   * @default 256
   */
  audio_ctx?: number;
};

export type StreamTranscribeOptions = {
  /**
   * Audio in ms to include before the begin of speech detected.
   * @default 200
   */
  preRecordMs?: number;

  /**
   * Maximum record time in ms before calling transcribe (aka. flush buffer).
   * @default 5000
   */
  maxRecordMs?: number;

  /**
   * Minimum time in ms of silence before transcribe is called.
   * @default 500
   */
  minSilenceMs?: number;

  /**
   * Called when there's a change in voice activity.
   */
  onVoiceActivity?: (active: boolean) => void;
};
/**
 * Transcribe audio to text using the whisper.cpp speech-to-text implementation.
 *
 * @class FileTranscriber
 * @extends Transcriber
 */
export class FileTranscriber extends Transcriber {
    /**
     * Create a new FileTranscriber instance.
     *
     * @constructor
     * @param {FileTranscriberOptions} options
     */
    constructor(options: FileTranscriberOptions);
    /**
     * @private
     * @type {DtwType}
     */
    private _dtwType;
    /**
     * Callback when init is ready.
     *
     * @private
     * @type {FileTranscriberOptions.onReady}
     */
    private _onReady;
    /**
     * Callback when transcription is done.
     *
     * @private
     * @type {FileTranscriberOptions.onComplete}
     */
    private _onComplete;
    /**
     * Callback when transcription got canceled.
     *
     * @private
     * @type {FileTranscriberOptions.onCanceled}
     */
    private _onCanceled;
    /**
     * Resolve callback for cancel.
     *
     * @private
     * @type {function(): void | null}
     */
    private _resolveCancel;
    /**
     * Resolve callback for transcribe complete.
     *
     * @private
     * @type {function(): void | null}
     */
    private _resolveComplete;
    /**
     * DTW type.
     *
     * @type {DtwType}
     */
    get dtwType(): DtwType;
    /**
     * Transcribe audio to text.
     *
     * @param {File|string} audio  Audio file or URL.
     * @param {FileTranscribeOptions} [options]
     * @param {string} [options.lang="auto"] Language code.
     * @param {number} [options.threads=this.maxThreads] Number of threads to use.
     * @param {boolean} [options.translate=false] Translate the text.
     * @param {number} [options.max_len=0] Maximum segment length in characters.
     * @param {boolean} [options.split_on_word=false] Split the text on word.
     * @param {boolean} [options.suppress_non_speech=false] Suppress non-speech.
     * @returns {Promise<TranscripeResult>}
     */
    transcribe(audio: File | string, { lang, threads, translate, max_len, split_on_word, suppress_non_speech, }?: FileTranscribeOptions): Promise<TranscripeResult>;
    /**
     * Cancel the transcription. May take some time.
     *
     * @returns {Promise<void>}
     */
    cancel(): Promise<void>;
    /**
     * Just for resolving the cancel promise.
     *
     * @private
     */
    private _onCancel;
    /**
     * Just for resolving the transcribe complete promise.
     *
     * @private
     */
    private _onTranscribed;
    /**
     * Load audio, convert to 16kHz mono.
     *
     * @private
     * @param {File|string} file Audio file or URL
     * @returns {Promise<Float32Array>}
     */
    private _loadAudio;
}
import { Transcriber } from "./src/Transcriber.js";

/**
 * Transcribe an audio stream (e.g microhpone input) to text using the whisper.cpp speech-to-text implementation. This is experimental and not working in Firefox because sample rate conversion with AudioContext is not supported. Also, transcribe.wasm is way to slow for real-time transcription.
 *
 * @class StreamTranscriber
 * @extends Transcriber
 * @experimental
 */
export class StreamTranscriber extends Transcriber {
    /**
     * Create a new StreamTranscriber instance.
     *
     * @constructor
     * @param {StreamTranscriberOptions} options
     */
    constructor(options: StreamTranscriberOptions);
    /**
     * Path to the audio worklet scripts (vad.js and buffer.js).
     */
    _audioWorkletsPath: any;
    /**
     * Callback when init is ready.
     * @private
     * @type {StreamTranscriberOptions.onReady}
     */
    private _onReady;
    /**
     * Is stream transcriber running.
     *
     * @type boolean
     * @private
     */
    private _isStreamRunning;
    /**
     * Audio context for stream transcription.
     *
     * @private
     * @type {AudioContext}
     */
    private _streamAudioContext;
    /**
     * Media source for stream transcription.
     *
     * @private
     * @type {MediaStreamAudioSourceNode}
     */
    private _streamMediaSource;
    /**
     * Stream running state.
     *
     * @param {boolean} state
     */
    get isStreamRunning(): boolean;
    /**
     * Get path to the audio worklet scripts (vad.js and buffer.js).
     *
     * @param {string} filename
     * @param {import.meta} [meta]
     * @returns {string}
     */
    getAudioWorkletPath(filename: string, meta?: any): string;
    /**
     * Start stream transcription.
     *
     * @param {StreamStartOptions} options
     * @param {string} [options.lang="auto"] Language code
     * @param {number} [options.threads=this.maxThreads] Number of threads to use
     * @param {boolean} [options.translate=false] Translate the text
     * @param {boolean} [options.suppress_non_speech=true] Suppress non-speech
     * @param {number} [options.max_tokens=16] Maximum tokens
     * @param {number} [options.audio_ctx=512] Audio context size
     * @returns {Promise<void>}
     */
    start({ lang, threads, translate, suppress_non_speech, max_tokens, audio_ctx, }?: StreamStartOptions): Promise<void>;
    /**
     * Stop stream transcription.
     *
     * @returns {Promise<void>}
     */
    stop(): Promise<void>;
    /**
     * Transcribe stream audio.
     *
     * @param {MediaStream} stream
     * @param {StreamTranscribeOptions} options
     * @param {number} [options.preRecordMs=500] Audio in ms to include before the begin of speech detected.
     * @param {number} [options.maxRecordMs=5000] Maximum record time in ms before calling transcribe (aka. flush buffer).
     * @param {number} [options.minSilenceMs=500] Minimum time in ms of silence before transcribe is called.
     * @param {function (isSpeaking: boolean): void} [options.onVoiceActivity=null] Callback when voice activity detected.
     * @returns {Promise<void>}
     */
    transcribe(stream: MediaStream, { preRecordMs, maxRecordMs, minSilenceMs, onVoiceActivity, }?: StreamTranscribeOptions): Promise<void>;
}
import { Transcriber } from "./src/Transcriber.js";

/**
 * Base class for transcribers.
 */
export class Transcriber {
    /**
     * @constructor
     * @param {TranscriberOptions} options
     */
    constructor(options: TranscriberOptions);
    /**
     * Model file.
     *
     * @private
     * @type {string|File}
     */
    private _model;
    /**
     * Wasm Module.
     *
     * @type {object}
     * */
    Module: object;
    /**
     * Is shout runtime initialized.
     *
     * @private
     * @type boolean
     */
    private _isRuntimeInitialized;
    /**
     * Model filename in wasm filesystem.
     *
     * @private
     * @type {string}
     */
    private _modelFilename;
    /**
     * Filename of the model in wasm filesystem.
     *
     * @type {string}
     */
    get modelInternalFilename(): string;
    /**
     * Model file.
     *
     * @type {string|File}
     */
    get model(): string | File;
    /**
     * Maximum number of threads.
     *
     * @type {number}
     * @default 2
     */
    get maxThreads(): number;
    /**
     * Is runtime initialized.
     *
     * @type {boolean}
     *
     */
    get isRuntimeInitialized(): boolean;
    /**
     * Load model and create a new shout instance.
     */
    init(): Promise<void>;
    /**
     * Write audio data directly to wasm memory and returns pointer.
     * Call this after loading audio.
     * Remember to free the memory after transcribing with `this.Module._free(dataPtr)`.
     *
     * @param {Float32Array} pcmf32 Raw audio data. Must be 16kHz, mono.
     * @param {number} [ptr=null] Pointer to the audio data in wasm memory.
     * @returns {number} Pointer to the audio data in wasm memory.
     */
    writeAudioToMemory(pcmf32: Float32Array, ptr?: number): number;
    /**
     * Free wasm memory and destroy module.
     *
     * @return {void}
     */
    destroy(): void;
    /**
     * Unload model file and free wasm memory.
     *
     * @private
     */
    private _freeWasmModule;
    /**
     * Load model file into wasm filesystem.
     *
     * @private
     * @returns {Promise<void>}
     */
    private _loadModel;
}

/**
 * Load audio file as raw data, convert to [sampleRate] mono.
 *
 * @param {File} file Audio file
 * @param {number} sampleRate Output sample rate
 * @param {boolean} [toMono = false] Convert to mono
 * @returns {Promise<Float32Array|null>}
 */
export function audioFileToPcm32(file: File, sampleRate: number, toMono?: boolean): Promise<Float32Array | null>;
/**
 * Convert buffer to mono.
 *
 * @param {AudioBuffer} buffer
 * @returns {Promise<AudioBuffer>}
 */
export function downmixAudioBufferToMono(buffer: AudioBuffer): Promise<AudioBuffer>;
/**
 * Check if browser is Firefox.
 *
 * @returns {boolean}
 */
export function isFirefox(): boolean;
/**
 * Create VAD (Voice Activity Detection) AudioWorkletNode.
 * Call audioContext.addModule("vad.js") before creating the node.
 *
 * @param {AudioContext} audioContext Audio context
 * @param {CallableFunction} onSpeech Callback when speech detected
 * @param {CallableFunction} onSilence Callback when silence detected
 * @param {number} [minSilence=100] Minimum silence duration before call onSilence, in ms
 * @returns {AudioWorkletNode|null}
 */
export function createVad(audioContext: AudioContext, onSpeech: CallableFunction, onSilence: CallableFunction, minSilence?: number): AudioWorkletNode | null;
/**
 * Create buffer AudioWorkletNode.
 * Call audioContext.addModule("buffer.js") before creating the node.
 *
 * @param {AudioContext} audioContext
 * @param {CallableFunction} onBuffer Called when buffer is full. (samples: Float32Array) => void
 * @param {number} [bufferSizeMs=100]
 * @returns {AudioWorkletNode|null}
 */
export function createBuffer(audioContext: AudioContext, onBuffer: CallableFunction, bufferSizeMs?: number): AudioWorkletNode | null;

}
