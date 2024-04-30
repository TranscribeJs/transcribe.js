import fs from "fs";
import { globbySync } from "globby";

function copyFiles(globPattern, destinationPath) {
  // Find all files based on the glob pattern
  const files = globbySync(globPattern);

  // Create the destination directory if it doesn't exist
  if (!fs.existsSync(destinationPath)) {
    fs.mkdirSync(destinationPath, { recursive: true });
  }

  // Copy each file to the destination path
  files.forEach((file) => {
    const fileName = file.split("/").pop();
    const destination = `${destinationPath}/${fileName}`;

    fs.copyFileSync(file, destination);
    console.log(`Copied ${file} to ${destination}`);
  });
}

// set destination
const destinationPath = "packages/transcriber/src";

// clear destination
if (fs.existsSync(destinationPath)) {
  fs.rmSync(destinationPath, { recursive: true });
}

// create .gitignore
fs.mkdirSync(destinationPath);

// copy files
copyFiles(["src/audio-worklets"], destinationPath + "/audio-worklets");
copyFiles(["src/*.js"], destinationPath);
copyFiles(["README.md"], destinationPath + "/../");
