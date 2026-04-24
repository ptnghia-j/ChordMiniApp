export {
  getOffloadStorageProvider,
  parseFirebaseStorageObjectFromUrl,
  validateOffloadUrl,
} from './offloadValidation';
export type { OffloadStorageProvider } from './offloadValidation';

export {
  getOffloadStorageProvider as getBlobStorageProvider,
  validateOffloadUrl as validateBlobUrl,
} from './offloadValidation';
export type { OffloadStorageProvider as BlobStorageProvider } from './offloadValidation';
