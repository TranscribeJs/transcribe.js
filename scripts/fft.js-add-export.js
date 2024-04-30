// read fft.js file from node_modules
const fs = require("fs");
const path = require("path");
const fftPath = path.join(__dirname, "../node_modules/fft.js/lib/fft.js");
const fft = fs.readFileSync(fftPath, "utf8");

// replace module.exports with es6 export
fftExport = fft.replace("module.exports = FFT;", "export default FFT;");

// read license text
const licensePath = path.join(__dirname, "./fft.js-license");
const license = fs.readFileSync(licensePath, "utf8");

// write fft.js with license
fftExport = license + fftExport;

// write fft.js with export
fs.writeFileSync(
  path.join(__dirname, "../src/audio-worklets/fft.js"),
  fftExport
);
