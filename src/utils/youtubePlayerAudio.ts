export interface YouTubeMuteControls {
  muted?: boolean;
  mute?: () => void;
  unMute?: () => void;
}

export function setYouTubePlayerMuted(
  player: YouTubeMuteControls | null | undefined,
  muted: boolean,
): void {
  if (!player) return;

  try {
    if (muted) {
      if (typeof player.mute === 'function') {
        player.mute();
      }
    } else if (typeof player.unMute === 'function') {
      player.unMute();
    }
  } catch {
    // ReactPlayer/YouTube readiness can briefly race prop updates. The
    // mirrored property below still keeps app-side state consistent.
  }

  try {
    player.muted = muted;
  } catch {
    // Some player wrappers expose a readonly field; the iframe API call above
    // is the source of truth when available.
  }
}
