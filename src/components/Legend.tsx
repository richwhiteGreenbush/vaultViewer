import { useState } from 'react';
import { strings } from '../strings';
import { useViewStore } from '../state/viewStore';
import { useThemeStore } from '../state/themeStore';
import { viewById } from '../views/registry';
import type { LegendItem } from '../views/types';
import type { ThemePalette } from '../core/color/palettes';

function Icon({ kind, theme }: { kind: LegendItem['kind']; theme: ThemePalette }) {
  const a = theme.accent;
  const seq = theme.sequential;
  const shapes: Record<LegendItem['kind'], React.ReactNode> = {
    size: (
      <>
        <circle cx="5" cy="9" r="2.5" fill={a} />
        <circle cx="14" cy="8" r="5" fill={a} />
      </>
    ),
    color: (
      <>
        <circle cx="5" cy="8" r="3.5" fill="#e0607e" />
        <circle cx="11" cy="8" r="3.5" fill="#5fb7e0" />
        <circle cx="17" cy="8" r="3.5" fill="#8fd16a" />
      </>
    ),
    glow: (
      <>
        <circle cx="10" cy="8" r="7" fill={a} opacity="0.25" />
        <circle cx="10" cy="8" r="3.5" fill={a} />
      </>
    ),
    ghost: <circle cx="10" cy="8" r="4.5" fill="none" stroke={theme.ghost} strokeWidth="1.5" />,
    comet: (
      <>
        <path d="M1 12 L14 7 L14 9 Z" fill={a} opacity="0.5" />
        <circle cx="15" cy="8" r="3" fill={a} />
      </>
    ),
    line: <path d="M2 12 L18 4" stroke={theme.text} strokeOpacity="0.6" strokeWidth="1.2" />,
    position: <path d="M3 8h14M13 4l4 4-4 4" stroke={theme.text} fill="none" strokeWidth="1.5" />,
    time: <path d="M2 13h16M4 13v-3M10 13v-6M16 13v-9" stroke={theme.text} strokeWidth="1.5" />,
    scale: (
      <>
        {seq.map((c, i) => (
          <rect key={c} x={1 + i * 3.6} y="4" width="3.2" height="8" fill={c} />
        ))}
      </>
    ),
    sun: (
      <>
        <circle cx="8" cy="8" r="4.5" fill="#ffc46b" />
        <circle cx="16.5" cy="5" r="1.8" fill={theme.mutedText} />
      </>
    ),
    stem: <path d="M10 15V3M10 9l5-4M10 11l-5-3" stroke="#6fbf73" strokeWidth="1.6" fill="none" />,
    seed: (
      <>
        <circle cx="5" cy="11" r="1.6" fill={theme.mutedText} />
        <circle cx="10" cy="12" r="1.6" fill={theme.mutedText} />
        <circle cx="15" cy="11" r="1.6" fill={theme.mutedText} />
      </>
    ),
    arc: <path d="M3 13 A8 8 0 0 1 17 13" stroke={a} strokeWidth="3" fill="none" />,
    ribbon: <path d="M3 4 C10 8 10 8 17 12 L17 15 C10 11 10 11 3 7 Z" fill={a} opacity="0.6" />,
  };
  return (
    <svg className="legend__icon" viewBox="0 0 20 16" width="20" height="16" aria-hidden="true">
      {shapes[kind]}
    </svg>
  );
}

/** Explains the active view's encodings (size, colour, glow, position…). */
export function Legend() {
  const activeView = useViewStore((s) => s.activeView);
  const theme = useThemeStore((s) => s.theme);
  const [open, setOpen] = useState(true);
  const entry = viewById(activeView);
  if (!entry) return null;
  return (
    <section
      className={`legend${open ? '' : ' is-closed'}`}
      aria-label={strings.legend.title}
      data-testid="legend"
    >
      <button type="button" className="legend__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {strings.legend.title}: {entry.label}
      </button>
      {open && (
        <ul>
          {entry.legend.map((item) => (
            <li key={item.label}>
              <Icon kind={item.kind} theme={theme} />
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
