# Changelog

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
