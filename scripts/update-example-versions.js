const fs = require("fs");
const path = require("path");

// Load version number from /packages/shout/package.json
function getVersionFromPackage(packageName) {
  const packageJsonPath = path.join(
    __dirname,
    `../packages/${packageName}/package.json`
  );
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  return packageJson.version;
}

const shoutVersion = getVersionFromPackage("shout");
const transcriberVersion = getVersionFromPackage("transcriber");

// Function to update version in a file
function updateVersionInFile(filePath) {
  let fileContent = fs.readFileSync(filePath, "utf8");
  const versionRegex = /(\.wasm(?:_no-simd)?\.js\?v)(\d+\.\d+\.\d+)/g;
  fileContent = fileContent.replace(versionRegex, `$1${shoutVersion}`);

  const transcriberVersionRegex = /(\/src\/index\.js\?v)(\d+\.\d+\.\d+)/g;
  fileContent = fileContent.replace(
    transcriberVersionRegex,
    `$1${transcriberVersion}`
  );
  fs.writeFileSync(filePath, fileContent, "utf8");
}

// Update version in examples/index.html
const indexPath = path.join(__dirname, "../examples/index.html");
updateVersionInFile(indexPath);

// Update version in examples/stream.html
const streamPath = path.join(__dirname, "../examples/stream.html");
updateVersionInFile(streamPath);

console.log(
  `Updated version to ${shoutVersion} in examples/index.html and examples/stream.html`
);
