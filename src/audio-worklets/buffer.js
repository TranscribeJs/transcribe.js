// https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet
class AudioBufferProcessor extends AudioWorkletProcessor {
  sample_rate;
  buffer_size_ms = 10;

  buffer_size;
  buffer = [];

  constructor(options) {
    super(options);

    this.sample_rate = options.processorOptions.sampleRate;
    this.buffer_size_ms =
      options.processorOptions.bufferSizeMs ?? this.buffer_size_ms;
    this.buffer_size = (this.sample_rate * this.buffer_size_ms) / 1000;
  }

  post(cmd, data) {
    this.port.postMessage({
      cmd,
      data,
    });
  }

  process(inputs, outputs, parameters) {
    // buffer input data
    if (this.buffer.length < this.buffer_size) {
      try {
        this.buffer.push(...inputs[0][0]);
      } catch (error) {
        // just catch
      }

      return true;
    }

    this.post("buffer", {
      pcmf32: this.buffer,
    });

    this.buffer = [];

    return true;
  }
}

registerProcessor("buffer", AudioBufferProcessor);
