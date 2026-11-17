import { zipSync } from 'fflate';
import { readZipDirectory, unzipText } from '../../src/ingest/zip';
import { stripCommonRoot } from '../../src/ingest/types';
import { fitBounds, toWorld, zoomAt } from '../../src/views/shared/camera';

describe('zip ingest', () => {
  const mtime = new Date(2025, 4, 6, 7, 8, 10);
  const zip = zipSync({
    'vault/a.md': [new TextEncoder().encode('# A'), { mtime }],
    'vault/sub/b.md': [new TextEncoder().encode('héllo'), { mtime }],
  });

  it('reads names, sizes and DOS modification times from the central directory', () => {
    const entries = readZipDirectory(zip);
    expect(entries.map((e) => e.name)).toEqual(['vault/a.md', 'vault/sub/b.md']);
    expect(entries[0]?.lastModified).toBe(mtime.getTime());
    expect(entries[1]?.size).toBe(new TextEncoder().encode('héllo').length);
  });

  it('unzips only requested entries as UTF-8 text', () => {
    const texts = unzipText(zip, new Set(['vault/sub/b.md']));
    expect([...texts]).toEqual([['vault/sub/b.md', 'héllo']]);
  });

  it('rejects non-zip data', () => {
    expect(() => readZipDirectory(new Uint8Array(100))).toThrow(/Not a zip/);
  });

  it('strips a shared top-level folder and reports it as the vault name', () => {
    expect(stripCommonRoot([{ path: 'v/a.md' }, { path: 'v/b/c.md' }])).toEqual({
      root: 'v',
      items: [{ path: 'a.md' }, { path: 'b/c.md' }],
    });
    expect(stripCommonRoot([{ path: 'a.md' }, { path: 'v/b.md' }]).root).toBeUndefined();
  });
});

describe('camera', () => {
  it('zooms around a fixed screen point', () => {
    const c = zoomAt({ x: 0, y: 0, scale: 1 }, 100, 50, 2);
    expect(c.scale).toBe(2);
    expect(toWorld(c, 100, 50)).toEqual({ x: 100, y: 50 });
  });
  it('fits bounds into the viewport', () => {
    const c = fitBounds(new Float32Array([-100, -50, 100, 50]), () => 0, 440, 240, 20);
    expect(c.scale).toBeCloseTo(2);
    expect(toWorld(c, 220, 120)).toEqual({ x: 0, y: 0 });
  });
});
