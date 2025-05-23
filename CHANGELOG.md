# Changelog

## [3.0.0] - 2025-05-16

### Breaking

- removed `workerPath` & `locateFile` because there is no separate worker file anymore
  - this is only a breaking changed if you've used these options to locate the separate worker file

### Changed

- updated whisper.cpp to v1.7.5
- updated dev dependencies
- disable console.log output in vitest (`npm run test:unit`)

## Fixed

- build with latest emscripten version to fix `Vite is unable to parse the worker options`; issue [#14](https://github.com/TranscribeJs/transcribe.js/issues/14)

## [2.0.6] - 2025-02-18

### Add

- add params and explanation for `preRecordMs`, `maxRecordMs`, `minSilenceMs` in stream example

### Changed

- updated whisper.cpp to v1.7.4
- add integration guide links and updated install instructions in readme
- changed `StreamTranscriber.transcribe` default params for better results

## [2.0.5] - 2024-12-12

### Changed

- `FileTranscriber.transcribe()` now only runs if wasm module _and_ model file are loaded successfully

### Fixed

- prevent multiple calls to `createModule` if model file was not found - fixes possible memory issue [#10](https://github.com/TranscribeJs/transcribe.js/issues/10)

## [2.0.4] - 2024-11-27

### Add

- command to check generated types in packages `npm run check-types`

### Changed

- `StreamTranscriber.getAudioWorkletPath()` second parameter is now `URL|string` instead of `import.meta`

### Fixed

- Typescript compile error [#8](https://github.com/TranscribeJs/transcribe.js/issues/8)

## [2.0.3] - 2024-11-19

### Add

- script to update the version string (aka. cache busting) in the example files

### Changed

- explicit set wasm build environment to `web,webview,webworker`, this removes unused code for node.js (which is not supported by transcribe.js)

### Fixed

- module import with bundler (eg. SvelteKit); issue [#6](https://github.com/TranscribeJs/transcribe.js/issues/6)

## [2.0.2] - 2024-11-15

### Changed

- wasm memory
  - reduced initial memory allocation to 512MB
  - enabled allow memory growth
- updated whisper.cpp to v1.7.1
- bump @transcribe/shout peer dependency to v1.0.3
- updated dev dependencies

### Fixed

- fix `Uncaught RangeError: ... could not allocate memory` on `init()` on machines with less memory available

## [2.0.1] - 2024-05-31

### Changed

- added `index.d.ts` to `@transcribe/shout`

## [2.0.0] - 2024-05-31

### Breaking

Removed the direct dependency of `@transcribe/shout` in `Transcriber` classes and pass `createModule()` as a constructor parameter instead.

**Why?** The wasm build can't be bundled so a manual import is easier than dealing with bundler exclude configs and remapping imports.

You need to change the following in your code:

```diff
+ import createModule from "/your/project/shout.wasm.js";
import { FileTranscriber } from "@transcribe/transcriber";

// create new instance
const transcriber = new FileTranscriber({
+ createModule, // create module function from emscripten build
  model: "/your/project/ggml-tiny-q5_1.bin", // path to ggml model file
  workerPath: "/your/project", // directory of shout.wasm.worker.mjs copied before
});
```

### Changed

- updated whisper.cpp to v1.6.2

### Fixed

- align demo styles with docs

## [1.0.0] - 2024-05-15

### Breaking

- added `token_timestamps` param to `Module.transcribe(...)`, throws parameter count error if omited
- renamed type `TranscripeResult` => `TranscribeResult`

### Added

- `Transcriber.isReady` property
- callback setter in `FileTranscriber` & `StreamTranscriber`
  - `FileTranscriber.onComplete`
  - `FileTranscriber.onCanceled`
  - `FileTranscriber.onProgress`
  - `FileTranscriber.onSegment`
  - `StreamTranscriber.onSegement`
  - `StreamTranscriber.onStreamStatus`
- `FileTranscriber.destroy()` & `StreamTranscriber.destroy()`
- `token_timestamps` option to `FileTranscriber.transcribe('myfile.mp', {..., token_timestamps: false})`

### Changed

- type `TranscripeResult` => `TranscribeResult`

### Fixed

- JSDoc props from private to protected in base class

## [0.1.3]

- initial release
