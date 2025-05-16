/**
 * Base class for transcribers.
 */
export class Transcriber {
  /**
   * Emscripten createModule function.
   *
   * @protected
   * @type {function}
   */
  _createModule;

  /**
   * Model file.
   *
   * @protected
   * @type {string|File}
   */
  _model = null;

  /**
   * Wasm Module.
   *
   * @type {object}
   * */
  Module = {};

  /**
   * Is shout runtime initialized.
   *
   * @protected
   * @type {boolean}
   */
  _isRuntimeInitialized = false;

  /**
   * Is model file loaded.
   *
   * @protected
   * @type {boolean}
   */
  _isModelFileLoaded = false;

  /**
   * Is everything initialized and ready to transcribe.
   *
   * @protected
   * @type {boolean}
   */
  _isReady = false;

  /**
   * Model filename in wasm filesystem.
   *
   * @protected
   * @type {string}
   */
  _modelFilename = "model.bin";

  /**
   * @constructor
   * @param {import("./types.d.ts").TranscriberOptions} options
   */
  constructor(options) {
    this._createModule = options.createModule;
    this._model = options.model;

    // override Emscripten Module callbacks
    this.Module.print = options.print || console.log;
    this.Module.printErr = options.printErr || console.log;
    this.Module.preInit = options.preInit;
    this.Module.preRun = options.preRun;
    this.Module.onAbort = options.onAbort;
    this.Module.onExit = options.onExit;
    this.Module.onRuntimeInitialized = () => {
      this._isRuntimeInitialized = true;
    };
  }

  /**
   * Filename of the model in wasm filesystem.
   *
   * @type {string}
   */
  get modelInternalFilename() {
    return this._modelFilename;
  }

  /**
   * Model file.
   *
   * @type {string|File}
   */
  get model() {
    return this._model;
  }

  /**
   * Maximum number of threads.
   *
   * @type {number}
   * @default 2
   */
  get maxThreads() {
    // safari always returns 8, so check if it's safari
    if (
      !navigator ||
      navigator.hardwareConcurrency === undefined ||
      /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
    ) {
      return 2;
    } else {
      return navigator.hardwareConcurrency;
    }
  }

  /**
   * Is runtime initialized.
   *
   * @type {boolean}
   *
   */
  get isRuntimeInitialized() {
    return this._isRuntimeInitialized;
  }

  /**
   * Is model file loaded.
   *
   * @type {boolean}
   */
  get isModelFileLoaded() {
    return this._isModelFileLoaded;
  }

  /**
   * True when ready to transcribe.
   *
   * @type {boolean}
   */
  get isReady() {
    return this._isReady;
  }

  /**
   * Load model and create a new shout instance.
   */
  async init() {
    if (this.isRuntimeInitialized && this.isModelFileLoaded) {
      console.log("Shout already initialized.");
      return;
    }

    if (!this.isRuntimeInitialized) {
      this.Module = await this._createModule(this.Module);
    }

    if (!this.isModelFileLoaded) {
      await this._loadModel();
    }
  }

  /**
   * Write audio data directly to wasm memory and returns pointer.
   * Call this after loading audio.
   * Remember to free the memory after transcribing with `this.Module._free(dataPtr)`.
   *
   * @param {Float32Array} pcmf32 Raw audio data. Must be 16kHz, mono.
   * @param {number} [ptr=null] Pointer to the audio data in wasm memory.
   * @returns {number} Pointer to the audio data in wasm memory.
   */
  writeAudioToMemory(pcmf32, ptr = null) {
    let dataPtr = ptr;

    if (dataPtr === null) {
      dataPtr = this.Module._malloc(pcmf32.length * pcmf32.BYTES_PER_ELEMENT);
    }

    const dataHeap = new Uint8Array(
      this.Module.HEAPU8.buffer,
      dataPtr,
      pcmf32.length * pcmf32.BYTES_PER_ELEMENT
    );

    dataHeap.set(new Uint8Array(pcmf32.buffer));

    return dataPtr;
  }

  /**
   * Free wasm memory and destroy module.
   *
   * @return {void}
   */
  destroy() {
    if (!this.isRuntimeInitialized) return;

    //TODO: check if this is enough
    this._freeWasmModule();
    this._model = null;
    this.Module = null;
    this._createModule = null;
  }

  /**
   * Unload model file and free wasm memory.
   *
   * @protected
   */
  _freeWasmModule() {
    if (!this.isRuntimeInitialized) return;

    this.Module.free();

    try {
      this.Module.FS_unlink(this.modelInternalFilename);
    } catch (e) {
      // file doesn't exist, ignore
    }

    this._isRuntimeInitialized = false;
  }

  /**
   * Load model file into wasm filesystem.
   *
   * @protected
   * @returns {Promise<void>}
   */
  async _loadModel() {
    let file;

    if (this.model instanceof File) {
      file = this.model;
      this._modelFilename = file.name;
    } else if (typeof this.model === "string") {
      file = await fetch(this.model);

      if (!file.ok) {
        throw new Error(`Failed to fetch model file: ${file.statusText}`);
      }

      this._modelFilename = this.model.split("/").pop();
    } else {
      throw new Error("Invalid model file.");
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer, 0, arrayBuffer.byteLength);

    // delete if already exists
    try {
      this.Module.FS_unlink(this.modelInternalFilename);
    } catch (e) {
      // file doesn't exist, ignore
    }

    this.Module.FS_createDataFile(
      "/",
      this.modelInternalFilename,
      buffer,
      true,
      true
    );

    this._isModelFileLoaded = true;
  }
}
