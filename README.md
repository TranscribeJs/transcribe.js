[![NPM Version](https://img.shields.io/npm/v/@transcribe/transcriber?style=flat&color=green)](https://www.npmjs.com/package/@transcribe/transcriber)

# Transcribe.js

Transcribe speech to text in the browser. Based on a wasm build of [whisper.cpp](https://github.com/ggerganov/whisper.cpp).

Check out the examples.

- [File Transcriber](https://examples.transcribejs.dev/examples/index.html)
- [Stream Transcriber (experimental)](https://examples.transcribejs.dev/examples/stream.html)

## Table of Contents

- [Packages](#packages)
- [Prerequisite](#prerequisite)
- [Installation](#installation)
- [Usage](#usage)
- [File Transcriber](#file-transcriber)
- [Stream Transcriber (experimental)](#stream-transcriber-experimental)
- [Multiple Instances and Multi Threading](#multiple-instances-and-multi-threading)
- [FileTranscriber API](#filetranscriber-api)
- [StreamTranscriber API](#streamtranscriber-api)
- [Development](#development)
- [Credits](#credits)

## Packages

All packages are under [@transcribe](https://www.npmjs.com/search?q=%40transcribe) namespace.

| Package                     | Description                                                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **@transcribe/shout**       | Wasm build based on [whisper.cpp](https://github.com/ggerganov/whisper.cpp). Contains Module file including the wasm binary and a separate webworker file. |
| **@transcribe/transcriber** | `FileTranscriber` and `StreamTranscriber` for transcribing media files or streams.                                                                         |

## Prerequisite

### Webserver

Your webserver must serve the files with cross origin headers.

`"Cross-Origin-Embedder-Policy": "require-corp"`  
`"Cross-Origin-Opener-Policy": "same-origin"`

### Model File

You need a ggml model file to run Transcribe.js. You can download them on hugging face https://huggingface.co/ggerganov/whisper.cpp/tree/main . You should start with the (quantized) tiny or base models. Larger models propably won't work but you can try it, though.

## Installation

### NPM

Install shout wasm and transcriber packages

```bash
npm install --save @transcribe/transcriber
```

copy the shout.wasm and webworker files to your project directory

```bash
# copy shout wasm
cp node_modules/@transcribe/shout/src/shout/shout.wasm.worker.mjs /your/project
cp node_modules/@transcribe/shout/src/shout/shout.wasm.js /your/project

# copy audio-worklets, only needed if you want to use StreamTranscriber
cp -r node_modules/@transcribe/transcriber/src/audio-worklets /your/project
```

### Manual Installation

You can use Transcribe.js without a bundler or package manager. Download the files from this repository, copy the `src/*` directories to your webserver and include the following into your HTML. Make sure to set the correct paths in the import map.

```html
<!-- set paths to js files -->
<script type="importmap">
  {
    "imports": {
      "@transcribe/shout": "/src/shout/shout.wasm.js",
      "@transcribe/transcriber": "/src/index.js"
    }
  }
</script>

<!-- use type="module" for es6 imports -->
<script type="module">
  import { FileTranscriber } from "@transcribe/transcriber";

  ...
</script>
```

## Usage

Check out the [Example](https://examples.transcribejs.dev/examples/index.html).

```js
import { FileTranscriber } from "@transcribe/transcriber";

// create new instance
const transcriber = new FileTranscriber({
  model: "/your/project/ggml-tiny-q5_1.bin", // path to ggml model file
  workerPath: "/your/project", // directory of shout.wasm.worker.mjs copied before
});

// init wasm transcriber worker
await transcriber.init();

// transcribe audio/video file
const result = await transcriber.transcribe("/your/project/my.mp3");

console.log(result);
```

The `result` is an JSON object containg the text segements and timestamps.

```js
{
  "result": {
    "language": "en"
  },
  "transcription": [
    {
      "timestamps": {
        "from": "00:00:00,000",
        "to": "00:00:11,000"
      },
      "offsets": {
        "from": 0,
        "to": 11000
      },
      "text": " And so my fellow Americans ask not what your country can do for you, ask what you can do for your country.",
      "tokens": [
        {
          "text": " And",
          "timestamps": {
            "from": "00:00:00,320",
            "to": "00:00:00,350"
          },
          "offsets": {
            "from": 320,
            "to": 350
          },
          "id": 400,
          "p": 0.726615 // propability, aka. how likely the estimate is true, 0..1, 1 is best
        },
        // ... one token per word
      ]
    }
  ]
}
```

## File Transcriber

Full example of the `FileTranscriber`.

```js
import { FileTranscriber } from "@transcribe/transcriber";

// create new instance
const transcriber = new FileTranscriber({
  model: "/path/to/model.bin", // can be path to model file, or File() object
  workerPath: "/path/to/shout", // set path to directory of shout.wasm.worker.mjs

  dtwType: "tiny", // optional, use for word level timestamps, must match model type (tiny, tiny.en, base, base.en, ...)

  // custom build callbacks
  onReady: () => console.log("ready"), // called after init, aka. transcriber is ready
  onProgress: (progress) => console.log(progress), // progress 0..100
  onSegment: (segment) => console.log(segment), // on new segement
  onComplete: (result) => console.log(result), // on transcription done
  onCanceled: () => console.log("canceled"), // called after transcriber.cancel() when the wasm operation actually canceled

  print: (message) => console.log(message), // message print to stdout
  printErr: (message) => console.error(message), // message print to errout

  // other emscripten Module callbacks
  preInit: () => {},
  preRun: () => {},
  onAbort: () => {},
  onExit: (existStatus) => {},
  locateFile: (file) => `path/${file}`, // used by shout.wasm.js to determine location of worker file; you don't need this if you've set `workerPath`
});

// init wasm (loads model file and creates a new shout instance)
await transcriber.init();

// transcribe audio/video file
const result = await transcriber.transcribe(
  "my.mp3", // path to media file, or File() object
  {
    lang: "en", // language of the speech to transcribe
    threads: 2, // use number of threads (choose based on number of instances and hardware)
    translate: false, // translate to english
    max_len: 0, // limit max number of characters in one token, 0 -> no limit
    split_on_words: false, //split on new word rather than token
    suppress_non_speech: false, // remove non speech tokens
  }
);

console.log(result);

// clear instances and memory when all transcriptions are done
transcriber.destroy();
```

## Stream Transcriber (experimental)

`StreamTranscriber` can transcribe audio from stream media like microphone input. The transcriber waits for voice activity, buffers/records audio and sends the audio data to the wasm.

Unfortunatly processing is way too slow for real time applications. But maybe this will work in the future. Also this doesn't work in Firefox unless the stream source has a sample rate of 16kHz.

[Stream Example](https://examples.transcribejs.dev/examples/stream.html)

```js
import { StreamTranscriber } from "@transcribe/transcriber";

// create new instance
const streamTranscriber = new StreamTranscriber({
  model: "/your/project/model.bin",
  wasmWorkerPath: "/your/project",
  audioWorkletsPath: "/your/project/audio-worklets",

  // called on new transcription
  onSegment: (segment) => {
    console.log(segment);
  },
});

// init wasm transcriber worker
await streamTranscriber.init();

// start transcriber wasm wait for audio
await streamTranscriber.start({
  lang: "en", // language code
  threads: this.maxThreads, // max threads to use
  translate: false, // translate to english
  suppress_non_speech: true, // ignore non speech tokens
  max_tokens: 32, // max token number
  audio_ctx: 756, // size of audio context
});

// create audio context and media stream
const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

// start transcribing
// audio gets transcribed when silence is detected or maxRecordMs is reached
streamTranscriber.transcribe(stream, {
  preRecordMs: 200, // pre record audio, because vad needs some time
  maxRecordMs: 5000, // max buffer size in milliseconds
  minSilenceMs: 500, // min time of silence before call transcribe
  onVoiceActivity: (active) => {
    console.log("Voice Activity: ", active);
  },
});

// ...do stuff

// stop stream when not needed
await streamTranscriber.stop();

// destroy instance
streamTranscriber.destroy();
```

## Multiple Instances and Multi Threading

The `FileTranscriber.init()` function can only spawn one wasm instance. If you want to process multiple files in parallel you can create another instance `const t2 = new FileTranscriber(...);`.

Be aware that transcriber run as wasm is way slower than on a dedicated machine (with gpu support). So parallel processing is propably not a good idead.

You should pay attention to the total number of threads being used. For example, if your machine can run 4 threads (`navigator.hardwareConcurrency`) and you create 2 instances to run 2 files in parallel, each transcribe should only use 2 thread for processing.

```js
// make sure to cache the model file somehow (service worker would be an option)
const model = await fetch("/path/to/model.bin");
const t1 = new FileTranscriber({model});
const t2 = new FileTranscriber({model});

async function transcribe1() {
  await t1.init();
  const result = await t1.transcribe("myaudio.mp3", { threads: 2 }),
  console.log(result);
}

async function transcribe2() {
  await t2.init();
  const result = await t2.transcribe("myaudio1.mp3", { threads: 2 }),
  console.log(result);
}

transcribe1();
transcribe2();
```

## FileTranscriber API

Transcribe speech from audio files to text.

### FileTranscriber: FileTranscriber(options) constructor ⇒ `FileTranscriber`

Create a new FileTranscriber instance.

#### Syntax

```js
const transcriber = new FileTranscriber(options);
```

#### Parameters

| **Param**          | **Type**                                                                       | **Description**                                                                                              |
| ------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| **options**        | `FileTranscriberOptions`                                                       |                                                                                                              |
| $\quad$ model      | `string` \| `File`                                                             | Whisper.cpp model file in ggml format. Will call `fetch()` if string, otherwise will use the provided file.  |
| $\quad$ workerPath | `string`                                                                       | Path to `shout.wasm.worker.mjs` file. Defaults to the directory where `shout.wasm.js` is located.            |
| $\quad$ dtwType    | `DtwType: "tiny" \| "base" \| "small" \| "tiny.en" \| "base.en" \| "small.en"` | Specify the type of the model used if should compute word level timestamps using DTW algorithm.              |
| $\quad$ onReady    | `() => void`                                                                   | Called after init.                                                                                           |
| $\quad$ onProgress | `(progress: number) => void`                                                   | Called on progress (new segment), `0..100`                                                                   |
| $\quad$ onCanceled | `() => void`                                                                   | Called after transcription process got canceled.                                                             |
| $\quad$ onSegment  | `(segment: TranscribeResultSegment) => void`                                   | Called when a new transcribed segment is ready.                                                              |
| $\quad$ onComplete | `(result: TranscriptionResult) => void`                                        | Called when transcription is complete.                                                                       |

### FileTranscriber: init() ⇒ `Promise<void>`

Loads model and creates a new shout instance. **Must** be called before `transcribe()`.

#### Syntax

```js
await transcriber.init();
```

### FileTranscriber: transcribe(file, options?) ⇒ `Promise<TranscripeResult>`

Transcribes audio to text and returns a `Promise` that resolves with a `TranscriptionResult` that contains the transcription data as JSON.

#### Syntax

```js
await transcriber.transcribe("my.mp3");
await transcriber.transcribe("my.mp3", options);
await transcriber.transcribe(file, options);
```

#### Parameters

| **Param**                   | **Type**                 | **Default**        | **Description**                                                      |
| --------------------------- | ------------------------ | ------------------ | -------------------------------------------------------------------- |
| **audio**                   | `string \| File`         |                    | URL to audio file or `File` object.                                  |
| **options**                 | `FileTranscriberOptions` |                    |                                                                      |
| $\quad$ lang                | `string`                 | `"auto"`           | Language code of the audio language (eg. `en`)                       |
| $\quad$ threads             | `number`                 |  `this.maxThreads` | Number of threads to use. Defaults to max available.                 |
| $\quad$ translate           | `boolean`                | `false`            | Translate result to english.                                         |
| $\quad$ max_len             | `number`                 | `0`                | Max number of characters in a single segment, `0` means no limit.    |
| $\quad$ split_on_word       | `boolean`                | `false`            | If `true`, transcriber will try to split the text on word boundarie. |
| $\quad$ suppress_non_speech | `boolean`                | `false`            | If `true`, transcriber will try to suppress non-speech segments.     |

### FileTranscriber: cancel() ⇒ `Promise<void>`

Cancels the current transcription. May take some time.

#### Syntax

```js
await transcriber.cancel();
```

### FileTranscriber: destroy()

Destroys shout instance and frees wasm memory.

#### Syntax

```js
transcriber.destroy();
```

## StreamTranscriber API

Transcribe an audio stream (e.g microhpone input) to text using the whisper.cpp speech-to-text implementation. This is experimental and not working in Firefox because sample rate conversion with AudioContext is not supported. Also, wasm is way to slow for real-time transcription.

### StreamTranscriber: StreamTranscriber(options) constructor ⇒ `StreamTranscriber`

Creates a new StreamTranscriber instance.

#### Syntax

```js
const streamTranscriber = new StreamTranscriber(options);
```

#### Parameters

| **Param**                 | **Type**                                     | **Description**                                                                                                            |
| ------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **options**               | `FileTranscriberOptions`                     |                                                                                                                            |
| $\quad$ model             | `string` \| `File`                           | Whisper.cpp model file in ggml format. Will call `fetch()` if string, otherwise will use the provided file.                |
| $\quad$ workerPath        | `string`                                     | Path to `shout.wasm.worker.mjs` file. Defaults to the directory where `shout.wasm.js` is located.                          |
| $\quad$ audioWorkletsPath | `string`                                     | Path to `vad.js` & `buffer.js` files. Defaults to the `audio-worklets/` directory where `StreamTranscriber.js` is located. |
| $\quad$ onReady           | `() => void`                                 | Called after init.                                                                                                         |
| $\quad$ onStreamStatus    | `(status: StreamStatus) => void`             | Called when stream status changes. `StreamStatus: "loading" \| "waiting" \| "processing" \| "stopped"`                     |
| $\quad$ onSegment         | `(segment: TranscribeResultSegment) => void` | Called when a new transcribed segment is ready.                                                                            |

### StreamTranscriber: init() ⇒ `Promise<void>`

Loads model, audio worklets and creates a new wasm instance. **Must** be called before `start()`.

#### Syntax

```js
await streamTranscriber.init();
```

### StreamTranscriber: start(options?) ⇒ `Promise<void>`

Starts a new stream transcriber (technically a loop in wasm space waiting for audio input). **Must** be called before `transcribe()`.

#### Syntax

```js
await streamTranscriber.start(options);
```

#### Parameters

| **Param**                   | **Type**                 | **Default**        | **Description**                                                |
| --------------------------- | ------------------------ | ------------------ | -------------------------------------------------------------- |
| **options**                 | `FileTranscriberOptions` |                    |                                                                |
| $\quad$ lang                | `string`                 | `"auto"`           | Language code of the audio language (eg. `"en"`)               |
| $\quad$ threads             | `number`                 |  `this.maxThreads` | Number of threads to use. Defaults to max available.           |
| $\quad$ translate           | `boolean`                | `false`            | Translate result to english.                                   |
| $\quad$ suppress_non_speech | `boolean`                | `false`            | If true, transcriber will try to suppress non-speech segments. |
| $\quad$ max_tokens          | `number`                 | `16`               | Maximum number of tokens in a single segment, see whisper.cpp. |
| $\quad$ audio_ctx           | `boolean`                | `512`              | Audio context buffer size in samples, see whisper.cpp.         |

### StreamTranscriber: stop() ⇒ `Promise<void>`

Stops wasm loop waiting for audio input.

#### Syntax

```js
await streamTranscriber.stop();
```

### StreamTranscriber: transcribe(stream, options?) ⇒ `Promise<void>`

Transcribes the audio signal from `stream`. Wasm calls the `onSegment(result)` callback once the transcription is ready.

The function starts buffering the audio when speech is detected. The buffer is then sent to wasm when silence is detected or `maxRecordMs` is exceeded.

#### Syntax

```js
await streamTranscriber.transcribe(stream, options);
```

| **Param**               | **Type**                     | **Default** | **Description**                                                                          |
| ----------------------- | ---------------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| **options**             | `FileTranscriberOptions`     |             |                                                                                          |
| $\quad$ preRecordsMs    | `number`                     | `200`       | Time of audio in ms to include before, because voice activity detection needs some time. |
| $\quad$ maxRecordMs     | `number`                     | `5000`      | If buffer reaches this length it will get flushed to wasm, even during speech.           |
| $\quad$ minSilenceMs    | `number`                     | `500`       | Minimum time in ms of silence before transcribe is called.                               |
| $\quad$ onVoiceActivity | `(active: boolean) => void`  |             | Called when there's a change in voice activity.                                          |

### StreamTranscriber: destroy()

Destroys the wasm instance and frees wasm memory.

#### Syntax

```js
transcriber.destroy();
```

## Development

Clone the repository, install dependencies, start the dev server and open `http://localhost:9876/examples/index.html` in your browser.

```bash
git clone https://github/transcribejs/transcribe.js
cd transcribe
npm install
npm run dev
```

### Types

The library is not written in typescript. This way no extra build step is needed during development and in production.

To still get proper type support type definitions get generated from JSDoc comments.

```bash
npm run generate-types
```

### Wasm build

The `whisper.cpp` repository is a git submodule. To get the latest version of `whisper.cpp` go into the directory and pull the latest changes from github.

```bash
cd shout.wasm/whisper.cpp
git pull origin master
```

The wasm files are build from `shout.wasm/src/whisper.wasm.cpp`. If you want to add new functions from whisper.cpp to the wasm build this is the file to add them.

> I'm pretty sure that this will not compile on every machine/architecture, but I'm no expert in C++. If you know how to optimize the build process please let me know or create a pull request. Maybe this should be dockerized.?

```bash
# run cmake to build wasm
npm run wasm:build

# copy emscripten build files to project
npm run wasm:copy
```

### Tests

Unit/functional tests for the `Transcriber` functions.

```bash
npm run test:unit
```

E2E tests using Playwright. Firefox somehow needs waaaaaay longer during e2e test than in a the "real" browser.

```bash
npm run test:e2e
```

or use the Playwright UI for details

```bash
npm run test:e2e-ui
```

## Credits

Thank you to the creators and contributors of the following open source libraries that were used in this project:

### Libraries

- **whisper.cpp**: A C++ implementation of whisper. [GitHub Repository](https://github.com/ggerganov/whisper.cpp)
- **emscripten**: A toolchain for compiling C and C++ code to WebAssembly. [Official Site](https://emscripten.org/)
- **water.css**: A minimal CSS framework for styling HTML. [Official Site](https://watercss.kognise.dev/)
- **fft.js**: A library for Fast Fourier Transform calculations. [GitHub Repository](https://github.com/indutny/fft.js)
- **Moattar, Mohammad & Homayoonpoor, Mahdi. (2010).** A simple but efficient real-time voice activity detection algorithm. [Research Paper](https://www.researchgate.net/publication/255667085_A_simple_but_efficient_real-time_voice_activity_detection_algorithm)
- **vitest**: A website for testing voice recognition. [Official Site](https://vitest.dev/)
- **Playwright**: A tool for automating browser testing. [Official Site](https://playwright.dev/)

### Audio Test Files

- `examples/albert.ogg`
  <a href="https://commons.wikimedia.org/wiki/File:03_ALBERT_EINSTEIN.ogg">Radio Universidad Nacional de La Plata</a>, <a href="https://creativecommons.org/licenses/by-sa/3.0">CC BY-SA 3.0</a>, via Wikimedia Commons
- `examples/jfk.wav`: <a href="https://creativecommons.org/licenses/by-sa/3.0">CC BY-SA 3.0</a>, via Wikimedia Commons
