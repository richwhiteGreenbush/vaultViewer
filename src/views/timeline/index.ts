import { Graphics, Text } from 'pixi.js';
import { hexToNumber } from '../../core/color/tagColor';
import type { DateField } from '../../core/lens/applyLenses';
import { strings } from '../../strings';
import type { ViewContext, ViewModule } from '../types';
import { PixiScene, type SceneLayout } from '../shared/pixiScene';
import {
  countUpTo,
  LANE_HEIGHT,
  TIMELINE_WIDTH,
  timelineLayout,
  timeToX,
  type TimelineLayout,
} from './layout';

const SPEEDS = [1, 2, 4, 8, 16, 32];
const FULL_RUN_MS = 60_000; // at 1x the whole range plays in a minute
const day = (t: number) => new Date(t).toISOString().slice(0, 10);

class TimelineView extends PixiScene {
  private l!: TimelineLayout;
  private field: DateField = 'created';
  private playhead: number | null = null; // null = show everything
  private shown = -1;
  private playing = false;
  private speed = 4;
  private lastTick = 0;
  private playheadLine = new Graphics();
  private chrome: HTMLElement[] = [];
  private ui!: {
    play: HTMLButtonElement;
    slider: HTMLInputElement;
    brush: HTMLDivElement;
    track: HTMLDivElement;
    label: HTMLSpanElement;
  };

  constructor(el: HTMLElement, ctx: ViewContext) {
    super(el, ctx, 'timeline');
    this.buildChrome();
    void this.ready.then(() => this.app.ticker.add(() => this.playback()));
  }

  protected layout(): SceneLayout {
    this.l = timelineLayout(this.ctx.graph, this.field);
    this.shown = -1;
    return {
      ids: this.l.ids,
      positions: Float32Array.from(this.l.positions),
      radius: this.l.radius,
      edges: [
        {
          name: 'constellations',
          pairs: this.l.links,
          highlightable: true,
          style: (t) => ({ color: t.edge, alpha: Math.min(0.5, t.edgeAlpha * 1.6) }),
        },
        {
          name: 'long',
          pairs: this.l.longLinks,
          focusOnly: true,
          style: (t) => ({ color: t.edge, alpha: t.edgeAlpha }),
        },
      ],
    };
  }

  protected extraVisible(i: number): boolean {
    return this.playhead === null || (this.l.times[i] as number) <= this.playhead;
  }

  protected decorate(): void {
    const { theme } = this.ctx;
    this.under.removeChildren().forEach((c) => c.destroy());
    const g = new Graphics();
    const height = this.l.lanes.length * LANE_HEIGHT;
    this.l.lanes.forEach((lane, i) => {
      if (i % 2 === 0)
        g.rect(-20, lane.y - LANE_HEIGHT / 2, TIMELINE_WIDTH + 40, LANE_HEIGHT).fill({
          color: hexToNumber(theme.text),
          alpha: theme.dark ? 0.035 : 0.04,
        });
      const label = new Text({
        text: lane.label,
        style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: theme.text },
      });
      label.anchor.set(1, 0.5);
      label.resolution = 2;
      label.position.set(-28, lane.y);
      this.under.addChild(label);
    });
    for (const tick of this.l.ticks) {
      g.moveTo(tick.x, -6)
        .lineTo(tick.x, height + (tick.major ? 10 : 5))
        .stroke({
          color: hexToNumber(theme.mutedText),
          alpha: tick.major ? 0.35 : 0.12,
          width: 1,
          pixelLine: true,
        });
      const t = new Text({
        text: tick.label,
        style: {
          fontFamily: 'system-ui, sans-serif',
          fontSize: tick.major ? 12 : 10,
          fontWeight: tick.major ? '700' : '400',
          fill: tick.major ? theme.text : theme.mutedText,
        },
      });
      t.anchor.set(0.5, 0);
      t.resolution = 2;
      t.position.set(tick.x, height + 12);
      this.under.addChildAt(t, 0);
    }
    this.under.addChildAt(g, 0);
    this.playheadLine = new Graphics();
    this.over.removeChildren().forEach((c) => c.destroy());
    this.over.addChild(this.playheadLine);
    this.drawPlayhead();
  }

  protected contentBounds(): Float32Array {
    return new Float32Array([-140, -20, TIMELINE_WIDTH + 20, this.l.lanes.length * LANE_HEIGHT + 34]);
  }

  // ---- playback ----------------------------------------------------------------------------------------

  private playback(): void {
    const now = performance.now();
    const dt = now - this.lastTick;
    this.lastTick = now;
    if (!this.playing || this.playhead === null) return;
    this.playhead += ((this.l.t1 - this.l.t0) * dt * this.speed) / FULL_RUN_MS;
    if (this.playhead >= this.l.t1) {
      this.playhead = null;
      this.setPlaying(false);
    }
    this.onPlayheadMoved();
  }

  private onPlayheadMoved(): void {
    const n = this.playhead === null ? this.l.ids.length : countUpTo(this.l.times, this.playhead);
    if (n !== this.shown) {
      this.shown = n;
      this.refreshVisibility();
    }
    this.drawPlayhead();
    this.syncChrome();
  }

  private drawPlayhead(): void {
    const g = this.playheadLine;
    g.clear();
    if (this.playhead === null) return;
    const x = timeToX(this.l, this.playhead);
    g.moveTo(x, -10)
      .lineTo(x, this.l.lanes.length * LANE_HEIGHT + 8)
      .stroke({ color: hexToNumber(this.ctx.theme.edgeHighlight), alpha: 0.9, width: 2 / this.camera.scale });
  }

  private setPlaying(on: boolean): void {
    this.playing = on;
    if (on && (this.playhead === null || this.playhead >= this.l.t1)) this.playhead = this.l.t0;
    this.lastTick = performance.now();
    this.onPlayheadMoved();
  }

  // ---- DOM chrome: toolbar + scrubber -------------------------------------------------------------------

  private buildChrome(): void {
    const bar = document.createElement('div');
    bar.className = 'view-toolbar';
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'btn btn--small';
    play.dataset.testid = 'timeline-play';
    play.addEventListener('click', () => this.setPlaying(!this.playing));
    const speedLabel = document.createElement('label');
    const speed = document.createElement('select');
    speed.className = 'select select--small';
    speed.setAttribute('aria-label', strings.timeline.speed);
    for (const s of SPEEDS) speed.add(new Option(`${s}×`, String(s), s === this.speed, s === this.speed));
    speed.addEventListener('change', () => (this.speed = Number(speed.value)));
    speedLabel.append(speed);
    const field = document.createElement('select');
    field.className = 'select select--small';
    field.setAttribute('aria-label', strings.timeline.field);
    field.dataset.testid = 'timeline-field';
    field.add(new Option(strings.lens.created, 'created', true, true));
    field.add(new Option(strings.lens.updated, 'updated'));
    field.addEventListener('change', () => {
      this.field = field.value === 'updated' ? 'updated' : 'created';
      this.playhead = null;
      this.setPlaying(false);
      void this.ready.then(() => this.build());
    });
    bar.append(play, speedLabel, field);

    const scrub = document.createElement('div');
    scrub.className = 'scrubber';
    const track = document.createElement('div');
    track.className = 'scrubber__track';
    track.title = strings.timeline.scrubber;
    const brush = document.createElement('div');
    brush.className = 'scrubber__brush';
    brush.hidden = true;
    track.append(brush);
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'scrubber__slider';
    slider.min = '0';
    slider.max = '1000';
    slider.setAttribute('aria-label', strings.timeline.playhead);
    slider.dataset.testid = 'timeline-slider';
    slider.addEventListener('input', () => {
      this.playing = false;
      const v = Number(slider.value);
      this.playhead = v >= 1000 ? null : this.l.t0 + (v / 1000) * (this.l.t1 - this.l.t0);
      this.onPlayheadMoved();
    });
    const label = document.createElement('span');
    label.className = 'scrubber__label';
    scrub.append(track, slider, label);

    // Brush: drag across the track to set the date lens; a plain click moves the playhead.
    let start: number | null = null;
    const frac = (e: PointerEvent) => {
      const r = track.getBoundingClientRect();
      return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    };
    track.addEventListener('pointerdown', (e) => {
      start = frac(e);
      track.setPointerCapture(e.pointerId);
    });
    track.addEventListener('pointermove', (e) => {
      if (start === null) return;
      const a = Math.min(start, frac(e));
      const b = Math.max(start, frac(e));
      brush.hidden = false;
      brush.style.left = `${a * 100}%`;
      brush.style.width = `${(b - a) * 100}%`;
    });
    track.addEventListener('pointerup', (e) => {
      if (start === null) return;
      const a = Math.min(start, frac(e));
      const b = Math.max(start, frac(e));
      start = null;
      brush.hidden = true;
      const t = (f: number) => this.l.t0 + f * (this.l.t1 - this.l.t0);
      if (b - a < 0.005) {
        this.playing = false;
        this.playhead = t(a);
        this.onPlayheadMoved();
      } else {
        this.ctx.actions.setDateRange(this.field, Math.floor(t(a)), Math.ceil(t(b)));
      }
    });

    this.el.append(bar, scrub);
    this.chrome = [bar, scrub];
    this.ui = { play, slider, brush, track, label };
    this.syncChrome();
  }

  private syncChrome(): void {
    if (!this.ui) return;
    this.ui.play.textContent = this.playing ? `⏸ ${strings.timeline.pause}` : `▶ ${strings.timeline.play}`;
    this.ui.play.setAttribute('aria-pressed', String(this.playing));
    if (!this.l) return;
    const f = this.playhead === null ? 1 : (this.playhead - this.l.t0) / (this.l.t1 - this.l.t0);
    this.ui.slider.value = String(Math.round(f * 1000));
    this.ui.label.textContent =
      this.playhead === null ? `${day(this.l.t0)} → ${day(this.l.t1)}` : day(this.playhead);
  }

  protected build(): void {
    super.build();
    this.syncChrome();
  }

  destroy(): void {
    for (const c of this.chrome) c.remove();
    super.destroy();
  }
}

export const timelineView: ViewModule = {
  id: 'timeline',
  label: 'Timeline',
  icon: 'sparkles',
  renderer: 'pixi',
  mount: (el, ctx) => new TimelineView(el, ctx),
};
