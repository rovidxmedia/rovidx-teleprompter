// Original geometric aperture mark; PNG and ICO generated without external image dependencies.
const fs = require("node:fs");
const zlib = require("node:zlib");
function makePNG(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const polygon = [
    [131, 49],
    [197, 87],
    [153, 162],
    [108, 162],
  ].map(([x, y]) => [x - 128, y - 128]);
  function inside(x, y, points) {
    let hit = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i],
        b = points[j];
      if (
        a[1] > y !== b[1] > y &&
        x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
      )
        hit = !hit;
    }
    return hit;
  }
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (x * 256) / size - 128,
        dy = (y * 256) / size - 128,
        roundX = Math.max(Math.abs(dx) - 82, 0),
        roundY = Math.max(Math.abs(dy) - 82, 0);
      const inSquare = roundX * roundX + roundY * roundY <= 32 * 32;
      let color = [24, 28, 29, inSquare ? 255 : 0];
      const distance = Math.hypot(dx, dy);
      if (distance > 89 && distance < 96) color = [220, 244, 127, 255];
      if (distance < 85)
        for (let blade = 0; blade < 6; blade++) {
          const angle = (blade * Math.PI) / 3,
            c = Math.cos(angle),
            s = Math.sin(angle);
          if (inside(dx * c + dy * s, -dx * s + dy * c, polygon)) {
            color = [220, 244, 127, 255];
            break;
          }
        }
      const at = y * (size * 4 + 1) + 1 + x * 4;
      for (let i = 0; i < 4; i++) raw[at + i] = color[i];
    }
  function crc32(buffer) {
    let c = 0xffffffff;
    for (const byte of buffer) {
      c ^= byte;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
    return (c ^ 0xffffffff) >>> 0;
  }
  function chunk(type, data) {
    const t = Buffer.from(type),
      out = Buffer.alloc(data.length + 12);
    out.writeUInt32BE(data.length);
    t.copy(out, 4);
    data.copy(out, 8);
    out.writeUInt32BE(crc32(Buffer.concat([t, data])), data.length + 8);
    return out;
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return png;
}
const png = makePNG(256);
fs.mkdirSync("build", { recursive: true });
fs.writeFileSync("public/icon.png", makePNG(512));
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(1, 4);
ico.writeUInt16LE(1, 10);
ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png.length, 14);
ico.writeUInt32LE(22, 18);
fs.writeFileSync("build/icon.ico", Buffer.concat([ico, png]));
