import {
  GENERIC_HAND_SPLIT_PIVOT_MIDI,
  GENERIC_MAX_VOICES_PER_STAFF,
} from './constants';
import { getGenericBeatGroupSize } from './shared';
import type { QuantizedNotationNoteEvent } from './types';

const VOICE_SEQUENTIAL_TOLERANCE_DIVISIONS = 1;
const VOICE_COLLAPSE_OVERLAP_TOLERANCE_DIVISIONS = 1;

export function assignPianoHands(
  events: QuantizedNotationNoteEvent[],
  timeSignature: number,
  divisionsPerQuarter: number,
): QuantizedNotationNoteEvent[] {
  const isExplicitLeftHandAnchor = (event: QuantizedNotationNoteEvent): boolean => (
    event.handHint === 'left' || event.staffHint === 2
  );
  const groups = new Map<number, QuantizedNotationNoteEvent[]>();

  for (const event of events) {
    const bucket = groups.get(event.startDivision) ?? [];
    bucket.push(event);
    groups.set(event.startDivision, bucket);
  }

  const orderedGroups = [...groups.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, bucket]) => bucket.sort((left, right) => left.pitch - right.pitch));
  const hasActiveLeftHintAnchor = orderedGroups.map((group) => {
    const groupStartDivision = group[0]?.startDivision ?? 0;
    return events.some((event) => (
      event.handHint === 'left'
      && event.startDivision < groupStartDivision
      && event.endDivision > groupStartDivision
    ));
  });
  const candidateSplits = orderedGroups.map((group) => Array.from({ length: group.length + 1 }, (_, index) => index));
  const dp = candidateSplits.map((splits) => splits.map(() => ({ score: Number.POSITIVE_INFINITY, previous: -1 })));
  const beatSpan = getGenericBeatGroupSize(timeSignature, divisionsPerQuarter);

  const evaluateSplit = (
    group: QuantizedNotationNoteEvent[],
    splitIndex: number,
    activeLeftHintAnchor: boolean,
  ): { score: number; boundaryPitch: number } => {
    const leftHand = group.slice(0, splitIndex);
    const rightHand = group.slice(splitIndex);
    const leftPitches = leftHand.map((event) => event.pitch);
    const rightPitches = rightHand.map((event) => event.pitch);
    const leftSpan = leftPitches.length > 1 ? Math.max(...leftPitches) - Math.min(...leftPitches) : 0;
    const rightSpan = rightPitches.length > 1 ? Math.max(...rightPitches) - Math.min(...rightPitches) : 0;
    const hasLowRegister = group.some((event) => event.pitch <= (GENERIC_HAND_SPLIT_PIVOT_MIDI - 2));
    const hasHighRegister = group.some((event) => event.pitch >= (GENERIC_HAND_SPLIT_PIVOT_MIDI + 2));
    const leftBias = leftHand.reduce((sum, event) => sum + (event.handHint === 'left' ? -0.6 : 0.25), 0);
    const rightBias = rightHand.reduce((sum, event) => sum + (event.handHint === 'right' ? -0.6 : 0.25), 0);
    const leftCrossStaffPenalty = leftPitches
      .reduce((sum, pitch) => sum + Math.max(0, pitch - (GENERIC_HAND_SPLIT_PIVOT_MIDI + 1)), 0);
    const rightCrossStaffPenalty = rightPitches
      .reduce((sum, pitch) => sum + Math.max(0, (GENERIC_HAND_SPLIT_PIVOT_MIDI - 1) - pitch), 0);
    const leftUpperLeakPenalty = leftHand.reduce((sum, event) => (
      sum + (event.handHint === 'left' ? 0 : Math.max(0, event.pitch - (GENERIC_HAND_SPLIT_PIVOT_MIDI + 1)) * 1.1)
    ), 0);
    const rightBassLeakPenalty = rightHand.reduce((sum, event) => sum + (event.handHint === 'left' ? 1.1 : 0), 0);
    const floatingLeftPenalty = (
      leftHand.length > 0
      && !leftHand.some((event) => event.handHint === 'left')
      && (leftPitches[0] ?? GENERIC_HAND_SPLIT_PIVOT_MIDI) >= GENERIC_HAND_SPLIT_PIVOT_MIDI
    ) ? 0.8 : 0;
    const anchoredMixedLeftPenalty = (
      activeLeftHintAnchor
      && leftHand.some((event) => event.handHint === 'left')
    )
      ? leftHand.reduce((sum, event) => {
        if (event.handHint === 'left') {
          return sum;
        }

        return sum + 2.2 + (Math.max(0, event.pitch - (GENERIC_HAND_SPLIT_PIVOT_MIDI - 2)) * 0.55);
      }, 0)
      : 0;
    const anchoredCompanionLiftPenalty = (
      activeLeftHintAnchor
      && rightHand.length === 0
      && leftHand.some((event) => event.handHint === 'left')
    )
      ? leftHand.reduce((sum, event) => (
        sum + (event.handHint === 'left' ? 0 : Math.max(0, event.pitch - (GENERIC_HAND_SPLIT_PIVOT_MIDI - 1)) * 1.8)
      ), 0)
      : 0;
    const anchoredMonophonicLiftPenalty = (
      activeLeftHintAnchor
      && leftHand.length > 0
      && rightHand.length === 0
      && !leftHand.some((event) => event.handHint === 'left')
    ) ? 4.5 : 0;
    const extremeRegisterPenalty = (
      (leftPitches.length > 0 ? Math.max(0, Math.max(...leftPitches) - (GENERIC_HAND_SPLIT_PIVOT_MIDI + 4)) : 0)
      + (rightPitches.length > 0 ? Math.max(0, (GENERIC_HAND_SPLIT_PIVOT_MIDI - 4) - Math.min(...rightPitches)) : 0)
    ) * 0.4;
    const registerPenalty = ((leftCrossStaffPenalty + rightCrossStaffPenalty) * 0.42) + extremeRegisterPenalty;
    const spanPenalty = (Math.max(0, leftSpan - 12) + Math.max(0, rightSpan - 12)) * 0.25;
    const balancePenalty = Math.abs(leftHand.length - rightHand.length) * 0.35;
    const staffVacancyPenalty = hasLowRegister && hasHighRegister && (leftHand.length === 0 || rightHand.length === 0)
      ? 0.7
      : 0;
    const boundaryPitch = rightHand[0]?.pitch ?? leftHand[leftHand.length - 1]?.pitch ?? GENERIC_HAND_SPLIT_PIVOT_MIDI;

    return {
      score: (
        registerPenalty
        + spanPenalty
        + balancePenalty
        + staffVacancyPenalty
        + leftBias
        + rightBias
        + leftUpperLeakPenalty
        + rightBassLeakPenalty
        + floatingLeftPenalty
        + anchoredMixedLeftPenalty
        + anchoredCompanionLiftPenalty
        + anchoredMonophonicLiftPenalty
      ),
      boundaryPitch,
    };
  };

  const boundaryCache = candidateSplits.map((splits) => splits.map(() => GENERIC_HAND_SPLIT_PIVOT_MIDI));

  for (let groupIndex = 0; groupIndex < orderedGroups.length; groupIndex += 1) {
    const group = orderedGroups[groupIndex];
    const splitCandidates = candidateSplits[groupIndex];
    const activeLeftHintAnchor = hasActiveLeftHintAnchor[groupIndex] ?? false;

    for (let splitIndex = 0; splitIndex < splitCandidates.length; splitIndex += 1) {
      const evaluation = evaluateSplit(group, splitCandidates[splitIndex], activeLeftHintAnchor);
      boundaryCache[groupIndex][splitIndex] = evaluation.boundaryPitch;
      const baseScore = evaluation.score;

      if (groupIndex === 0) {
        dp[groupIndex][splitIndex] = { score: baseScore, previous: -1 };
        continue;
      }

      for (let previousIndex = 0; previousIndex < candidateSplits[groupIndex - 1].length; previousIndex += 1) {
        const continuityPenalty = Math.abs(
          evaluation.boundaryPitch - boundaryCache[groupIndex - 1][previousIndex],
        ) / 8;
        const transitionPenalty = (
          Math.abs(splitCandidates[splitIndex] - candidateSplits[groupIndex - 1][previousIndex]) * 0.2
          + continuityPenalty
          + (Math.abs(group[0].startDivision - orderedGroups[groupIndex - 1][0].startDivision) > beatSpan ? 0.15 : 0)
        );
        const score = dp[groupIndex - 1][previousIndex].score + baseScore + transitionPenalty;

        if (score < dp[groupIndex][splitIndex].score) {
          dp[groupIndex][splitIndex] = {
            score,
            previous: previousIndex,
          };
        }
      }
    }
  }

  let bestSplitIndex = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  dp[dp.length - 1].forEach((entry, index) => {
    if (entry.score < bestScore) {
      bestScore = entry.score;
      bestSplitIndex = index;
    }
  });

  const selectedSplits = new Array<number>(orderedGroups.length);
  let cursor = bestSplitIndex;

  for (let groupIndex = orderedGroups.length - 1; groupIndex >= 0; groupIndex -= 1) {
    selectedSplits[groupIndex] = candidateSplits[groupIndex][cursor] ?? 0;
    cursor = dp[groupIndex][cursor]?.previous ?? -1;
    if (cursor < 0 && groupIndex > 0) {
      cursor = 0;
    }
  }

  orderedGroups.forEach((group, groupIndex) => {
    if (!(hasActiveLeftHintAnchor[groupIndex] ?? false)) {
      return;
    }

    const hintedLeftCount = group.filter((event) => event.handHint === 'left').length;
    if (hintedLeftCount === 1) {
      selectedSplits[groupIndex] = 1;
    }

    // If a sustained bass anchor is already active, keep singleton companion tones
    // in treble unless they are explicitly marked as left-hand bass notes.
    if (
      group.length === 1
      && group[0].handHint !== 'left'
      && group[0].pitch >= (GENERIC_HAND_SPLIT_PIVOT_MIDI - 10)
    ) {
      selectedSplits[groupIndex] = 0;
    }
  });

  orderedGroups.forEach((group, groupIndex) => {
    const splitIndex = selectedSplits[groupIndex];
    const activeLeftHintAnchor = hasActiveLeftHintAnchor[groupIndex] ?? false;
    const anchoredLeftHandEvents = group.filter((event) => isExplicitLeftHandAnchor(event));
    const floatingEvents = group.filter((event) => !isExplicitLeftHandAnchor(event));
    const desiredLeftHandCount = activeLeftHintAnchor
      ? anchoredLeftHandEvents.length
      : Math.max(anchoredLeftHandEvents.length, splitIndex);
    const leftHandEvents = new Set<QuantizedNotationNoteEvent>(anchoredLeftHandEvents);

    for (const event of floatingEvents) {
      if (leftHandEvents.size >= desiredLeftHandCount) {
        break;
      }
      leftHandEvents.add(event);
    }

    const leftPreview = group.filter((event) => leftHandEvents.has(event));
    const rightPreview = group.filter((event) => !leftHandEvents.has(event));

    if (
      typeof window !== 'undefined'
      && process.env.NODE_ENV !== 'production'
      && process.env.NODE_ENV !== 'test'
      && activeLeftHintAnchor
      && leftPreview.some((event) => event.handHint !== 'left')
    ) {
      console.warn('[ChordMini][StaffSplit] anchored left-hand conflict', {
        startDivision: group[0]?.startDivision,
        pitches: group.map((event) => event.pitch),
        left: leftPreview.map((event) => ({ pitch: event.pitch, handHint: event.handHint ?? null })),
        right: rightPreview.map((event) => ({ pitch: event.pitch, handHint: event.handHint ?? null })),
        groupSummary: group.map((event) => ({
          pitch: event.pitch,
          startDivision: event.startDivision,
          endDivision: event.endDivision,
          handHint: event.handHint ?? null,
          staffHint: event.staffHint ?? null,
          chordName: event.chordName ?? null,
        })),
      });
    }

    group.forEach((event) => {
      const isLeftHand = leftHandEvents.has(event);
      event.staff = isLeftHand ? 2 : 1;
      event.staffHint = event.staff as 1 | 2;
      event.handHint = event.handHint ?? (isLeftHand ? 'left' : 'right');
    });
  });

  return events;
}

function splitVoiceBundle(
  group: QuantizedNotationNoteEvent[],
): { voice1: QuantizedNotationNoteEvent[]; voice2: QuantizedNotationNoteEvent[] } {
  if (group.length < 2) {
    return { voice1: group, voice2: [] };
  }

  const ordered = [...group].sort((left, right) => left.pitch - right.pitch);
  const durations = ordered.map((event) => event.endDivision - event.startDivision);
  const maxDuration = Math.max(...durations);
  const minDuration = Math.min(...durations);

  if (maxDuration <= minDuration * 1.35) {
    return { voice1: group, voice2: [] };
  }

  let bestSplit = -1;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let splitIndex = 1; splitIndex < ordered.length; splitIndex += 1) {
    const lower = ordered.slice(0, splitIndex);
    const upper = ordered.slice(splitIndex);
    const lowerAveragePitch = lower.reduce((sum, event) => sum + event.pitch, 0) / lower.length;
    const upperAveragePitch = upper.reduce((sum, event) => sum + event.pitch, 0) / upper.length;
    const lowerAverageDuration = lower.reduce((sum, event) => sum + (event.endDivision - event.startDivision), 0) / lower.length;
    const upperAverageDuration = upper.reduce((sum, event) => sum + (event.endDivision - event.startDivision), 0) / upper.length;
    const score = (
      Math.max(0, upperAverageDuration - lowerAverageDuration) / 630
      + Math.max(0, lowerAveragePitch - upperAveragePitch)
      + Math.abs(lower.length - upper.length) * 0.25
    );

    if (score < bestScore) {
      bestScore = score;
      bestSplit = splitIndex;
    }
  }

  if (bestSplit < 0 || bestScore > 2.5) {
    return { voice1: group, voice2: [] };
  }

  return {
    voice1: ordered.slice(bestSplit),
    voice2: ordered.slice(0, bestSplit),
  };
}

export function assignVoicesForStaff(
  events: QuantizedNotationNoteEvent[],
  staff: number,
): void {
  const staffEvents = events
    .filter((event) => event.staff === staff)
    .sort((left, right) => left.startDivision - right.startDivision || left.pitch - right.pitch);
  const groups = new Map<number, QuantizedNotationNoteEvent[]>();

  for (const event of staffEvents) {
    const bucket = groups.get(event.startDivision) ?? [];
    bucket.push(event);
    groups.set(event.startDivision, bucket);
  }

  const voiceEnds = [0, 0];
  const voices = [new Set<QuantizedNotationNoteEvent>(), new Set<QuantizedNotationNoteEvent>()];

  [...groups.entries()].sort((left, right) => left[0] - right[0]).forEach(([startDivision, group]) => {
    const { voice1, voice2 } = splitVoiceBundle(group);
    const canUseVoice1 = startDivision >= (voiceEnds[0] - VOICE_SEQUENTIAL_TOLERANCE_DIVISIONS);
    const canUseVoice2 = startDivision >= (voiceEnds[1] - VOICE_SEQUENTIAL_TOLERANCE_DIVISIONS);

    if (voice2.length > 0) {
      voice1.forEach((event) => {
        event.voice = 1;
        voiceEnds[0] = Math.max(voiceEnds[0], event.endDivision);
        voices[0].add(event);
      });
      voice2.forEach((event) => {
        event.voice = 2;
        voiceEnds[1] = Math.max(voiceEnds[1], event.endDivision);
        voices[1].add(event);
      });
      return;
    }

    const targetVoice = canUseVoice1
      ? 1
      : canUseVoice2
        ? 2
        : (voiceEnds[0] <= voiceEnds[1] ? 1 : 2);
    group.forEach((event) => {
      event.voice = targetVoice;
      voiceEnds[targetVoice - 1] = Math.max(voiceEnds[targetVoice - 1], event.endDivision);
      voices[targetVoice - 1].add(event);
    });
  });

  const voice1Events = staffEvents
    .filter((event) => event.voice === 1)
    .sort((left, right) => left.startDivision - right.startDivision || left.endDivision - right.endDivision);
  const voice2Events = staffEvents
    .filter((event) => event.voice === 2)
    .sort((left, right) => left.startDivision - right.startDivision || left.endDivision - right.endDivision);

  const overlapsWithVoice1 = (event2: QuantizedNotationNoteEvent): boolean => {
    for (const event1 of voice1Events) {
      if (event1.endDivision <= event2.startDivision + VOICE_COLLAPSE_OVERLAP_TOLERANCE_DIVISIONS) {
        continue;
      }
      if (event1.startDivision >= event2.endDivision - VOICE_COLLAPSE_OVERLAP_TOLERANCE_DIVISIONS) {
        break;
      }

      if (
        event1.startDivision < event2.endDivision - VOICE_COLLAPSE_OVERLAP_TOLERANCE_DIVISIONS
        && event2.startDivision < event1.endDivision - VOICE_COLLAPSE_OVERLAP_TOLERANCE_DIVISIONS
      ) {
        return true;
      }
    }

    return false;
  };

  const isCoextensiveWithVoice1 = (event2: QuantizedNotationNoteEvent): boolean => (
    voice1Events.some((event1) => (
      Math.abs(event1.startDivision - event2.startDivision) <= VOICE_COLLAPSE_OVERLAP_TOLERANCE_DIVISIONS
      && Math.abs(event1.endDivision - event2.endDivision) <= VOICE_COLLAPSE_OVERLAP_TOLERANCE_DIVISIONS
    ))
  );

  const collapsibleVoice2Events = voice2Events.filter((event) => (
    !overlapsWithVoice1(event)
    || isCoextensiveWithVoice1(event)
  ));

  if (collapsibleVoice2Events.length > 0) {
    collapsibleVoice2Events.forEach((event) => {
      event.voice = 1;
      voices[0].add(event);
      voices[1].delete(event);
    });
  }

  const averagePitch = (voiceIndex: number): number => {
    const noteList = [...voices[voiceIndex]];
    if (noteList.length === 0) {
      return voiceIndex === 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    }
    return noteList.reduce((sum, event) => sum + event.pitch, 0) / noteList.length;
  };

  if (averagePitch(1) > averagePitch(0)) {
    staffEvents.forEach((event) => {
      event.voice = event.voice === 1 ? 2 : event.voice === 2 ? 1 : event.voice;
    });
  }

  for (let voiceNumber = 1; voiceNumber <= GENERIC_MAX_VOICES_PER_STAFF; voiceNumber += 1) {
    const voiceEvents = staffEvents
      .filter((event) => event.voice === voiceNumber)
      .sort((left, right) => (
        left.startDivision - right.startDivision
        || left.endDivision - right.endDivision
        || left.pitch - right.pitch
      ));

    for (let index = 0; index < voiceEvents.length;) {
      const groupStart = voiceEvents[index].startDivision;
      let nextIndex = index + 1;

      while (nextIndex < voiceEvents.length && voiceEvents[nextIndex].startDivision === groupStart) {
        nextIndex += 1;
      }

      const nextStartDivision = voiceEvents[nextIndex]?.startDivision ?? Number.POSITIVE_INFINITY;

      for (let groupIndex = index; groupIndex < nextIndex; groupIndex += 1) {
        const event = voiceEvents[groupIndex];
        if (Number.isFinite(nextStartDivision) && event.endDivision > nextStartDivision) {
          event.endDivision = Math.max(event.startDivision + 1, nextStartDivision);
        }
      }

      index = nextIndex;
    }
  }
}
