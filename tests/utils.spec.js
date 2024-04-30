import {
  audioFileToPcm32,
  createBuffer,
  createVad,
  downmixAudioBufferToMono,
} from "../src/utils";
import { afterAll, describe, it, vi, expect } from "vitest";

describe("utils", () => {
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  describe("audioFileToPcm32()", async () => {
    const file = {
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer([1, 2, 3])),
    };
    const sampleRate = 44100;
    const toMono = false;

    vi.stubGlobal("OfflineAudioContext", {});

    it("should throw an error if AudioContext is not supported", async () => {
      // Arrange
      vi.stubGlobal("window.AudioContext", undefined);

      // Act & Assert
      await expect(audioFileToPcm32(file, sampleRate, toMono)).rejects.toThrow(
        "AudioContext not supported"
      );
    });

    it("should return null if an error occurs during audio decoding", async () => {
      // Arrange
      const AudioContextStub = vi.fn(() => ({
        decodeAudioData: vi.fn().mockRejectedValue(new Error("Decoding error")),
      }));

      vi.stubGlobal("AudioContext", AudioContextStub);

      // Act & Assert
      await expect(
        audioFileToPcm32(file, sampleRate, toMono)
      ).resolves.toBeNull();
    });

    it("create an AudioContext with the specified sample rate", async () => {
      // Arrange
      const AudioContextStub = vi.fn();
      vi.stubGlobal("AudioContext", AudioContextStub);

      // Act
      await audioFileToPcm32(file, sampleRate, toMono);

      // Assert
      expect(AudioContextStub).toHaveBeenCalledWith({ sampleRate });
    });

    it("should decode the audio file buffer", async () => {
      // Arrange
      const buffer = {
        numberOfChannels: 1,
        getChannelData: vi.fn().mockReturnValue(new Float32Array([1, 2, 3])),
      };

      const audioContext = {
        decodeAudioData: vi.fn().mockResolvedValue(buffer),
      };

      vi.stubGlobal(
        "AudioContext",
        vi.fn(() => audioContext)
      );

      // Act
      const audioFileBuffer = await file.arrayBuffer();
      const result = await audioFileToPcm32(file, sampleRate, toMono);

      // Assert
      expect(audioContext.decodeAudioData).toHaveBeenCalledWith(
        audioFileBuffer
      );
      expect(buffer.getChannelData).toHaveBeenCalledWith(0);
      expect(result).toEqual(new Float32Array([1, 2, 3]));
    });
  });

  describe("downmixAudioBufferToMono()", () => {
    it("should return a mono audio buffer", async () => {
      // Arrange
      const buffer = {
        length: 3,
        sampleRate: 44100,
      };

      const downmixContext = {
        startRendering: vi.fn().mockResolvedValue(new Float32Array([1, 2, 3])),
      };

      const bufferSource = {
        start: vi.fn(),
        connect: vi.fn(),
      };

      vi.stubGlobal(
        "OfflineAudioContext",
        vi.fn(() => downmixContext)
      );
      vi.stubGlobal(
        "AudioBufferSourceNode",
        vi.fn(() => bufferSource)
      );

      // Act
      const result = await downmixAudioBufferToMono(buffer);

      // Assert
      expect(OfflineAudioContext).toHaveBeenCalledWith(1, 3, 44100);
      expect(bufferSource.start).toHaveBeenCalledWith(0);
      expect(bufferSource.connect).toHaveBeenCalledWith(
        downmixContext.destination
      );
      expect(result).toEqual(new Float32Array([1, 2, 3]));
    });
  });

  describe("createVad()", () => {
    it("creates AudioWorkletNode with the specified parameters", () => {
      const audioContext = { sampleRate: 44100 };
      const AudioWorkletNodeStub = vi.fn(() => ({ port: {} }));
      vi.stubGlobal("AudioWorkletNode", AudioWorkletNodeStub);

      const vad = createVad(audioContext);

      expect(AudioWorkletNodeStub).toHaveBeenCalledWith(audioContext, "vad", {
        outputChannelCount: [1],
        processorOptions: {
          sampleRate: 44100,
        },
      });

      expect(vad.port.onmessage).toBeTypeOf("function");
    });

    it("returns null if an error occurs during AudioWorkletNode creation", () => {
      const audioContext = { sampleRate: 44100 };
      vi.stubGlobal("AudioWorkletNode", () => {
        throw new Error("Error creating AudioWorkletNode");
      });

      const vad = createVad(audioContext);

      expect(vad).toBeNull();
    });

    it("runs callbacks onmessage", async () => {
      const audioContext = { sampleRate: 44100 };
      const onSpeech = vi.fn();
      const onSilence = vi.fn();
      const AudioWorkletNodeStub = vi.fn(() => ({ port: {} }));
      vi.stubGlobal("AudioWorkletNode", AudioWorkletNodeStub);

      const vad = createVad(audioContext, onSpeech, onSilence);

      // fake onmessage callback
      vad.port.onmessage({ data: { cmd: "speech" } });
      vad.port.onmessage({ data: { cmd: "silence" } });

      // wait 200ms
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(onSpeech).toHaveBeenCalled();
      expect(onSilence).toHaveBeenCalled();
    });

    it("calls callback only on change", async () => {
      const audioContext = { sampleRate: 44100 };
      const onSpeech = vi.fn();
      const onSilence = vi.fn();
      const AudioWorkletNodeStub = vi.fn(() => ({ port: {} }));
      vi.stubGlobal("AudioWorkletNode", AudioWorkletNodeStub);

      const vad = createVad(audioContext, onSpeech, onSilence, 100);

      // fake onmessage callback
      vad.port.onmessage({ data: { cmd: "speech" } });
      vad.port.onmessage({ data: { cmd: "speech" } });
      vad.port.onmessage({ data: { cmd: "speech" } });
      vad.port.onmessage({ data: { cmd: "silence" } });

      // wait 100ms
      await new Promise((resolve) => setTimeout(resolve, 100));

      vad.port.onmessage({ data: { cmd: "speech" } });
      vad.port.onmessage({ data: { cmd: "speech" } });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(onSpeech).toHaveBeenCalledTimes(2);
      expect(onSilence).toHaveBeenCalledTimes(1);
    });

    it("waits for minSilence duration before calling onSilence", async () => {
      const audioContext = { sampleRate: 44100 };
      const onSpeech = vi.fn();
      const onSilence = vi.fn();
      const AudioWorkletNodeStub = vi.fn(() => ({ port: {} }));
      vi.stubGlobal("AudioWorkletNode", AudioWorkletNodeStub);

      const vad = createVad(audioContext, onSpeech, onSilence, 400);

      // fake onmessage callback
      vad.port.onmessage({ data: { cmd: "speech" } });

      // wait 100ms
      await new Promise((resolve) => setTimeout(resolve, 100));

      vad.port.onmessage({ data: { cmd: "silence" } });
      await new Promise((resolve) => setTimeout(resolve, 100));
      vad.port.onmessage({ data: { cmd: "speech" } });

      vad.port.onmessage({ data: { cmd: "silence" } });
      await new Promise((resolve) => setTimeout(resolve, 400));
      vad.port.onmessage({ data: { cmd: "speech" } });

      expect(onSpeech).toHaveBeenCalledTimes(2);
      expect(onSilence).toHaveBeenCalledTimes(1);
    });
  });

  describe("createBuffer()", () => {
    it("creates buffer AudioWorkletNode", () => {
      const audioContext = { sampleRate: 44100 };
      const AudioWorkletNodeStub = vi.fn(() => ({ port: {} }));
      vi.stubGlobal("AudioWorkletNode", AudioWorkletNodeStub);

      const buffer = createBuffer(audioContext, () => {}, 4300);

      expect(AudioWorkletNodeStub).toHaveBeenCalledWith(
        audioContext,
        "buffer",
        {
          outputChannelCount: [1],
          processorOptions: {
            sampleRate: 44100,
            bufferSizeMs: 4300,
          },
        }
      );

      expect(buffer.port.onmessage).toBeTypeOf("function");
    });

    it("returns null if an error occurs during AudioWorkletNode creation", () => {
      const audioContext = { sampleRate: 44100 };
      vi.stubGlobal("AudioWorkletNode", () => {
        throw new Error("Error creating AudioWorkletNode");
      });

      const buffer = createBuffer(audioContext, () => {});

      expect(buffer).toBeNull();
    });

    it("runs callback onmessage", async () => {
      const audioContext = { sampleRate: 44100 };
      const onBuffer = vi.fn();
      const AudioWorkletNodeStub = vi.fn(() => ({ port: {} }));
      vi.stubGlobal("AudioWorkletNode", AudioWorkletNodeStub);

      const buffer = createBuffer(audioContext, onBuffer, 100);

      // fake onmessage callback
      buffer.port.onmessage({
        data: { cmd: "buffer", data: { pcmf32: [1, 2, 3] } },
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(onBuffer).toHaveBeenCalledWith([1, 2, 3]);
    });
  });
});
