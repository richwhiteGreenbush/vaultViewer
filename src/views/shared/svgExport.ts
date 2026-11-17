/** Serializes an SVG view (with computed text colours inlined) to a standalone SVG string. */
export function svgToString(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const style = getComputedStyle(svg);
  const fill = getComputedStyle(svg.querySelector('text') ?? svg).fill || style.color;
  clone.querySelectorAll('text').forEach((t) => {
    if (!t.getAttribute('fill')) t.setAttribute('fill', fill);
    t.setAttribute('font-family', 'system-ui, sans-serif');
  });
  return new XMLSerializer().serializeToString(clone);
}

/** Rasterizes an SVG view to a 2x PNG on the theme background. */
export function svgToPng(svg: SVGSVGElement, background: string): Promise<Blob> {
  const w = Number(svg.getAttribute('width')) || svg.clientWidth;
  const h = Number(svg.getAttribute('height')) || svg.clientHeight;
  const url = URL.createObjectURL(new Blob([svgToString(svg)], { type: 'image/svg+xml' }));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w * 2;
      c.height = h * 2;
      const g = c.getContext('2d');
      if (!g) return reject(new Error('no 2d context'));
      g.fillStyle = background;
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('export failed'))), 'image/png');
    };
    img.onerror = () => reject(new Error('svg load failed'));
    img.src = url;
  });
}
