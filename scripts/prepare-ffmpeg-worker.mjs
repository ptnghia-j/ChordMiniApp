import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const sourceDirectory = path.dirname(require.resolve('@ffmpeg/ffmpeg/worker'));
const destinationDirectory = path.resolve(process.cwd(), 'public', 'ffmpeg-worker');
const workerFiles = ['worker.js', 'const.js', 'errors.js'];

await mkdir(destinationDirectory, { recursive: true });
await Promise.all(workerFiles.map((filename) => (
  copyFile(
    path.join(sourceDirectory, filename),
    path.join(destinationDirectory, filename),
  )
)));
