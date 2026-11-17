import { graphHash } from '../../../src/core/graph/metrics';
import { folderColor, hexToNumber, tagColor } from '../../../src/core/color/tagColor';
import { palettes } from '../../../src/core/color/palettes';

describe('graphHash', () => {
  it('is order-independent and changes when structure changes', () => {
    const a = graphHash(['x', 'y'], [{ source: 'x', target: 'y' }]);
    expect(graphHash(['y', 'x'], [{ source: 'x', target: 'y' }])).toBe(a);
    expect(graphHash(['x', 'y'], [{ source: 'y', target: 'x' }])).not.toBe(a);
    expect(graphHash(['x', 'y', 'z'], [{ source: 'x', target: 'y' }])).not.toBe(a);
  });
});

describe('tagColor', () => {
  it('is deterministic per tag and theme, and differs across themes', () => {
    for (const t of Object.values(palettes))
      expect(tagColor('project/alpha', t)).toBe(tagColor('project/alpha', t));
    expect(tagColor('x', palettes.neon)).not.toBe(tagColor('x', palettes.pastel));
    expect(tagColor('a', palettes.darkSpace)).toMatch(/^#[0-9a-f]{6}$/);
  });
  it('nested tags share the parent hue but shift lightness', () => {
    expect(tagColor('project/alpha', palettes.darkSpace)).not.toBe(tagColor('project', palettes.darkSpace));
  });
  it('folder colors and hex parsing', () => {
    expect(folderColor('Projects/Alpha', palettes.darkSpace)).toBe(
      folderColor('Projects', palettes.darkSpace),
    );
    expect(hexToNumber('#ff0001')).toBe(0xff0001);
  });
});
