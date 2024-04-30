import { StreamTranscriber } from "../src/StreamTranscriber";
import { expect, describe, it, vi, beforeEach, afterEach } from "vitest";

describe("StreamTranscriber", () => {
  const model = new File([""], "modelFilename.bin");
  model.arrayBuffer = vi.fn(() => Promise.resolve(new ArrayBuffer(8)));

  const audioContextStub = vi.fn(() => ({
    resume: vi.fn(),
    suspend: vi.fn(),
    audioWorklet: {
      addModule: vi.fn(),
    },
  }));

  describe("constructor", () => {
    it("should set the options and initialize the transcriber module", () => {
      // Arrange
      const options = {
        model: "model",
        onReady: vi.fn(),
        onSegment: vi.fn(),
        onStreamStatus: vi.fn(),
      };

      // Act
      const transcriber = new StreamTranscriber(options);

      // Assert
      expect(transcriber.isStreamRunning).toBe(false);
      expect(transcriber._onReady).toBe(options.onReady);
      expect(transcriber.Module.onStreamTranscription).toBe(options.onSegment);
      expect(transcriber.Module.onStreamStatus).toBe(options.onStreamStatus);
    });
  });

  describe("getAudioWorkletPath", () => {
    it("should return the audio worklet path if set in options", () => {
      // Arrange
      const transcriber = new StreamTranscriber({
        audioWorkletsPath: "/path/",
      });

      // Act
      const path = transcriber.getAudioWorkletPath("filename.js");

      // Assert
      expect(path).toBe("/path/filename.js");
    });

    it("should return path based on import.meta.url if available", () => {
      // Arrange
      const transcriber = new StreamTranscriber({});

      // Act
      const path = transcriber.getAudioWorkletPath("filename.js", {
        url: "http://localhost/test/",
      });

      // Assert
      expect(path).toBe("http://localhost/test/audio-worklets/filename.js");

      vi.unstubAllGlobals();
    });

    it("should throw an error if audio worklet path cannot be determined", () => {
      // Arrange
      const transcriber = new StreamTranscriber({});

      // Act
      const path = () =>
        transcriber.getAudioWorkletPath("filename.js", { url: null });

      // Assert
      expect(path).toThrowError("Cannot determine audio worklet path.");
    });
  });

  describe("init", () => {
    it("should initialize the transcriber module and call the onReady callback", async () => {
      // Arrange
      const transcriber = new StreamTranscriber({
        model,
        audioWorkletsPath: "audio-worklets",
        onReady: vi.fn(),
      });

      vi.stubGlobal("AudioContext", audioContextStub);

      // Act
      await transcriber.init();

      // Assert
      expect(
        transcriber._streamAudioContext.audioWorklet.addModule
      ).toHaveBeenCalledWith("audio-worklets/vad.js");
      expect(
        transcriber._streamAudioContext.audioWorklet.addModule
      ).toHaveBeenCalledWith("audio-worklets/buffer.js");
      expect(transcriber._onReady).toHaveBeenCalled();

      vi.unstubAllGlobals();
    });
  });

  describe("start", () => {
    beforeEach(() => {
      vi.stubGlobal("AudioContext", audioContextStub);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("should start stream transcription with defaults", async () => {
      // Arrange
      const transcriber = new StreamTranscriber({ model });
      await transcriber.init();

      // Act
      await transcriber.start({});
      // Assert
      expect(transcriber._streamAudioContext.resume).toHaveBeenCalled();
      expect(transcriber.Module.startStream).toHaveBeenCalledWith(
        transcriber.modelInternalFilename,
        "auto",
        transcriber.maxThreads - 1, // minus 1 because audio worklets need a thread
        false,
        32,
        756,
        true
      );
      expect(transcriber.isStreamRunning).toBe(true);
    });

    it("should log a warning if the number of threads exceeds hardware concurrency", async () => {
      // Arrange
      vi.stubGlobal("navigator", {
        hardwareConcurrency: 6,
        userAgent: "Chrome",
      });

      const transcriber = new StreamTranscriber({ model });
      await transcriber.init();

      transcriber.Module.startStream = vi.fn();
      console.warn = vi.fn();

      // Act
      await transcriber.start({ threads: 10 });
      // Assert
      expect(console.warn).toHaveBeenCalledWith(
        "Number of threads (10) exceeds hardware concurrency (6)."
      );
    });

    it("should not start stream transcription if it is already running", async () => {
      // Arrange
      const transcriber = new StreamTranscriber({ model });
      await transcriber.init();

      transcriber._isStreamRunning = true;
      console.log = vi.fn();

      // Act
      await transcriber.start({});
      // Assert
      expect(console.log).toHaveBeenCalledWith("Stream already running.");
      expect(transcriber.Module.startStream).not.toHaveBeenCalled();
    });
  });

  describe("stop", () => {
    it("should stop stream transcription", async () => {
      // Arrange
      const transcriber = new StreamTranscriber({});
      transcriber._streamAudioContext = {
        suspend: vi.fn(),
      };
      transcriber._streamMediaSource = {
        disconnect: vi.fn(),
      };
      transcriber.Module.stopStream = vi.fn();
      transcriber._isStreamRunning = true;

      // Act
      await transcriber.stop();

      // Assert
      expect(transcriber._streamAudioContext.suspend).toHaveBeenCalled();
      expect(transcriber._streamMediaSource.disconnect).toHaveBeenCalled();
      expect(transcriber.Module.stopStream).toHaveBeenCalled();
      expect(transcriber.isStreamRunning).toBe(false);
    });

    it("should not stop stream transcription if it is not running", async () => {
      // Arrange
      const transcriber = new StreamTranscriber({});
      transcriber._streamAudioContext = {
        suspend: vi.fn(),
      };
      transcriber._streamMediaSource = {
        disconnect: vi.fn(),
      };
      transcriber.Module.stopStream = vi.fn();
      transcriber._isStreamRunning = false;
      console.log = vi.fn();

      // Act
      await transcriber.stop();

      // Assert
      expect(console.log).toHaveBeenCalledWith("Stream not running.");
      expect(transcriber._streamAudioContext.suspend).not.toHaveBeenCalled();
      expect(transcriber._streamMediaSource.disconnect).not.toHaveBeenCalled();
      expect(transcriber.Module.stopStream).not.toHaveBeenCalled();
    });
  });

  describe("transcribe", () => {
    it("should log an error if stream is not running", async () => {
      // Arrange
      const transcriber = new StreamTranscriber({});
      transcriber._isStreamRunning = false;
      console.log = vi.fn();

      const stream = {};

      // Act
      await transcriber.transcribe(stream, {});

      // Assert
      expect(console.log).toHaveBeenCalledWith("Stream not running.");
    });

    it("should log an error if stream is not active", async () => {
      // Arrange
      const transcriber = new StreamTranscriber({});
      transcriber._isStreamRunning = true;
      console.log = vi.fn();

      const stream = { active: false };

      // Act
      await transcriber.transcribe(stream, {});

      // Assert
      expect(console.log).toHaveBeenCalledWith("Stream not active.");
    });
  });
});
