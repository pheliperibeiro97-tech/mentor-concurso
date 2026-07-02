// Gera um PNG 1024x1024 (fundo índigo com um "M" branco estilizado) para o ícone do app.
import zlib from "node:zlib";
import { writeFileSync } from "node:fs";

const W = 1024, H = 1024;
const bg = [79, 70, 229]; // indigo
const fg = [255, 255, 255];

// desenha um "M" simples com retângulos
function isM(x, y) {
  const m = 200; // margem
  const ix = x - m, iy = y - m, iw = W - 2 * m, ih = H - 2 * m;
  if (ix < 0 || iy < 0 || ix > iw || iy > ih) return false;
  const t = iw * 0.16; // espessura
  // hastes verticais
  if (ix < t) return true;
  if (ix > iw - t) return true;
  // diagonais centrais (V invertido)
  const cx = iw / 2;
  const slope = (cx - t) / (ih * 0.6);
  if (iy < ih * 0.6) {
    const leftEdge = t + iy / slope;
    const rightEdge = iw - t - iy / slope;
    if (Math.abs(ix - leftEdge) < t * 0.8) return true;
    if (Math.abs(ix - rightEdge) < t * 0.8) return true;
  }
  return false;
}

const raw = Buffer.alloc((W * 4 + 1) * H);
let p = 0;
for (let y = 0; y < H; y++) {
  raw[p++] = 0; // filtro none
  for (let x = 0; x < W; x++) {
    const c = isM(x, y) ? fg : bg;
    raw[p++] = c[0];
    raw[p++] = c[1];
    raw[p++] = c[2];
    raw[p++] = 255;
  }
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const idat = zlib.deflateSync(raw);
const png = Buffer.concat([
  sig,
  chunk("IHDR", ihdr),
  chunk("IDAT", idat),
  chunk("IEND", Buffer.alloc(0)),
]);
writeFileSync(process.argv[2] || "icon-source.png", png);
console.log("icon written:", png.length, "bytes");
