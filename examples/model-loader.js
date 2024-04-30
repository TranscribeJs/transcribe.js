// helper file to preload/cache model file

// install service worker
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("model-loader.worker.js")
    .then(() => location.reload);
}

// fetch model file after confirm
async function preload(modelFile, printConsole) {
  if (
    await window.confirm(
      "Transcribe.js needs a model file to work. This file is 32MB and will be cached in your browser. Click OK to load the file."
    )
  ) {
    printConsole("Downloading model file... please wait.");
    await fetch(modelFile);
    printConsole("Model file downloaded. You can now start transcribing.");
    return true;
  } else {
    printConsole(
      "Model file not downloaded. You need to load the model file before you can start transcribing."
    );
    return false;
  }
}

// check if model file is cached, if not, preload
// change cache name to update model file in cache
async function preloadModel(modelFile, printConsole = console.log) {
  const hasCache = await caches.has("model-v1");
  if (hasCache) return true;

  if (await preload(modelFile, printConsole)) {
    return true;
  } else {
    return false;
  }
}
