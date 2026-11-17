import type { Root, PhrasingContent, Text } from 'mdast';
import { visit, SKIP } from 'unist-util-visit';
import { splitWikilink } from '../../core/parse/remarkWikilinks';

const WIKILINK = /(!?)\[\[([^[\]\n]+?)\]\]/g;
export const WIKI_PREFIX = 'vl-wiki:';

/**
 * remark plugin for the preview: turns [[Target#Heading|Alias]] and ![[Embed]] inside text into link nodes with
 * a `vl-wiki:` URL (code is a different node type, so it is never touched). Also drops YAML frontmatter.
 */
export function remarkWikilinkLinks() {
  return (tree: Root) => {
    tree.children = tree.children.filter((n) => n.type !== 'yaml');
    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || index === undefined || !node.value.includes('[[')) return;
      const out: PhrasingContent[] = [];
      let pos = 0;
      for (const m of node.value.matchAll(WIKILINK)) {
        if (m.index > pos) out.push({ type: 'text', value: node.value.slice(pos, m.index) });
        const { target, heading, alias } = splitWikilink(m[2] ?? '');
        const label = alias ?? (heading ? `${target}${target ? ' › ' : ''}${heading}` : target);
        out.push({
          type: 'link',
          url: `${WIKI_PREFIX}${encodeURIComponent(target)}${heading ? `#${encodeURIComponent(heading)}` : ''}`,
          title: m[1] ? 'embed' : null,
          children: [{ type: 'text', value: m[1] ? `↳ ${label}` : label }],
        });
        pos = m.index + m[0].length;
      }
      if (!out.length) return;
      if (pos < node.value.length) out.push({ type: 'text', value: node.value.slice(pos) });
      (parent.children as PhrasingContent[]).splice(index, 1, ...out);
      return [SKIP, index + out.length];
    });
  };
}
