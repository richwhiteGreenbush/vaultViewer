import { unzipSync } from 'fflate';

export interface ZipEntry {
  name: string;
  lastModified: number;
  size: number;
}

/** Reads names, sizes and modification times from a zip's central directory (fflate does not expose mtimes). */
export function readZipDirectory(data: Uint8Array): ZipEntry[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let eocd = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a zip file');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const out: ZipEntry[] = [];
  for (let n = 0; n < count && view.getUint32(p, true) === 0x02014b50; n++) {
    const time = view.getUint16(p + 12, true);
    const date = view.getUint16(p + 14, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const name = decoder.decode(data.subarray(p + 46, p + 46 + nameLen));
    const lastModified = new Date(
      (date >> 9) + 1980,
      ((date >> 5) & 15) - 1,
      date & 31,
      time >> 11,
      (time >> 5) & 63,
      (time & 31) * 2,
    ).getTime();
    if (!name.endsWith('/')) out.push({ name, lastModified, size });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** Unzips only the named entries and decodes them as UTF-8 text. */
export function unzipText(data: Uint8Array, names: Set<string>): Map<string, string> {
  const files = unzipSync(data, { filter: (f) => names.has(f.name) });
  const decoder = new TextDecoder();
  return new Map(Object.entries(files).map(([name, bytes]) => [name, decoder.decode(bytes)]));
}
