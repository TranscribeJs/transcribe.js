import { vi, describe, it, beforeEach, afterEach, expect } from "vitest";
import { Transcriber } from "../src/Transcriber";
import createModule from "./mocks/shout";

describe("Transcriber", () => {
  let transcriber;

  const print = vi.fn();
  const printErr = vi.fn();
  const preInit = vi.fn();
  const preRun = vi.fn();
  const onAbort = vi.fn();
  const onExit = vi.fn();

  beforeEach(() => {
    // mock fetch model
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(new ArrayBuffer(8))))
    );

    transcriber = new Transcriber({
      createModule,
      model: "path/to/my-model.bin",
      print,
      printErr,
      preInit,
      preRun,
      onAbort,
      onExit,
    });
  });

  afterEach(() => {
    createModule.mockClear();
    transcriber.destroy();
    vi.unstubAllGlobals();
  });

  describe("constructor", () => {
    it("should set the model and module properties", () => {
      expect(transcriber.model).toBe("path/to/my-model.bin");
    });

    it("should set the Emscripten Module callbacks", () => {
      expect(transcriber.Module.print).toBeInstanceOf(Function);
      expect(transcriber.Module.printErr).toBeInstanceOf(Function);
      expect(transcriber.Module.preInit).toBeInstanceOf(Function);
      expect(transcriber.Module.preRun).toBeInstanceOf(Function);
      expect(transcriber.Module.onAbort).toBeInstanceOf(Function);
      expect(transcriber.Module.onExit).toBeInstanceOf(Function);
    });

    it("should set the isRuntimeInitialized property to false", () => {
      expect(transcriber.isRuntimeInitialized).toBe(false);
    });
  });

  describe("maxThreads", () => {
    it("should return 2 if navigator is not available or is Safari", () => {
      navigator = {
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Safari/605.1.15",
        hardwareConcurrency: 4,
      };

      expect(transcriber.maxThreads).toBe(2);
    });

    it("should return the hardwareConcurrency value if navigator is available and not Safari", () => {
      navigator = {
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0",
        hardwareConcurrency: 8,
      };

      expect(transcriber.maxThreads).toBe(8);
    });
  });

  describe("Module callbacks", () => {
    it("should set _isRuntimeInitialized on callback", async () => {
      await transcriber.init();
      transcriber.Module.onRuntimeInitialized();
      expect(transcriber.isRuntimeInitialized).toBe(true);
    });

    it("should run callbacks when called in Module", () => {
      transcriber.Module.print("print");
      transcriber.Module.printErr("printErr");
      transcriber.Module.preInit();
      transcriber.Module.preRun();
      transcriber.Module.onAbort();
      transcriber.Module.onExit();

      expect(print).toHaveBeenCalledWith("print");
      expect(printErr).toHaveBeenCalledWith("printErr");
      expect(preInit).toHaveBeenCalled();
      expect(preRun).toHaveBeenCalled();
      expect(onAbort).toHaveBeenCalled();
      expect(onExit).toHaveBeenCalled();
    });
  });

  describe("init", () => {
    it("should create wasm module isntance", async () => {
      await transcriber.init();
      expect(createModule).toHaveBeenCalledWith({
        print,
        printErr,
        preInit,
        preRun,
        onAbort,
        onExit,
        onRuntimeInitialized: expect.any(Function),
      });
    });

    it("should call createModule (create wasm runtime) only once", async () => {
      await transcriber.init();
      transcriber.Module.onRuntimeInitialized(); // fake call
      transcriber._isModelFileLoaded = false; // fake

      await transcriber.init();
      expect(createModule).toHaveBeenCalledOnce();
    });

    it("should load model file only once", async () => {
      await transcriber.init();
      transcriber._isModelFileLoaded = true; // fake
      await transcriber.init();

      expect(window.fetch).toHaveBeenCalledOnce();
    });

    it("should fetch model if model is a string", async () => {
      await transcriber.init();
      expect(window.fetch).toHaveBeenCalledWith("path/to/my-model.bin");
      expect(transcriber.modelInternalFilename).toBe("my-model.bin");
    });

    it("should fetch model if string and not containing slash", async () => {
      transcriber = new Transcriber({ createModule, model: "my-model.bin" });
      await transcriber.init();
      expect(window.fetch).toHaveBeenCalledWith("my-model.bin");
      expect(transcriber.modelInternalFilename).toBe("my-model.bin");
    });

    it("should not fetch model if model is a File", async () => {
      const model = new File([""], "modelFilename.bin");
      model.arrayBuffer = vi.fn(() => Promise.resolve(new ArrayBuffer(8)));

      transcriber = new Transcriber({
        createModule,
        model,
      });

      await transcriber.init();
      expect(window.fetch).not.toHaveBeenCalled();
      expect(transcriber.modelInternalFilename).toBe("modelFilename.bin");
    });

    it("should store model file in Module fs", async () => {
      await transcriber.init();
      expect(transcriber.Module.FS_createDataFile).toHaveBeenCalledWith(
        "/",
        "my-model.bin",
        expect.any(Uint8Array),
        true,
        true
      );
    });

    it("should set isModelFileLoaded to true", async () => {
      expect(transcriber.isModelFileLoaded).toBe(false);
      await transcriber.init();
      expect(transcriber.isModelFileLoaded).toBe(true);
    });

    it("should set isModelFileLoaded to false if model file is not loaded", async () => {
      window.fetch = vi.fn(() => Promise.reject());
      await expect(transcriber.init()).rejects.toThrowError();
      expect(transcriber.isModelFileLoaded).toBe(false);
    });
  });

  describe("destroy", () => {
    it("should destroy the transcriber instance", async () => {
      await transcriber.init();
      transcriber._isRuntimeInitialized = true; // set to true to test

      const Module = transcriber.Module; // store module to check if called
      transcriber.destroy();

      expect(Module.free).toHaveBeenCalled();
      expect(Module.FS_unlink).toHaveBeenCalledWith("my-model.bin");
      expect(transcriber.isRuntimeInitialized).toBe(false);
      expect(transcriber._model).toBe(null);
      expect(transcriber.Module).toBe(null);
    });

    it("should not destroy the transcriber instance if not initialized", () => {
      transcriber._isRuntimeInitialized = false;
      transcriber._model = "path/to/model";
      transcriber.Module = {};

      transcriber.destroy();

      expect(transcriber.isRuntimeInitialized).toBe(false);
      expect(transcriber._model).toBe("path/to/model");
      expect(transcriber.Module).toEqual({});
    });
  });
});
