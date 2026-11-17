import { useEffect, useRef } from 'react';
import { strings } from '../strings';

const MAX = 300;

/** Lists parse/scan warnings (bad YAML, unreadable or oversized files, cache problems). */
export function WarningsDialog({
  warnings,
  open,
  onClose,
}: {
  warnings: string[];
  open: boolean;
  onClose(): void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="warnings-title"
      onClose={onClose}
      data-testid="warnings-dialog"
    >
      <form method="dialog">
        <h2 id="warnings-title">{strings.warnings.title}</h2>
        <ul>
          {warnings.slice(0, MAX).map((w, i) => (
            <li key={i}>{w}</li>
          ))}
          {warnings.length > MAX && <li>{strings.warnings.more(warnings.length - MAX)}</li>}
        </ul>
        <div className="dialog__actions">
          <button type="submit" className="btn btn--primary">
            {strings.warnings.close}
          </button>
        </div>
      </form>
    </dialog>
  );
}
