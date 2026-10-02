import { join } from "path";
import { readdir, unlink, stat } from "fs/promises";

/**
 * Loại bỏ dấu tiếng Việt và ký tự đặc biệt để tạo tên file an toàn (slug)
 */
export function sanitizeFilename(text: string): string {
  const normalized = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
  const clean = normalized
    .replace(/[^a-zA-Z0-9_\-\s]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  return clean || "guest";
}

/**
 * Tạo file ZIP chuẩn (Store - không nén để đạt tốc độ tối đa ~0.5s cho 200 video)
 * Hoàn toàn bằng TypeScript thuần, 0 dependency ngoài, tương thích 100% khi build executable.
 */
export async function createStoredZip(
  files: { path: string; name: string }[],
  zipOutPath: string
): Promise<number> {
  const localHeaders: Uint8Array[] = [];
  const centralHeaders: Uint8Array[] = [];
  let offset = 0;

  // CRC32 Table
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[i] = c >>> 0;
  }

  function calcCrc32(buf: Uint8Array): number {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  const parts: Uint8Array[] = [];

  for (const f of files) {
    const file = Bun.file(f.path);
    if (!(await file.exists())) continue;

    const data = new Uint8Array(await file.arrayBuffer());
    const nameBytes = new TextEncoder().encode(f.name);
    const crc = calcCrc32(data);
    const size = data.length;

    // Local file header (30 bytes + name)
    const lh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true); // signature
    lv.setUint16(4, 20, true);         // version needed (2.0)
    lv.setUint16(6, 0x0800, true);     // flags (UTF-8)
    lv.setUint16(8, 0, true);          // compression (0 = stored)
    lv.setUint16(10, 0, true);         // mod time
    lv.setUint16(12, 0, true);         // mod date
    lv.setUint32(14, crc, true);       // crc-32
    lv.setUint32(18, size, true);      // compressed size
    lv.setUint32(22, size, true);      // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);         // extra len
    lh.set(nameBytes, 30);

    const localOffset = offset;
    parts.push(lh, data);
    offset += lh.length + data.length;

    // Central directory header (46 bytes + name)
    const ch = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); // signature
    cv.setUint16(4, 20, true);         // version made by
    cv.setUint16(6, 20, true);         // version needed
    cv.setUint16(8, 0x0800, true);     // flags (UTF-8)
    cv.setUint16(10, 0, true);         // compression (0 = stored)
    cv.setUint16(12, 0, true);         // mod time
    cv.setUint16(14, 0, true);         // mod date
    cv.setUint32(16, crc, true);       // crc32
    cv.setUint32(20, size, true);      // comp size
    cv.setUint32(24, size, true);      // uncomp size
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);         // extra len
    cv.setUint16(32, 0, true);         // comment len
    cv.setUint16(34, 0, true);         // disk start
    cv.setUint16(36, 0, true);         // internal attrs
    cv.setUint32(38, 0, true);         // external attrs
    cv.setUint32(42, localOffset, true); // relative offset of local header
    ch.set(nameBytes, 46);

    centralHeaders.push(ch);
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const ch of centralHeaders) {
    parts.push(ch);
    centralDirSize += ch.length;
  }

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // signature
  ev.setUint16(4, 0, true);          // disk number
  ev.setUint16(6, 0, true);          // disk with cd
  ev.setUint16(8, centralHeaders.length, true);  // entries on disk
  ev.setUint16(10, centralHeaders.length, true); // total entries
  ev.setUint32(12, centralDirSize, true);        // size of cd
  ev.setUint32(16, centralDirOffset, true);      // offset of cd
  ev.setUint16(20, 0, true);                     // comment len
  parts.push(eocd);

  // Write all chunks to destination file
  const totalLength = parts.reduce((acc, p) => acc + p.length, 0);
  const finalZip = new Uint8Array(totalLength);
  let cur = 0;
  for (const p of parts) {
    finalZip.set(p, cur);
    cur += p.length;
  }

  await Bun.write(zipOutPath, finalZip);
  return finalZip.length;
}

/**
 * Dọn dẹp video tạm thời trong thư mục output và scratch_temp
 */
export async function cleanupTemporaryFiles(
  outputDir: string,
  scratchDir?: string,
  uploadsDir?: string
): Promise<number> {
  let count = 0;
  try {
    const outFiles = await readdir(outputDir);
    for (const f of outFiles) {
      if (f.startsWith("video_") && f.endsWith(".mp4")) {
        await unlink(join(outputDir, f)).catch(() => {});
        count++;
      } else if (f.endsWith(".png") && f !== "sample_preview.png") {
        await unlink(join(outputDir, f)).catch(() => {});
      }
    }
  } catch {}

  if (scratchDir) {
    try {
      const tempFiles = await readdir(scratchDir);
      for (const tf of tempFiles) {
        if (tf.startsWith("web_txt_") || tf.startsWith("overlay_")) {
          await unlink(join(scratchDir, tf)).catch(() => {});
        }
      }
    } catch {}
  }

  if (uploadsDir) {
    try {
      const uploadFiles = await readdir(uploadsDir);
      for (const uf of uploadFiles) {
        if (uf.startsWith("user_bg_") && uf.endsWith(".mp4")) {
          await unlink(join(uploadsDir, uf)).catch(() => {});
          count++;
        }
      }
    } catch {}
  }

  return count;
}
