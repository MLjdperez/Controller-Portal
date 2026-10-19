// Original files, kept unchanged and addressed by SHA-256 (master prompt §25: preserve source files).
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

export const storageDir = () => resolve(process.env.STORAGE_DIR ?? './storage');

export async function sha256OfFile(path: string): Promise<{ sha256: string; sizeBytes: number }> {
  const buf = await readFile(path);
  return { sha256: createHash('sha256').update(buf).digest('hex'), sizeBytes: (await stat(path)).size };
}

/** Keep uploaded bytes unchanged, once per content. Returns the SHA-256 and storage key. */
export async function storeUpload(fileName: string, bytes: Uint8Array): Promise<{ sha256: string; storageKey: string }> {
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const key = `originals/${sha256}${extname(fileName).toLowerCase()}`;
  const dest = join(storageDir(), key);
  if (!existsSync(dest)) {
    await mkdir(join(storageDir(), 'originals'), { recursive: true });
    await writeFile(dest, bytes);
  }
  return { sha256, storageKey: key };
}

export async function readStored(storageKey: string): Promise<Uint8Array> {
  if (!/^originals\/[0-9a-f]{64}\.(xlsx|csv)$/.test(storageKey)) throw new Error('Invalid storage key');
  return new Uint8Array(await readFile(join(storageDir(), storageKey)));
}

/** Copy the original into storage once. Returns the storage key. */
export async function storeOriginal(path: string, sha256: string): Promise<string> {
  const key = `originals/${sha256}${extname(path).toLowerCase()}`;
  const dest = join(storageDir(), key);
  if (!existsSync(dest)) {
    await mkdir(join(storageDir(), 'originals'), { recursive: true });
    await copyFile(path, dest);
  }
  return key;
}
