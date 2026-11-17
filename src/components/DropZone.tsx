import { useEffect, useState } from 'react';
import { strings } from '../strings';
import { useVaultStore } from '../state/vaultStore';

/** Whole-window drop target for a vault folder or .zip. */
export function DropZone() {
  const [over, setOver] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setOver(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setOver(false);
    };
    const overHandler = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!e.dataTransfer || !hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      void useVaultStore.getState().openDrop(e.dataTransfer);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', overHandler);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', overHandler);
      window.removeEventListener('drop', drop);
    };
  }, []);
  return over ? (
    <div className="drop-overlay" aria-hidden="true">
      <div>{strings.picker.dropHere}</div>
    </div>
  ) : null;
}
