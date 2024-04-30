// read all types from src/types and bundle them into a single file

const fs = require("fs");
const path = require("path");

const typesSrc = "../src/types";
const packageDir = "../packages/transcriber";

const typesDir = path.resolve(__dirname, typesSrc);
const types = fs.readdirSync(typesDir);

// open module declaration
let out = "declare module '@transcribe/transcriber' {\n";

// read src/types.d.ts
out += fs.readFileSync(path.resolve(__dirname, "../src/types.d.ts"), "utf-8");

// read generated
types.forEach((type) => {
  // read file content
  const content = fs.readFileSync(path.resolve(typesDir, type), "utf-8");
  // fix import paths
  out += content.replace("./Transcriber.js", "./src/Transcriber.js") + "\n";
});

// remove import "types.d.ts" because it's already included
out = out.replaceAll('import("./types.d.ts").', "");
out = out.replaceAll('import { Transcriber } from "./src/Transcriber.js";', "");

// close module
out += "}\n";

// write to package
fs.writeFileSync(path.resolve(__dirname, packageDir, "index.d.ts"), out);
