// Deterministic rasterization of three circles, for the native map image prop.
// No custom marker view/snapshot loop, and no additional build dependency.
/* global __dirname */
const { Buffer } = require('node:buffer');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([header, name, data, crc]);
}
for (const scale of [1, 2, 3]) {
  const size = 60 * scale;
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let red = 0, green = 0, blue = 0, alpha = 0;
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
      const distance = Math.hypot((x + (sx + 0.5) / 4) / scale - 30, (y + (sy + 0.5) / 4) / scale - 30);
      const a = distance < 14 ? 1 : distance < 30 ? 0.22 : 0;
      const white = distance >= 10 && distance < 14;
      red += 255 * a;
      green += (white ? 255 : 107) * a;
      blue += (white ? 255 : 53) * a;
      alpha += a;
    }
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    rows[offset] = alpha ? Math.round(red / alpha) : 0;
    rows[offset + 1] = alpha ? Math.round(green / alpha) : 0;
    rows[offset + 2] = alpha ? Math.round(blue / alpha) : 0;
    rows[offset + 3] = Math.round(alpha / 16 * 255);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; header[9] = 6;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
  const filename = `home-position-dot${scale === 1 ? '' : `@${scale}x`}.png`;
  fs.writeFileSync(path.join(__dirname, '..', 'assets', 'images', 'map-markers', filename), png);
  console.log(`${filename}: ${png.length} bytes`);
}
