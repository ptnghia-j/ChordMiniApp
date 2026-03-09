import crypto from 'crypto';

const DEFAULT_SEGMENTATION_ACCESS_REQUEST_EMAIL = 'phantrongnghia510@gmail.com';

export function getSegmentationAccessRequestEmail(): string {
  return process.env.NEXT_PUBLIC_SEGMENTATION_ACCESS_REQUEST_EMAIL || DEFAULT_SEGMENTATION_ACCESS_REQUEST_EMAIL;
}

export function isSegmentationAccessRequired(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function getConfiguredSegmentationAccessCode(): string | null {
  const configured = process.env.SEGMENTATION_ACCESS_CODE?.trim();
  return configured ? configured : null;
}

export function getSegmentationAccessMissingConfigurationMessage(): string {
  return 'Song segmentation access is not configured on the server. Please contact support.';
}

export function getSegmentationAccessInvalidCodeMessage(): string {
  return `Invalid song segmentation access code. Request access via ${getSegmentationAccessRequestEmail()}.`;
}

export function validateSegmentationAccessCode(candidate: string | null | undefined): {
  isValid: boolean;
  error?: string;
} {
  if (!isSegmentationAccessRequired()) {
    return { isValid: true };
  }

  const configuredCode = getConfiguredSegmentationAccessCode();
  if (!configuredCode) {
    return {
      isValid: false,
      error: getSegmentationAccessMissingConfigurationMessage(),
    };
  }

  const providedCode = typeof candidate === 'string' ? candidate.trim() : '';
  if (!providedCode) {
    return {
      isValid: false,
      error: `Song segmentation access code required for new requests. Add it in Settings or request one via ${getSegmentationAccessRequestEmail()}.`,
    };
  }

  const configuredBuffer = Buffer.from(configuredCode);
  const providedBuffer = Buffer.from(providedCode);
  if (configuredBuffer.length !== providedBuffer.length) {
    return {
      isValid: false,
      error: getSegmentationAccessInvalidCodeMessage(),
    };
  }

  const isValid = crypto.timingSafeEqual(configuredBuffer, providedBuffer);
  return isValid
    ? { isValid: true }
    : { isValid: false, error: getSegmentationAccessInvalidCodeMessage() };
}
