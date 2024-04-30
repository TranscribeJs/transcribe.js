import FFT from "./fft.js";

/**
 * AudioWorkletProcessor for Voice Activity Detection (VAD).
 *
 * From: Moattar, Mohammad & Homayoonpoor, Mahdi. (2010). A simple but efficient real-time voice activity detection algorithm. European Signal Processing Conference.
 * @see https://www.researchgate.net/publication/255667085_A_simple_but_efficient_real-time_voice_activity_detection_algorithm
 */
class AudioVADProcessor extends AudioWorkletProcessor {
  primThresh_e = 40;
  primThresh_f_hz = 185;
  primThresh_sfm = 5;
  frame_size_ms = 10;

  is_speech_frame_counter = 0;
  is_silent_frame_counter = 0;

  e_min = null;
  f_min = null;
  sfm_min = null;

  sample_rate;
  fft_size = 128;
  fft; // FFT.js instance

  buffer = [];
  frame_size;
  frame_counter = 0;

  last_command_was_speech = true;

  debug = false;

  constructor(options) {
    super(options);

    this.debug = options.processorOptions.debug ?? this.debug;

    this.last_command_was_speech =
      options.processorOptions.lastCommandWasSpeech ??
      this.last_command_was_speech;
    this.sample_rate = options.processorOptions.sampleRate;
    this.fft_size = options.processorOptions.fftSize ?? this.fft_size;
    this.fft = new FFT(this.fft_size);
    this.frame_size = (this.sample_rate * this.frame_size_ms) / 1000;
  }

  post(cmd, data) {
    this.port.postMessage({
      cmd,
      data,
    });
  }

  getSpectrum(data) {
    // zero pad data
    while (data.length < this.fft_size) {
      data.push(0);
    }

    // calculate fft
    const input = this.fft.toComplexArray(data);
    const out = this.fft.createComplexArray();

    this.fft.realTransform(out, input);

    // get amplitude array
    var res = new Array(out.length >>> 1);
    for (var i = 0; i < out.length; i += 2) {
      let real = out[i];
      let imag = out[i + 1];
      res[i >>> 1] = Math.sqrt(real * real + imag * imag);
    }

    return res.slice(0, res.length / 2 - 1);
  }

  process(inputs, outputs, parameters) {
    if (!inputs || !inputs[0] || !inputs[0][0]) {
      return false;
    }
    // buffer input data
    if (this.buffer.length < this.frame_size) {
      this.buffer.push(...inputs[0][0]);
      return true;
    }

    // get time and frequency data
    const timeData = new Float32Array(this.buffer);
    const frequencyData = this.getSpectrum(this.buffer);

    // set dc offset to 0
    frequencyData[0] = 0;

    // reset buffer
    this.buffer = [];

    // increment frame counter
    this.frame_counter++;

    // calculate energy of the frame
    let energy = 0;

    for (let i = 0; i < timeData.length; i++) {
      energy += timeData[i] * timeData[i];
    }

    // get frequency with highest amplitude...
    let f_max = 0;
    let f_max_index = 0;

    // ...and spectral flatness
    let sfm = 0;
    let sfm_sum_geo = 0;
    let sfm_sum_ari = 0;

    // calc both in one loop
    for (let i = 0; i < frequencyData.length; i++) {
      // find frequency with highest amplitude
      if (frequencyData[i] > f_max) {
        f_max = frequencyData[i];
        f_max_index = i;
      }

      // spectral flatness (geometric mean, arithmetic mean)
      const f_geo = frequencyData[i] > 0 ? frequencyData[i] : 1;
      sfm_sum_geo += Math.log(f_geo);
      sfm_sum_ari += f_geo;
    }

    // get frequency in Hz for highest amplitude
    const f_max_hz = (f_max_index * this.sample_rate) / this.fft_size;

    // calculate spectral flatness
    sfm =
      -10 *
      Math.log10(
        Math.exp(sfm_sum_geo / frequencyData.length) /
          (sfm_sum_ari / frequencyData.length)
      );

    // just safety check
    sfm = isFinite(sfm) ? sfm : 0;

    // set initial min values from first 30 frames
    if (this.e_min === null || this.frame_counter < 30) {
      this.e_min = this.e_min > energy && energy !== 0 ? this.e_min : energy;
      this.f_min = this.f_min > f_max_hz ? f_max_hz : this.f_min;
      this.sfm_min = this.sfm_min > sfm ? sfm : this.sfm_min;
    }

    // frame vad counter
    let count = 0;

    // calculate current energy threshold
    const current_thresh_e = this.primThresh_e * Math.log10(this.e_min);

    // check energy threshold
    if (energy - this.e_min >= current_thresh_e) {
      count++;
    }

    // check frequency threshold
    if (f_max > 1 && f_max_hz - this.f_min >= this.primThresh_f_hz) {
      count++;
    }

    // check spectral flatness threshold
    if (sfm > 0 && sfm - this.sfm_min <= this.primThresh_sfm) {
      count++;
    }

    if (count > 1) {
      // is speech
      this.is_speech_frame_counter++;
      this.is_silent_frame_counter = 0;
    } else {
      // is silence, so update min energy value
      this.is_silent_frame_counter++;
      this.e_min =
        (this.is_silent_frame_counter * this.e_min + energy) /
        (this.is_silent_frame_counter + 1);
      this.is_speech_frame_counter = 0;
    }

    // debug
    if (this.debug) {
      this.post("log", {
        size: inputs[0][0].length,
        sampleRate: this.sample_rate,
        e: energy,
        e_true: energy - this.e_min >= current_thresh_e,
        f: f_max_hz,
        f_true: f_max > 1 && f_max_hz - this.f_min >= this.primThresh_f_hz,
        sfm: sfm,
        sfm_true: sfm - this.sfm_min <= this.primThresh_sfm,
        plot: sfm_sum_ari / frequencyData.length,
      });
    }

    // ignore silence if less than 10 frames
    if (this.is_silent_frame_counter > 10 && this.last_command_was_speech) {
      if (this.debug) {
        this.post("silence", { signal: sfm_sum_ari / frequencyData.length });
      } else {
        this.post("silence");
      }

      this.last_command_was_speech = false;
    }

    // ignore speech if less than 5 frames
    if (this.is_speech_frame_counter > 4 && !this.last_command_was_speech) {
      if (this.debug) {
        this.post("speech", { signal: sfm_sum_ari / frequencyData.length });
      } else {
        this.post("speech");
      }

      this.last_command_was_speech = true;
    }

    // return true to keep processor alive
    return true;
  }
}

registerProcessor("vad", AudioVADProcessor);
