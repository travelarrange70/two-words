const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPNG(width, height, r, g, b) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // Bit depth: 8
  ihdr[9] = 2;  // Color type: 2 (RGB)
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace
  const ihdrChunk = makeChunk('IHDR', ihdr);

  const rowSize = 1 + width * 3;
  const rawData = Buffer.alloc(height * rowSize);
  
  const cx = width / 2;
  const cy = height / 2;
  const maxR = (width / 2) * 0.85;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter type 0
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 3;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < maxR * 0.25) {
        // Inner core (cyan)
        rawData[pxOffset] = 0;
        rawData[pxOffset + 1] = 240;
        rawData[pxOffset + 2] = 255;
      } else if (dist > maxR * 0.45 && dist < maxR * 0.65) {
        // Outer ring (neon pink/magenta)
        rawData[pxOffset] = 236;
        rawData[pxOffset + 1] = 72;
        rawData[pxOffset + 2] = 153;
      } else if (dist <= maxR) {
        // Dark ring
        rawData[pxOffset] = 15;
        rawData[pxOffset + 1] = 23;
        rawData[pxOffset + 2] = 42;
      } else {
        // Background
        rawData[pxOffset] = r;
        rawData[pxOffset + 1] = g;
        rawData[pxOffset + 2] = b;
      }
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const bufToCrc = Buffer.concat([typeBuf, data]);
  const crc = crc32(bufToCrc);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c ^= buf[n];
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

const iconsDir = __dirname;

const sizes = [72, 96, 128, 192, 512];
sizes.forEach(size => {
  const buf = createPNG(size, size, 3, 3, 5);
  const filePath = path.join(iconsDir, `icon-${size}.png`);
  fs.writeFileSync(filePath, buf);
  console.log(`Generated ${filePath} (${buf.length} bytes)`);
});
