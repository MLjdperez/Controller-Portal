// Original files, kept unchanged and addressed by SHA-256 (master prompt §25: preserve source files).
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

export const storageDir = () => resolve(process.env.STORAGE_DIR ?? './storage');

export async function sha256OfFile(path: string): Promise<{ sha256: string; sizeBytes: number }> {
  const buf = await readFile(path);
  return { sha256: createHash('sha256').update(buf).digest('hex'), sizeBytes: (await stat(path)).size };
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
