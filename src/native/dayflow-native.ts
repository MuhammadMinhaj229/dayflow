import { Capacitor, registerPlugin } from "@capacitor/core";

interface WorkspaceResult {
  ready: boolean;
  storage: "android-app-private";
  directoryCount: number;
}

interface SavedBackupResult {
  saved: boolean;
  fileName: string;
  bytes: number;
  location: "private";
}

interface ExportResult {
  exported: boolean;
  cancelled?: boolean;
  uri?: string;
}

interface PickResult {
  cancelled: boolean;
  fileName?: string;
  base64?: string;
  bytes?: number;
}

interface EncryptedSecret {
  iv: string;
  ciphertext: string;
}

interface DecryptedSecret {
  plaintext: string;
}

interface DayFlowNativePlugin {
  initializeWorkspace(): Promise<WorkspaceResult>;
  saveBackup(options: { fileName: string; base64: string }): Promise<SavedBackupResult>;
  exportBackup(options: { fileName: string; base64: string }): Promise<ExportResult>;
  pickBackup(): Promise<PickResult>;
  encryptSecret(options: { alias: string; plaintext: string }): Promise<EncryptedSecret>;
  decryptSecret(options: { alias: string; iv: string; ciphertext: string }): Promise<DecryptedSecret>;
  deleteSecret(options: { alias: string }): Promise<void>;
}

const Native = registerPlugin<DayFlowNativePlugin>("DayFlowNative");
const MAX_NATIVE_BACKUP_BYTES = 70 * 1024 * 1024;

export function isAndroidNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function initializeNativeWorkspace(): Promise<WorkspaceResult | null> {
  if (!isAndroidNative()) return null;
  return Native.initializeWorkspace();
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function encodeBackup(blob: Blob): Promise<string> {
  if (blob.size <= 0 || blob.size > MAX_NATIVE_BACKUP_BYTES) {
    throw new Error("This backup exceeds the Android transfer limit.");
  }
  return toBase64(new Uint8Array(await blob.arrayBuffer()));
}

export async function saveBackupToAndroidPrivateStorage(
  blob: Blob,
  fileName: string
): Promise<SavedBackupResult> {
  if (!isAndroidNative()) throw new Error("Android private storage is unavailable on this platform.");
  return Native.saveBackup({ fileName, base64: await encodeBackup(blob) });
}

export async function exportBackupWithAndroidPicker(
  blob: Blob,
  fileName: string
): Promise<ExportResult> {
  if (!isAndroidNative()) throw new Error("Android document export is unavailable on this platform.");
  return Native.exportBackup({ fileName, base64: await encodeBackup(blob) });
}

export async function pickBackupWithAndroidPicker(): Promise<File | null> {
  if (!isAndroidNative()) return null;
  const selected = await Native.pickBackup();
  if (selected.cancelled || !selected.base64) return null;
  const bytes = fromBase64(selected.base64);
  const safeBytes = new Uint8Array(bytes.byteLength);
  safeBytes.set(bytes);
  return new File([safeBytes.buffer], selected.fileName ?? "selected.dayflow", {
    type: "application/vnd.dayflow.backup+json"
  });
}

export async function encryptAndroidSecret(alias: string, plaintext: string): Promise<EncryptedSecret> {
  if (!isAndroidNative()) throw new Error("Android Keystore is unavailable on this platform.");
  return Native.encryptSecret({ alias, plaintext });
}

export async function decryptAndroidSecret(alias: string, encrypted: EncryptedSecret): Promise<string> {
  if (!isAndroidNative()) throw new Error("Android Keystore is unavailable on this platform.");
  const result = await Native.decryptSecret({
    alias,
    iv: encrypted.iv,
    ciphertext: encrypted.ciphertext
  });
  return result.plaintext;
}

export async function deleteAndroidSecret(alias: string): Promise<void> {
  if (!isAndroidNative()) throw new Error("Android Keystore is unavailable on this platform.");
  await Native.deleteSecret({ alias });
}
