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
  offsets?: {
    from: number;
    to: number;
  };

  /** Offset as timestamp hh:mm:ss,sss */
  timestamps?: {
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

export type TranscribeResult = {
  result: {
    /** Language code used by transcriber. */
    language: string;
  };

  /** Transcription results split in segements. */
  transcription: TranscribeSegment[];
};

export type TranscriberOptions = {
  /**
   * Emscripten exported createModule function.
   * @see {@link https://emscripten.org/docs/api_reference/module.html}
   *
   * @param {any} moduleArg Used to override module defaults.
   * @returns {Promise<any>} Returns the module object.
   */
  createModule: (moduleArg?: {}) => Promise<any>;

  /**
   * Whisper.cpp model file in ggml format.
   * Will fetch if string, otherwise will use the provided file.
   * @see {@link https://huggingface.co/ggerganov/whisper.cpp}
   */
  model: string | File;

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
   * @param {TranscribeResult} result
   */
  onComplete?: (result: TranscribeResult) => void;
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
   * Number of threads to use, defaults to max threads available.
   */
  threads?: number;

  /**
   * Translate the text to english
   * @default false
   */
  translate?: boolean;

  /**
   * Maximum number of characters in a single segment, 0 for not set.
   * @default 0
   */
  max_len?: number;

  /**
   * If true, transcriber will try to split the text on word boundaries.
   * @default false
   */
  split_on_word?: boolean;

  /**
   * If true, transcriber will try to suppress non-speech segments.
   * @default false
   */
  suppress_non_speech?: boolean;

  /**
   * If true, calculates word level timestamps.
   * @default true
   */
  token_timestamps?: boolean;
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
