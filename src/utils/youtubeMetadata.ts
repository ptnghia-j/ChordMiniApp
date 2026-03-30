export type YouTubeThumbnailQuality =
  | 'default'
  | 'mqdefault'
  | 'hqdefault'
  | 'sddefault'
  | 'maxresdefault';

function isValidVideoId(videoId: string | null | undefined): videoId is string {
  return typeof videoId === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(videoId);
}

function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function buildYouTubeThumbnailUrl(
  videoId: string | null | undefined,
  quality: YouTubeThumbnailQuality = 'mqdefault'
): string {
  if (!isValidVideoId(videoId)) {
    return '/hero-image-placeholder.svg';
  }

  return `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`;
}

export function normalizeThumbnailUrl(
  videoId: string | null | undefined,
  thumbnail: string | null | undefined,
  quality: YouTubeThumbnailQuality = 'mqdefault'
): string {
  if (isNonEmptyString(thumbnail)) {
    return thumbnail.trim();
  }

  return buildYouTubeThumbnailUrl(videoId, quality);
}

export function pickPreferredChannelTitle(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const candidate of candidates) {
    if (!isNonEmptyString(candidate)) {
      continue;
    }

    const normalized = candidate.trim();
    if (normalized === 'Unknown' || normalized === 'Unknown Channel') {
      continue;
    }

    return normalized;
  }

  return null;
}
