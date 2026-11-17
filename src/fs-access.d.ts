// Interop shim: Chromium-only File System Access API members missing from TypeScript's DOM lib.
interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface FileSystemHandle {
  queryPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface DirectoryPickerOptions {
  id?: string;
  mode?: 'read' | 'readwrite';
  startIn?: string | FileSystemHandle;
}

interface Window {
  showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
}

interface DataTransferItem {
  getAsFileSystemHandle(): Promise<FileSystemHandle | null>;
}

// Chromium's FileSystemObserver (origin trial / newer Chrome); feature-detected at runtime.
interface FileSystemObserverRecord {
  type: string;
  relativePathComponents: string[];
}
interface FileSystemObserverInstance {
  observe(handle: FileSystemHandle, options?: { recursive?: boolean }): Promise<void>;
  disconnect(): void;
}
interface FileSystemObserverConstructor {
  new (callback: (records: FileSystemObserverRecord[]) => void): FileSystemObserverInstance;
}
