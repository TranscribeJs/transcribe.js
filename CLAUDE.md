# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Transcribe.js runs speech-to-text in the **browser only** (no Node.js support) using a WebAssembly build of [whisper.cpp](https://github.com/ggerganov/whisper.cpp) called "shout". The repo is a monorepo publishing two npm packages under the `@transcribe` namespace:

- `@transcribe/shout` — the Emscripten/wasm build of whisper.cpp (`shout.wasm.js`, plus `no-simd` and `webgpu` variants)
- `@transcribe/transcriber` — the JS API (`FileTranscriber`, `StreamTranscriber`) that wraps the wasm module.

## Commands

```bash
npm install          # install deps
npm run dev           # start dev server at http://localhost:9876 (serves repo root, sets COOP/COEP headers)
npm run test:unit     # vitest unit tests (jsdom env, tests/**/*.spec.js)
npm run test:e2e      # playwright e2e tests (tests/e2e/**), auto-starts dev server
npm run test:e2e-ui   # playwright with UI mode
npm run check-types   # tsc --noEmit over packages/**/*.ts
npm run generate-types # generate src/types.d.ts-based .d.ts from JSDoc via tsc + scripts/bundle-types.js
```

Run a single unit test file: `npx vitest tests/FileTranscriber.spec.js`
Run a single e2e test: `npx playwright test tests/e2e/transcribe-file.spec.ts`

Open `http://localhost:9876/examples/index.html` (file transcriber) or `.../examples/stream.html` (experimental stream transcriber) in the browser while `npm run dev` is running.

### Wasm build (requires Emscripten installed)

```bash
npm run wasm:build            # build shout.wasm.js (SIMD) from shout.wasm/src/shout.wasm.cpp via cmake
npm run wasm:copy             # copy build output into src/shout/
npm run wasm:build-no-simd    # no-SIMD variant
npm run wasm:copy-no-simd
npm run wasm:build-webgpu     # WebGPU variant
npm run wasm:copy-webgpu
```

`whisper.cpp` is a git submodule at `shout.wasm/whisper.cpp`; update it with `cd shout.wasm/whisper.cpp && git pull origin master`. To expose new whisper.cpp functionality to JS, edit `shout.wasm/src/shout.wasm.cpp` and rebuild.

### Full release build

`npm run build` runs, in order: fft.js export patch → generate-types → build+copy all three wasm variants → `pack:transcriber` / `pack:shout` (assemble the publishable `packages/*` directories from `src/`).

## Architecture

### Source vs. published packages

All hand-written JS source lives in `src/`. `packages/shout/` and `packages/transcriber/` are **build output**, assembled by `scripts/copy-shout-files-to-package.mjs` and `scripts/copy-transcriber-files-to-package.mjs` (invoked by `npm run pack:*`) — do not hand-edit files under `packages/`, edit `src/` instead and re-run the pack scripts.

### Class hierarchy

`Transcriber` (`src/Transcriber.js`) is the base class shared by both transcriber types. It owns:
- the Emscripten `Module` object and its lifecycle (`createModule` → `onRuntimeInitialized`)
- loading the ggml model file into the wasm virtual filesystem (`_loadModel`, via `FS_createDataFile`/`FS_unlink`)
- raw wasm memory helpers (`writeAudioToMemory`, `_malloc`/`_free`/`HEAPU8`)
- `maxThreads` (capped to 2 on Safari due to an inflated `hardwareConcurrency` value)

`FileTranscriber` (`src/FileTranscriber.js`) extends it for one-shot file/URL transcription: decodes audio to 16kHz mono PCM (`audioFileToPcm32` in `src/utils.js`), calls `Module.transcribe(...)`, and resolves/rejects through `Module.onTranscribed`/`Module.onCanceled` callbacks wired in the constructor.

`StreamTranscriber` (`src/StreamTranscriber.js`, **experimental**) extends it for live microphone/stream transcription: sets up a 16kHz `AudioContext` with two `AudioWorklet` modules (`src/audio-worklets/vad.js` for voice-activity detection, `src/audio-worklets/buffer.js` for chunking), and streams buffered PCM into `Module.setStreamAudio`. Not fully supported in Firefox (no sample-rate conversion) and generally too slow for true real-time use — see the class's JSDoc `@experimental` note. Worklet script paths are resolved via `getAudioWorkletPath`, either from an explicit `audioWorkletsPath` option or relative to `import.meta.url`.

All public option/return shapes are documented via JSDoc typedefs in `src/types.d.ts` and referenced with `@param {import("./types.d.ts").X}` throughout — update that file when changing public method signatures, since it's both the type-checking source and the input to `generate-types`.

### Testing

- Unit tests (`tests/*.spec.js`, vitest + jsdom) mock the wasm module entirely via `tests/mocks/shout.js`, aliased in `vite.config.ts` to replace `@transcribe/shout` imports — tests exercise the JS wrapper logic (callback wiring, state transitions, option defaults), not real wasm/audio decoding.
- E2E tests (`tests/e2e/*.spec.ts`, Playwright) run against the real dev server and real wasm build, driving the browser through actual transcription of files in `examples/`. Timeouts are set very high (10 minutes) because wasm transcription is slow, especially in Firefox. Playwright's `webServer` config auto-runs `npm run dev`.
- Server responses require `Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Opener-Policy: same-origin` (needed for `SharedArrayBuffer`) — both `dev-server.js` and any hosting environment for this library must set these headers.

### Not written in TypeScript

The library ships as plain JS with hand-authored JSDoc; type declarations are generated, not source. When changing function signatures/options, update the JSDoc (and `src/types.d.ts` typedefs) rather than expecting `.d.ts` files to be edited directly.
