import Markdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import { remarkWikilinkLinks, WIKI_PREFIX } from './remarkWikilinks';
import { strings } from '../../strings';
import { ATTACHMENT_EXT } from '../../core/parse/paths';

export interface MarkdownViewProps {
  text: string;
  /** Resolves a link written in this note; returns the note id it points to and whether that note exists. */
  resolve(target: string, kind: 'wikilink' | 'markdown'): { target: string; resolved: boolean } | null;
  onOpen(id: string): void;
}

const EXTERNAL = /^[a-z][a-z0-9+.-]*:/i;

/** Rendered note body. Wikilinks and relative note links focus notes in the view; nothing loads remotely. */
export default function MarkdownView({ text, resolve, onOpen }: MarkdownViewProps) {
  const components: Components = {
    a({ href = '', children, title }) {
      let r: ReturnType<MarkdownViewProps['resolve']> = null;
      if (href.startsWith(WIKI_PREFIX)) {
        const target = decodeURIComponent(href.slice(WIKI_PREFIX.length).split('#')[0] ?? '');
        if (ATTACHMENT_EXT.test(target))
          return <span className="md-img">{strings.preview.image(target)}</span>;
        r = resolve(target, 'wikilink');
      } else if (href && !href.startsWith('#') && !EXTERNAL.test(href)) {
        r = resolve(decodeURIComponent(href.split('#')[0] ?? ''), 'markdown');
      }
      if (r) {
        const target = r.target;
        return (
          <button
            type="button"
            className={`md-link${r.resolved ? '' : ' md-link--ghost'}${title === 'embed' ? ' md-link--embed' : ''}`}
            title={r.resolved ? undefined : strings.preview.missing}
            data-target={target}
            onClick={() => onOpen(target)}
          >
            {children}
          </button>
        );
      }
      if (EXTERNAL.test(href)) {
        return (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        );
      }
      return <span className="md-anchor">{children}</span>;
    },
    // Never fetch images: remote URLs would leave the device, and vault-relative images are not loaded in v1.
    img({ src, alt }) {
      if (typeof src === 'string' && src.startsWith('data:image/')) return <img src={src} alt={alt ?? ''} />;
      return (
        <span className="md-img">{strings.preview.image(alt || (typeof src === 'string' ? src : ''))}</span>
      );
    },
  };
  return (
    <div className="markdown">
      <Markdown
        remarkPlugins={[remarkGfm, [remarkFrontmatter, ['yaml']], remarkWikilinkLinks]}
        urlTransform={(url) => (url.startsWith(WIKI_PREFIX) ? url : defaultUrlTransform(url))}
        components={components}
        skipHtml
      >
        {text}
      </Markdown>
    </div>
  );
}
