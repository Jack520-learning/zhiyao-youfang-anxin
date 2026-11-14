import { copyFile, mkdir, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const outputRoot = join(root, "public", "ocr");
const coreOutput = join(outputRoot, "core");
const langOutput = join(outputRoot, "lang");

await Promise.all([
  mkdir(coreOutput, { recursive: true }),
  mkdir(langOutput, { recursive: true })
]);

await copyFile(
  join(root, "node_modules", "tesseract.js", "dist", "worker.min.js"),
  join(outputRoot, "worker.min.js")
);

const coreFiles = await readdir(join(root, "node_modules", "tesseract.js-core"));
await Promise.all(
  coreFiles
    .filter((file) => file.endsWith(".wasm") || file.endsWith(".wasm.js"))
    .map((file) =>
      copyFile(
        join(root, "node_modules", "tesseract.js-core", basename(file)),
        join(coreOutput, basename(file))
      )
    )
);

await copyFile(
  join(
    root,
    "node_modules",
    "@tesseract.js-data",
    "chi_sim",
    "4.0.0_best_int",
    "chi_sim.traineddata.gz"
  ),
  join(langOutput, "chi_sim.traineddata.gz")
);

console.log("OCR assets prepared in public/ocr");
