import { useEffect, useRef, useState } from 'react';
import { strings } from '../strings';
import { useSettingsStore, type LabelDensity } from '../state/settingsStore';
import { views } from '../views/registry';
import { clearCache } from '../cache/db';
import { supportsDirectoryPicker } from '../ingest/fsAccess';

/** Settings (PLAN §7 Phase 4): ignore list, default view, label density, animation speed, watch, clear cache. */
export function SettingsDialog() {
  const open = useSettingsStore((s) => s.settingsOpen);
  const prefs = useSettingsStore((s) => s.prefs);
  const ref = useRef<HTMLDialogElement>(null);
  const [ignore, setIgnore] = useState(prefs.ignore.join(', '));
  const close = () => useSettingsStore.getState().setSettingsOpen(false);
  const update = useSettingsStore.getState().update;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setIgnore(useSettingsStore.getState().prefs.ignore.join(', '));
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="settings-title"
      onClose={close}
      data-testid="settings-dialog"
    >
      <form
        method="dialog"
        onSubmit={() => {
          update({
            ignore: ignore
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          });
        }}
      >
        <h2 id="settings-title">{strings.settings.title}</h2>
        <label className="field">
          <span>{strings.settings.ignore}</span>
          <input
            className="input"
            value={ignore}
            onChange={(e) => setIgnore(e.target.value)}
            data-testid="settings-ignore"
          />
          <small className="muted">{strings.settings.ignoreHint}</small>
        </label>
        <label className="field">
          <span>{strings.settings.defaultView}</span>
          <select
            className="select"
            value={prefs.defaultView}
            onChange={(e) => update({ defaultView: e.target.value })}
          >
            {views.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{strings.settings.labels}</span>
          <select
            className="select"
            value={prefs.labelDensity}
            data-testid="settings-labels"
            onChange={(e) => update({ labelDensity: e.target.value as LabelDensity })}
          >
            <option value="low">{strings.settings.labelsLow}</option>
            <option value="normal">{strings.settings.labelsNormal}</option>
            <option value="high">{strings.settings.labelsHigh}</option>
          </select>
        </label>
        <label className="field">
          <span>{strings.settings.speed}</span>
          <select
            className="select"
            value={String(prefs.animationSpeed)}
            onChange={(e) => update({ animationSpeed: Number(e.target.value) })}
          >
            <option value="0.5">0.5×</option>
            <option value="1">1×</option>
            <option value="2">2×</option>
          </select>
        </label>
        {supportsDirectoryPicker() && (
          <label className="check">
            <input
              type="checkbox"
              checked={prefs.watch}
              onChange={(e) => update({ watch: e.target.checked })}
            />
            {strings.settings.watch}
          </label>
        )}
        <div className="dialog__danger">
          <button
            type="button"
            className="btn btn--small"
            data-testid="clear-cache"
            onClick={() => {
              if (!window.confirm(strings.settings.clearConfirm)) return;
              void clearCache().then(() => location.reload());
            }}
          >
            {strings.settings.clearCache}
          </button>
          <small className="muted">{strings.settings.clearHint}</small>
        </div>
        <div className="dialog__actions">
          <button type="submit" className="btn btn--primary">
            {strings.settings.done}
          </button>
        </div>
      </form>
    </dialog>
  );
}
