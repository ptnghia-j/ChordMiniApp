import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { calculateTargetKey } from '@/utils/chordTransposition';

// UI state types
export type ActiveTab = 'beatChordMap' | 'guitarChords' | 'lyricsChords';

export type RomanNumeralData = {
  analysis: string[];
  keyContext: string;
  temporalShifts?: Array<{
    chordIndex: number;
    targetKey: string;
    romanNumeral: string;
  }>;
};

interface UIStore {
  // Tab management
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;

  // Panel toggles
  isChatbotOpen: boolean;
  isLyricsPanelOpen: boolean;
  toggleChatbot: () => void;
  toggleLyricsPanel: () => void;
  setIsChatbotOpen: (open: boolean) => void;
  setIsLyricsPanelOpen: (open: boolean) => void;

  // Title and editing
  videoTitle: string;
  setVideoTitle: (title: string) => void;
  isEditMode: boolean;
  editedTitle: string;
  editedChords: Record<string, string>;
  setIsEditMode: (mode: boolean) => void;
  setEditedTitle: (title: string) => void;
  setEditedChords: (chords: Record<string, string>) => void;

  // UI feature toggles
  showRomanNumerals: boolean;
  setShowRomanNumerals: (val: boolean) => void;
  toggleRomanNumerals: () => void;
  romanNumeralData: RomanNumeralData | null;
  updateRomanNumeralData: (data: RomanNumeralData | null) => void;

  // Segmentation
  showSegmentation: boolean;
  setShowSegmentation: (val: boolean) => void;
  toggleSegmentation: () => void;

  // Chord simplification
  simplifyChords: boolean;
  setSimplifyChords: (val: boolean) => void;
  toggleSimplifyChords: () => void;

  // Pitch shift
  isPitchShiftEnabled: boolean;
  pitchShiftSemitones: number;
  isProcessingPitchShift: boolean;
  pitchShiftError: string | null;
  isFirebaseAudioAvailable: boolean;
  originalKey: string;
  targetKey: string;
  setIsPitchShiftEnabled: (enabled: boolean) => void;
  togglePitchShift: () => void;
  setPitchShiftSemitones: (semitones: number) => void;
  resetPitchShift: () => void;
  setIsProcessingPitchShift: (processing: boolean) => void;
  setPitchShiftError: (error: string | null) => void;
  setIsFirebaseAudioAvailable: (available: boolean) => void;
  setOriginalKey: (key: string) => void;

  // Editing handlers
  handleEditModeToggle: () => void;
  handleTitleSave: () => void;
  handleTitleCancel: () => void;
  handleTitleChange: (title: string) => void;
  handleChordEdit: (originalChord: string, newChord: string) => void;

  // Initialization
  initializeVideoTitle: (title: string) => void;
  initializeOriginalKey: (key: string) => void;
  initializeFirebaseAudioAvailable: (available: boolean) => void;
}

export const useUIStore = create<UIStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      activeTab: 'beatChordMap',
      isChatbotOpen: false,
      isLyricsPanelOpen: false,
      videoTitle: '',
      isEditMode: false,
      editedTitle: '',
      editedChords: {},
      showRomanNumerals: false,
      romanNumeralData: null,
      showSegmentation: false,
      simplifyChords: false,
      isPitchShiftEnabled: false,
      pitchShiftSemitones: 0,
      isProcessingPitchShift: false,
      pitchShiftError: null,
      isFirebaseAudioAvailable: false,
      originalKey: 'C',
      targetKey: 'C',

      // Tab management
      setActiveTab: (tab) => set({ activeTab: tab }, false, 'setActiveTab'),

      // Panel toggles with mutual exclusivity
      toggleChatbot: () =>
        set(
          (state) => {
            const newChatbotOpen = !state.isChatbotOpen;
            return {
              isChatbotOpen: newChatbotOpen,
              // Close lyrics panel when opening chatbot
              isLyricsPanelOpen: newChatbotOpen ? false : state.isLyricsPanelOpen,
            };
          },
          false,
          'toggleChatbot'
        ),

      toggleLyricsPanel: () =>
        set(
          (state) => {
            const newLyricsPanelOpen = !state.isLyricsPanelOpen;
            return {
              isLyricsPanelOpen: newLyricsPanelOpen,
              // Close chatbot when opening lyrics panel
              isChatbotOpen: newLyricsPanelOpen ? false : state.isChatbotOpen,
            };
          },
          false,
          'toggleLyricsPanel'
        ),

      setIsChatbotOpen: (open) => set({ isChatbotOpen: open }, false, 'setIsChatbotOpen'),

      setIsLyricsPanelOpen: (open) => set({ isLyricsPanelOpen: open }, false, 'setIsLyricsPanelOpen'),

      // Title and editing
      setVideoTitle: (title) => set({ videoTitle: title }, false, 'setVideoTitle'),

      setIsEditMode: (mode) => set({ isEditMode: mode }, false, 'setIsEditMode'),

      setEditedTitle: (title) => set({ editedTitle: title }, false, 'setEditedTitle'),

      setEditedChords: (chords) => set({ editedChords: chords }, false, 'setEditedChords'),

      handleEditModeToggle: () =>
        set(
          (state) => {
            if (!state.isEditMode) {
              return {
                isEditMode: true,
                editedTitle: state.videoTitle,
                editedChords: {},
              };
            }
            return { isEditMode: false };
          },
          false,
          'handleEditModeToggle'
        ),

      handleTitleSave: () =>
        set(
          (state) => ({
            videoTitle: state.editedTitle,
            isEditMode: false,
          }),
          false,
          'handleTitleSave'
        ),

      handleTitleCancel: () =>
        set(
          (state) => ({
            editedTitle: state.videoTitle,
            editedChords: {},
            isEditMode: false,
          }),
          false,
          'handleTitleCancel'
        ),

      handleTitleChange: (title) => set({ editedTitle: title }, false, 'handleTitleChange'),

      handleChordEdit: (originalChord, newChord) =>
        set(
          (state) => ({
            editedChords: {
              ...state.editedChords,
              [originalChord]: newChord,
            },
          }),
          false,
          'handleChordEdit'
        ),

      // UI feature toggles
      setShowRomanNumerals: (val) => set({ showRomanNumerals: val }, false, 'setShowRomanNumerals'),

      toggleRomanNumerals: () =>
        set((state) => ({ showRomanNumerals: !state.showRomanNumerals }), false, 'toggleRomanNumerals'),

      updateRomanNumeralData: (data) => set({ romanNumeralData: data }, false, 'updateRomanNumeralData'),

      // Segmentation
      setShowSegmentation: (val) => set({ showSegmentation: val }, false, 'setShowSegmentation'),

      toggleSegmentation: () =>
        set((state) => ({ showSegmentation: !state.showSegmentation }), false, 'toggleSegmentation'),

      // Chord simplification
      setSimplifyChords: (val) => set({ simplifyChords: val }, false, 'setSimplifyChords'),

      toggleSimplifyChords: () =>
        set((state) => ({ simplifyChords: !state.simplifyChords }), false, 'toggleSimplifyChords'),

      // Pitch shift
      togglePitchShift: () =>
        set(
          (state) => ({
            isPitchShiftEnabled: !state.isPitchShiftEnabled,
            pitchShiftError: null,
          }),
          false,
          'togglePitchShift'
        ),

      setPitchShiftSemitones: (semitones) =>
        set(
          () => {
            const clamped = Math.max(-6, Math.min(6, semitones));
            const state = get();
            const newTargetKey = clamped === 0 ? state.originalKey : calculateTargetKey(state.originalKey, clamped);
            return {
              pitchShiftSemitones: clamped,
              targetKey: newTargetKey,
              pitchShiftError: null,
            };
          },
          false,
          'setPitchShiftSemitones'
        ),

      setIsPitchShiftEnabled: (enabled) => set({ isPitchShiftEnabled: enabled }, false, 'setIsPitchShiftEnabled'),

      resetPitchShift: () =>
        set(
          (state) => ({
            pitchShiftSemitones: 0,
            targetKey: state.originalKey,
            pitchShiftError: null,
          }),
          false,
          'resetPitchShift'
        ),

      setIsProcessingPitchShift: (processing) =>
        set({ isProcessingPitchShift: processing }, false, 'setIsProcessingPitchShift'),

      setPitchShiftError: (error) => set({ pitchShiftError: error }, false, 'setPitchShiftError'),

      setIsFirebaseAudioAvailable: (available) =>
        set({ isFirebaseAudioAvailable: available }, false, 'setIsFirebaseAudioAvailable'),

      setOriginalKey: (key) =>
        set(
          (state) => {
            const newTargetKey =
              state.pitchShiftSemitones === 0 ? key : calculateTargetKey(key, state.pitchShiftSemitones);
            return {
              originalKey: key,
              targetKey: newTargetKey,
            };
          },
          false,
          'setOriginalKey'
        ),

      // Initialization methods
      initializeVideoTitle: (title) => set({ videoTitle: title, editedTitle: title }, false, 'initializeVideoTitle'),

      initializeOriginalKey: (key) =>
        set(
          (state) => {
            // Recalculate targetKey based on current pitch shift semitones
            const newTargetKey =
              state.pitchShiftSemitones === 0 ? key : calculateTargetKey(key, state.pitchShiftSemitones);
            return {
              originalKey: key,
              targetKey: newTargetKey,
            };
          },
          false,
          'initializeOriginalKey'
        ),

      initializeFirebaseAudioAvailable: (available) =>
        set({ isFirebaseAudioAvailable: available }, false, 'initializeFirebaseAudioAvailable'),
    }),
    { name: 'UIStore' }
  )
);

// Selector hooks for optimized re-renders
export const useActiveTab = () => useUIStore((state) => state.activeTab);
export const useSetActiveTab = () => useUIStore((state) => state.setActiveTab);

export const useChatbotOpen = () => useUIStore((state) => state.isChatbotOpen);
export const useToggleChatbot = () => useUIStore((state) => state.toggleChatbot);

export const useLyricsPanelOpen = () => useUIStore((state) => state.isLyricsPanelOpen);
export const useToggleLyricsPanel = () => useUIStore((state) => state.toggleLyricsPanel);

export const useVideoTitle = () => useUIStore((state) => state.videoTitle);
export const useSetVideoTitle = () => useUIStore((state) => state.setVideoTitle);

export const useEditMode = () => useUIStore((state) => state.isEditMode);
export const useEditedTitle = () => useUIStore((state) => state.editedTitle);
export const useEditedChords = () => useUIStore((state) => state.editedChords);

export const useRomanNumerals = () =>
  useUIStore((state) => ({
    showRomanNumerals: state.showRomanNumerals,
    romanNumeralData: state.romanNumeralData,
  }));

export const useShowRomanNumerals = () => useUIStore((state) => state.showRomanNumerals);
export const useToggleRomanNumerals = () => useUIStore((state) => state.toggleRomanNumerals);
export const useRomanNumeralData = () => useUIStore((state) => state.romanNumeralData);
export const useUpdateRomanNumeralData = () => useUIStore((state) => state.updateRomanNumeralData);

export const useShowSegmentation = () => useUIStore((state) => state.showSegmentation);
export const useToggleSegmentation = () => useUIStore((state) => state.toggleSegmentation);

export const useSimplifyChords = () => useUIStore((state) => state.simplifyChords);
export const useToggleSimplifyChords = () => useUIStore((state) => state.toggleSimplifyChords);

export const usePitchShift = () =>
  useUIStore((state) => ({
    isPitchShiftEnabled: state.isPitchShiftEnabled,
    pitchShiftSemitones: state.pitchShiftSemitones,
    isProcessingPitchShift: state.isProcessingPitchShift,
    pitchShiftError: state.pitchShiftError,
    isFirebaseAudioAvailable: state.isFirebaseAudioAvailable,
    originalKey: state.originalKey,
    targetKey: state.targetKey,
  }));

export const useIsPitchShiftEnabled = () => useUIStore((state) => state.isPitchShiftEnabled);
export const usePitchShiftSemitones = () => useUIStore((state) => state.pitchShiftSemitones);
export const useTargetKey = () => useUIStore((state) => state.targetKey);
export const useOriginalKey = () => useUIStore((state) => state.originalKey);
export const useTogglePitchShift = () => useUIStore((state) => state.togglePitchShift);
export const useIsProcessingPitchShift = () => useUIStore((state) => state.isProcessingPitchShift);
export const usePitchShiftError = () => useUIStore((state) => state.pitchShiftError);
export const useIsFirebaseAudioAvailable = () => useUIStore((state) => state.isFirebaseAudioAvailable);
export const useSetPitchShiftSemitones = () => useUIStore((state) => state.setPitchShiftSemitones);
export const useSetIsProcessingPitchShift = () => useUIStore((state) => state.setIsProcessingPitchShift);
export const useSetPitchShiftError = () => useUIStore((state) => state.setPitchShiftError);
export const useSetIsFirebaseAudioAvailable = () => useUIStore((state) => state.setIsFirebaseAudioAvailable);
export const useResetPitchShift = () => useUIStore((state) => state.resetPitchShift);
