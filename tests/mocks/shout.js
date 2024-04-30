import { vi } from "vitest";

const createModule = vi.fn((Module) => {
  return {
    // emscripten functions
    _malloc: vi.fn(),
    FS_unlink: vi.fn(),
    FS_createDataFile: vi.fn(),

    // bind functions from shout.wasm.cpp
    init: vi.fn(),
    free: vi.fn(),
    transcribe: vi.fn(),
    cancel: vi.fn(),
    startStream: vi.fn(),
    stopStream: vi.fn(),
    setStreamAudio: vi.fn(),
    ...Module,
  };
});

export default createModule;
