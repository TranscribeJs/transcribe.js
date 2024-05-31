import { FileTranscriber } from "../src/FileTranscriber";
import { expect, describe, it, vi } from "vitest";
import createModule from "./mocks/shout";

describe("FileTranscriber", () => {
  const model = new File([""], "modelFilename.bin");
  model.arrayBuffer = vi.fn(() => Promise.resolve(new ArrayBuffer(8)));

  describe("constructor", () => {
    it("should set the options and initialize the transcriber module", () => {
      // Arrange
      const options = {
        model: "model",
        onReady: vi.fn(),
        onComplete: vi.fn(),
        onCanceled: vi.fn(),
        dtwType: "tiny",
        onProgress: vi.fn(),
        onSegment: vi.fn(),
      };

      // Act
      const transcriber = new FileTranscriber(options);

      // Assert
      expect(transcriber._onReady).toBe(options.onReady);
      expect(transcriber._onComplete).toBe(options.onComplete);
      expect(transcriber._onCanceled).toBe(options.onCanceled);
      expect(transcriber.dtwType).toBe(options.dtwType);
      expect(transcriber.Module.onProgress).toBe(options.onProgress);
      expect(transcriber.Module.onNewSegment).toBe(options.onSegment);
    });

    it("should set default options if not provided", () => {
      // Act
      const transcriber = new FileTranscriber({});

      // Assert
      expect(transcriber._onReady).toBeInstanceOf(Function);
      expect(transcriber._onComplete).toBeInstanceOf(Function);
      expect(transcriber._onCanceled).toBeInstanceOf(Function);
      expect(transcriber.dtwType).toBe("");
      expect(transcriber.Module.onProgress).toBeInstanceOf(Function);
      expect(transcriber.Module.onNewSegment).toBeInstanceOf(Function);
    });
  });

  describe("callback setter", () => {
    const transcriber = new FileTranscriber({ model });
    const myNewCallback = vi.fn();

    it("should set onProgress callback", () => {
      transcriber.onProgress = myNewCallback;
      expect(transcriber.Module.onProgress).toBe(myNewCallback);
    });

    it("should set onSegment callback", () => {
      transcriber.onSegment = myNewCallback;
      expect(transcriber.Module.onNewSegment).toBe(myNewCallback);
    });

    it("should set onComplete callback", () => {
      transcriber.onComplete = myNewCallback;
      expect(transcriber._onComplete).toBe(myNewCallback);
    });

    it("should set onCanceled callback", () => {
      transcriber.onCanceled = myNewCallback;
      expect(transcriber._onCanceled).toBe(myNewCallback);
    });
  });

  describe("init", () => {
    it("should initialize the transcriber module and call the onReady callback", async () => {
      // Arrange
      const transcriber = new FileTranscriber({
        createModule,
        model,
        onReady: vi.fn(),
      });
      transcriber.Module.init = vi.fn();

      // Act
      await transcriber.init();

      // Assert
      expect(transcriber.Module.init).toHaveBeenCalledWith(
        transcriber.modelInternalFilename,
        transcriber.dtwType
      );
      expect(transcriber._onReady).toHaveBeenCalled();
      expect(transcriber.isReady).toBe(true);
    });
  });

  describe("transcribe", () => {
    it("should throw an error if transcriber is not initialized", async () => {
      // Arrange
      const transcriber = new FileTranscriber({ createModule, model });
      // Act & Assert
      await expect(transcriber.transcribe(new Float32Array())).rejects.toThrow(
        "transcriber not initialized."
      );
    });

    it("should transcribe the audio and resolve with the result", async () => {
      // Arrange
      const onComplete = vi.fn();
      const transcriber = new FileTranscriber({
        createModule,
        model,
        onComplete,
      });
      await transcriber.init();

      // mock everything
      const audio = new Float32Array([1, 2, 3]);
      const options = {
        lang: "en",
        threads: 2,
        translate: true,
        max_len: 100,
        split_on_word: true,
        suppress_non_speech: true,
        token_timestamps: false,
      };
      transcriber._isRuntimeInitialized = true;
      transcriber._loadAudio = vi.fn().mockResolvedValue(audio);
      const expectedResult = { text: "Hello, world!" };
      const resolvePromise = vi.fn();
      transcriber._resolveComplete = resolvePromise;

      // Act
      const resultPromise = transcriber.transcribe(audio, options);

      // fake call wasm Module.onTranscribed
      transcriber.Module.onTranscribed(expectedResult);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert
      expect(transcriber._loadAudio).toHaveBeenCalledWith(audio);
      expect(transcriber.Module.transcribe).toHaveBeenCalledWith(
        audio,
        options.lang,
        options.threads,
        options.translate,
        options.max_len,
        options.split_on_word,
        options.suppress_non_speech,
        options.token_timestamps
      );

      expect(resolvePromise).toHaveBeenCalledWith(expectedResult);
      expect(onComplete).toHaveBeenCalledWith(expectedResult);
    });
  });

  describe("cancel", () => {
    it("should return immediately if transcriber is not initialized", async () => {
      // Arrange
      const transcriber = new FileTranscriber({});
      // Act
      const resultPromise = transcriber.cancel();
      // Assert
      await expect(resultPromise).resolves.toBeUndefined();
    });

    it("should cancel the transcription and resolve when not running", async () => {
      // Arrange
      const transcriber = new FileTranscriber({});
      transcriber._isRuntimeInitialized = true;
      transcriber.Module.cancel = vi.fn().mockReturnValue(false);

      // Act
      const resultPromise = transcriber.cancel();

      // Assert
      expect(transcriber.Module.cancel).toHaveBeenCalled();
      await expect(resultPromise).resolves.toBeUndefined();
    });

    it("should cancel the transcription and wait for completion when running", async () => {
      // Arrange
      const transcriber = new FileTranscriber({});
      transcriber._isRuntimeInitialized = true;
      transcriber.Module.cancel = vi.fn().mockReturnValue(true);

      // Act
      const resultPromise = transcriber.cancel();

      // fake call wasm Module.onCanceled
      transcriber.Module.onCanceled();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert
      expect(transcriber.Module.cancel).toHaveBeenCalled();
      await expect(resultPromise).resolves.toBeUndefined();
    });
  });

  describe("destroy", () => {
    it("should destroy the transcriber and clean up callbacks", () => {
      // Arrange
      const transcriber = new FileTranscriber({
        model,
        onReady: vi.fn(),
        onComplete: vi.fn(),
        onCanceled: vi.fn(),
        onProgress: vi.fn(),
        onSegment: vi.fn(),
      });

      transcriber._isRuntimeInitialized = true;
      transcriber._freeWasmModule = vi.fn();
      // Act
      transcriber.destroy();

      // Assert
      expect(transcriber.Module).toBeNull();
      expect(transcriber._onReady).toBeNull();
      expect(transcriber._onComplete).toBeNull();
      expect(transcriber._onCanceled).toBeNull();
      expect(transcriber._resolveCancel).toBeNull();
      expect(transcriber._resolveComplete).toBeNull();
      expect(transcriber._freeWasmModule).toBeCalled();
      expect(transcriber._isReady).toBe(false);
    });
  });
});
