/** Serializes an SVG view to a standalone SVG string: inlines text colours and adds the theme background. */
export function svgToString(svg: SVGSVGElement, background?: string): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const textFill = (t: Element) => getComputedStyle(t).fill;
  const originals = svg.querySelectorAll('text');
  clone.querySelectorAll('text').forEach((t, i) => {
    const o = originals[i];
    if (!t.getAttribute('fill') && o) t.setAttribute('fill', textFill(o));
    t.setAttribute('font-family', 'system-ui, sans-serif');
  });
  if (background) {
    const [
      x = '0',
      y = '0',
      w = clone.getAttribute('width') ?? '0',
      h = clone.getAttribute('height') ?? '0',
    ] = (clone.getAttribute('viewBox') ?? '').split(/\s+/);
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    for (const [k, v] of Object.entries({ x, y, width: w, height: h, fill: background }))
      rect.setAttribute(k, v);
    clone.insertBefore(rect, clone.firstChild);
  }
  return new XMLSerializer().serializeToString(clone);
}

/** Rasterizes an SVG view to a 2x PNG on the theme background. */
export function svgToPng(svg: SVGSVGElement, background: string): Promise<Blob> {
  const w = Number(svg.getAttribute('width')) || svg.clientWidth;
  const h = Number(svg.getAttribute('height')) || svg.clientHeight;
  const url = URL.createObjectURL(new Blob([svgToString(svg, background)], { type: 'image/svg+xml' }));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w * 2;
      c.height = h * 2;
      const g = c.getContext('2d');
      if (!g) return reject(new Error('no 2d context'));
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('export failed'))), 'image/png');
    };
    img.onerror = () => reject(new Error('svg load failed'));
    img.src = url;
  });
}
