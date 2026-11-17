import { useRef } from 'react';
import { strings } from '../strings';
import { useVaultStore } from '../state/vaultStore';
import { supportsDirectoryPicker } from '../ingest/fsAccess';

/** Shows only the ingest options this browser supports (PLAN §11). */
export function VaultPicker({ compact = false }: { compact?: boolean }) {
  const { openPicker, openZipFile, openFileList, openSample } = useVaultStore.getState();
  const zipInput = useRef<HTMLInputElement>(null);
  const dirInput = useRef<HTMLInputElement>(null);
  const hasPicker = supportsDirectoryPicker();

  return (
    <div className={compact ? 'picker picker--compact' : 'picker'}>
      {hasPicker ? (
        <button type="button" className="btn btn--primary" onClick={() => void openPicker()}>
          {strings.picker.openFolder}
        </button>
      ) : (
        <>
          <button type="button" className="btn btn--primary" onClick={() => dirInput.current?.click()}>
            {strings.picker.chooseFolder}
          </button>
          <input
            ref={dirInput}
            type="file"
            hidden
            multiple
            data-testid="folder-input"
            {...{ webkitdirectory: '' }}
            onChange={(e) => {
              if (e.target.files?.length) void openFileList(e.target.files);
              e.target.value = '';
            }}
          />
        </>
      )}
      <button type="button" className="btn" onClick={() => zipInput.current?.click()}>
        {strings.picker.uploadZip}
      </button>
      <input
        ref={zipInput}
        type="file"
        accept=".zip,application/zip"
        hidden
        data-testid="zip-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void openZipFile(file);
          e.target.value = '';
        }}
      />
      {!compact && (
        <button type="button" className="btn" onClick={() => void openSample()}>
          {strings.empty.trySample}
        </button>
      )}
    </div>
  );
}
