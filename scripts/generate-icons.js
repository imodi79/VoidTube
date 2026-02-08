const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const sharp = require("sharp");

const rootDir = path.join(__dirname, "..");
const sourceSvg = path.join(rootDir, "resource", "logo_sign.svg");
const buildDir = path.join(rootDir, "build");
const iconsetDir = path.join(buildDir, "icon.iconset");
const runtimePng = path.join(rootDir, "resource", "logo_sign.png");
const iconPng = path.join(buildDir, "icon.png");
const iconIco = path.join(buildDir, "icon.ico");
const iconIcns = path.join(buildDir, "icon.icns");

async function writePng(size, dest) {
  await sharp(sourceSvg).resize(size, size).png().toFile(dest);
}

async function generateIconset() {
  fs.rmSync(iconsetDir, { recursive: true, force: true });
  fs.mkdirSync(iconsetDir, { recursive: true });

  const entries = [
    { name: "icon_16x16.png", size: 16 },
    { name: "icon_16x16@2x.png", size: 32 },
    { name: "icon_32x32.png", size: 32 },
    { name: "icon_32x32@2x.png", size: 64 },
    { name: "icon_128x128.png", size: 128 },
    { name: "icon_128x128@2x.png", size: 256 },
    { name: "icon_256x256.png", size: 256 },
    { name: "icon_256x256@2x.png", size: 512 },
    { name: "icon_512x512.png", size: 512 },
    { name: "icon_512x512@2x.png", size: 1024 },
  ];

  await Promise.all(
    entries.map((entry) => writePng(entry.size, path.join(iconsetDir, entry.name)))
  );
}

async function generateIco() {
  const { default: pngToIco } = await import("png-to-ico");
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const buffers = await Promise.all(sizes.map((size) => sharp(sourceSvg).resize(size, size).png().toBuffer()));
  const ico = await pngToIco(buffers);
  fs.writeFileSync(iconIco, ico);
}

async function generateIcons() {
  if (!fs.existsSync(sourceSvg)) {
    throw new Error(`Missing icon source: ${sourceSvg}`);
  }
  fs.mkdirSync(buildDir, { recursive: true });

  await writePng(512, runtimePng);
  await writePng(1024, iconPng);
  await generateIconset();
  await generateIco();

  if (process.platform === "darwin") {
    try {
      execSync(`iconutil -c icns "${iconsetDir}" -o "${iconIcns}"`, { stdio: "ignore" });
    } catch (err) {
      console.warn("iconutil failed; mac builds will use the PNG icon.");
    }
  }
}

generateIcons().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
