import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const TARGET_DIRECTORIES = [
  "public/images",
  "public/video",
  "public/logos",
];
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);
const MIN_SAVINGS_RATIO = 0.02;

function formatKb(bytes) {
  return `${Math.round(bytes / 1024)} KB`;
}

function getMaxWidth(filePath) {
  const normalized = filePath.replace(/\\/g, "/");

  if (normalized.includes("/logos/")) return 800;
  if (normalized.endsWith("/og-image.png")) return 1200;
  if (normalized.includes("/video/")) return 1920;
  return 1600;
}

async function collectFiles(directory) {
  const absoluteDirectory = path.join(ROOT, directory);
  const entries = await fs.readdir(absoluteDirectory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(absoluteDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(path.relative(ROOT, absolutePath)));
      continue;
    }

    if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(absolutePath);
    }
  }

  return files;
}

async function optimizeImage(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const originalBuffer = await fs.readFile(filePath);
  const originalSize = originalBuffer.byteLength;

  const image = sharp(originalBuffer, { failOn: "none" }).rotate();
  const metadata = await image.metadata();
  const resizeWidth = metadata.width && metadata.width > getMaxWidth(filePath)
    ? getMaxWidth(filePath)
    : undefined;

  let pipeline = image;
  if (resizeWidth) {
    pipeline = pipeline.resize({ width: resizeWidth, withoutEnlargement: true });
  }

  if (extension === ".png") {
    pipeline = pipeline.png({
      compressionLevel: 9,
      palette: true,
      quality: 80,
      effort: 10,
    });
  } else {
    pipeline = pipeline.jpeg({
      quality: 78,
      mozjpeg: true,
      progressive: true,
    });
  }

  const optimizedBuffer = await pipeline.toBuffer();
  const optimizedSize = optimizedBuffer.byteLength;
  const savedBytes = originalSize - optimizedSize;
  const savingsRatio = savedBytes / originalSize;

  if (savedBytes <= 0 || savingsRatio < MIN_SAVINGS_RATIO) {
    return null;
  }

  await fs.writeFile(filePath, optimizedBuffer);

  return {
    filePath,
    originalSize,
    optimizedSize,
    savedBytes,
  };
}

async function main() {
  const files = (
    await Promise.all(TARGET_DIRECTORIES.map((directory) => collectFiles(directory)))
  ).flat();

  let totalOriginal = 0;
  let totalOptimized = 0;
  let optimizedCount = 0;

  for (const file of files) {
    const result = await optimizeImage(file);
    if (!result) continue;

    optimizedCount += 1;
    totalOriginal += result.originalSize;
    totalOptimized += result.optimizedSize;

    const relativePath = path.relative(ROOT, result.filePath);
    console.log(
      `${relativePath}: ${formatKb(result.originalSize)} -> ${formatKb(result.optimizedSize)}`
    );
  }

  if (optimizedCount === 0) {
    console.log("No images needed optimization.");
    return;
  }

  console.log("");
  console.log(
    `Optimized ${optimizedCount} image(s), saving ${formatKb(totalOriginal - totalOptimized)} total.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
