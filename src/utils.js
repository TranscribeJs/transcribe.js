/**
 * Load audio file as raw data, convert to [sampleRate] mono.
 *
 * @param {File} file Audio file
 * @param {number} sampleRate Output sample rate
 * @param {boolean} [toMono = false] Convert to mono
 * @returns {Promise<Float32Array|null>}
 */
export async function audioFileToPcm32(file, sampleRate, toMono = false) {
  if (!window.AudioContext || !window.OfflineAudioContext) {
    throw new Error("AudioContext not supported");
  }

  const audioContext = new AudioContext({ sampleRate });

  try {
    // read audio and convert to [sampleRate]
    const audioFileBuffer = await file.arrayBuffer();
    let buffer = await audioContext.decodeAudioData(audioFileBuffer);

    // downmix to mono
    if (toMono && buffer.numberOfChannels > 1) {
      buffer = await downmixAudioBufferToMono(buffer);
    }

    return buffer.getChannelData(0);
  } catch (e) {
    console.error(e);
    return null;
  }
}

/**
 * Convert buffer to mono.
 *
 * @param {AudioBuffer} buffer
 * @returns {Promise<AudioBuffer>}
 */
export async function downmixAudioBufferToMono(buffer) {
  const downmixContext = new OfflineAudioContext(
    1,
    buffer.length,
    buffer.sampleRate
  );

  const bufferSource = new AudioBufferSourceNode(downmixContext, { buffer });
  bufferSource.start(0);
  bufferSource.connect(downmixContext.destination);

  return await downmixContext.startRendering();
}

/**
 * Check if browser is Firefox.
 *
 * @returns {boolean}
 */
export function isFirefox() {
  return navigator.userAgent.toLowerCase().indexOf("firefox") > -1;
}

/**
 * Create VAD (Voice Activity Detection) AudioWorkletNode.
 * Call audioContext.addModule("vad.js") before creating the node.
 *
 * @param {AudioContext} audioContext Audio context
 * @param {CallableFunction} onSpeech Callback when speech detected
 * @param {CallableFunction} onSilence Callback when silence detected
 * @param {number} [minSilence=100] Minimum silence duration before call onSilence, in ms
 * @returns {AudioWorkletNode|null}
 */
export function createVad(audioContext, onSpeech, onSilence, minSilence = 100) {
  let vad;

  try {
    vad = new AudioWorkletNode(audioContext, "vad", {
      outputChannelCount: [1],
      processorOptions: {
        sampleRate: audioContext.sampleRate,
      },
    });
  } catch (error) {
    console.warn(
      "You've propably forgot to add the vad.js file to the audio context or used a wrong path (must be absolute). Please call audioContext.addModule('vad.js') before creating the node."
    );
    console.log(error);
    return null;
  }

  let isSpeech = false;
  let timeout = null;

  vad.port.onmessage = (event) => {
    const cmd = event.data["cmd"];

    if (cmd === "speech") {
      clearTimeout(timeout);

      if (!isSpeech) {
        onSpeech();
        isSpeech = true;
      }
    }

    if (cmd === "silence") {
      if (isSpeech) {
        clearTimeout(timeout);

        timeout = setTimeout(() => {
          onSilence();
          isSpeech = false;
        }, minSilence);
      }
    }
  };

  return vad;
}

/**
 * Create buffer AudioWorkletNode.
 * Call audioContext.addModule("buffer.js") before creating the node.
 *
 * @param {AudioContext} audioContext
 * @param {CallableFunction} onBuffer Called when buffer is full. (samples: Float32Array) => void
 * @param {number} [bufferSizeMs=100]
 * @returns {AudioWorkletNode|null}
 */
export function createBuffer(audioContext, onBuffer, bufferSizeMs = 100) {
  let buffer;

  try {
    buffer = new AudioWorkletNode(audioContext, "buffer", {
      outputChannelCount: [1],
      processorOptions: {
        sampleRate: audioContext.sampleRate,
        bufferSizeMs,
      },
    });
  } catch (error) {
    console.warn(
      "You've propably forgot to add the buffer.js file to the audio context or used a wrong path (must be absolute). Please call audioContext.addModule('buffer.js') before creating the node."
    );
    console.log(error);
    return null;
  }

  buffer.port.onmessage = (event) => {
    if (event.data["cmd"] === "buffer") {
      onBuffer(event.data.data["pcmf32"]);
    }
  };

  return buffer;
}
