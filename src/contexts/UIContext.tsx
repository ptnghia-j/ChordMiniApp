'use client';

import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode, useEffect } from 'react';

// UI state types
type ActiveTab = 'beatChordMap' | 'guitarChords' | 'lyricsChords';

type RomanNumeralData = {
  analysis: string[];
  keyContext: string;
  temporalShifts?: Array<{
    chordIndex: number;
    targetKey: string;
    romanNumeral: string;
  }>;
};

interface UIState {
  // Tab management
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;

  // Panel toggles
  isChatbotOpen: boolean;
  isLyricsPanelOpen: boolean;
  toggleChatbot: () => void;
  toggleLyricsPanel: () => void;

  // Title and editing
  videoTitle: string;
  setVideoTitle: (title: string) => void;
  isEditMode: boolean;
  editedTitle: string;
  editedChords: Record<string, string>;

  // UI feature toggles (authoritative UI state)
  // Roman numerals
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

  // Editing handlers
  handleEditModeToggle: () => void;
  handleTitleSave: () => void;
  handleTitleCancel: () => void;
  handleTitleChange: (title: string) => void;
  handleChordEdit: (originalChord: string, newChord: string) => void;
}

const UIContext = createContext<UIState | undefined>(undefined);

interface UIProviderProps {
  children: ReactNode;
  initialVideoTitle?: string;
  // Initialization for migrated UI toggles
  initialShowRomanNumerals?: boolean;
  initialRomanNumeralData?: RomanNumeralData | null;
  initialShowSegmentation?: boolean;
  initialSimplifyChords?: boolean;

  // Controlled props (optional): allow parent to drive state and be notified on changes
  controlledShowRomanNumerals?: boolean;
  onShowRomanNumeralsChange?: (val: boolean) => void;
  controlledRomanNumeralData?: RomanNumeralData | null;
  onRomanNumeralDataChange?: (data: RomanNumeralData | null) => void;
  controlledShowSegmentation?: boolean;
  onShowSegmentationChange?: (val: boolean) => void;
  controlledSimplifyChords?: boolean;
  onSimplifyChordsChange?: (val: boolean) => void;
}


export const UIProvider: React.FC<UIProviderProps> = ({
  children,
  initialVideoTitle = '',
  initialShowRomanNumerals = false,
  initialRomanNumeralData = null,
  initialShowSegmentation = false,
  initialSimplifyChords = false,
  controlledShowRomanNumerals,
  onShowRomanNumeralsChange,
  controlledRomanNumeralData,
  onRomanNumeralDataChange,
  controlledShowSegmentation,
  onShowSegmentationChange,
  controlledSimplifyChords,
  onSimplifyChordsChange,
}) => {
  // Tab state
  const [activeTab, setActiveTab] = useState<ActiveTab>('beatChordMap');
  // Sync internal state when controlled props are provided
  useEffect(() => {
    if (controlledShowRomanNumerals !== undefined) {
      setShowRomanNumerals(controlledShowRomanNumerals);
    }
  }, [controlledShowRomanNumerals]);

  useEffect(() => {
    if (controlledRomanNumeralData !== undefined) {
      setRomanNumeralData(controlledRomanNumeralData as RomanNumeralData | null);
    }
  }, [controlledRomanNumeralData]);

  useEffect(() => {
    if (controlledShowSegmentation !== undefined) {
      setShowSegmentation(controlledShowSegmentation);
    }
  }, [controlledShowSegmentation]);

  useEffect(() => {
    if (controlledSimplifyChords !== undefined) {
      setSimplifyChords(controlledSimplifyChords);
    }
  }, [controlledSimplifyChords]);

  // Panel state
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);
  const [isLyricsPanelOpen, setIsLyricsPanelOpen] = useState(false);

  // Title and editing state
  const [videoTitle, setVideoTitle] = useState(initialVideoTitle);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedChords, setEditedChords] = useState<Record<string, string>>({});
  // Authoritative UI toggles (migrated)
  const [showRomanNumerals, setShowRomanNumerals] = useState<boolean>(initialShowRomanNumerals);
  const [romanNumeralData, setRomanNumeralData] = useState<RomanNumeralData | null>(initialRomanNumeralData);
  const [showSegmentation, setShowSegmentation] = useState<boolean>(initialShowSegmentation);
  const [simplifyChords, setSimplifyChords] = useState<boolean>(initialSimplifyChords);


  // Panel toggle handlers with mutual exclusivity
  const toggleChatbot = useCallback(() => {
    if (!isChatbotOpen && isLyricsPanelOpen) {

      // Close lyrics panel when opening chatbot

      setIsLyricsPanelOpen(false);
    }
    setIsChatbotOpen(!isChatbotOpen);
  }, [isChatbotOpen, isLyricsPanelOpen]);

  const toggleLyricsPanel = useCallback(() => {
    if (!isLyricsPanelOpen && isChatbotOpen) {
      // Close chatbot when opening lyrics panel
      setIsChatbotOpen(false);
    }
    setIsLyricsPanelOpen(!isLyricsPanelOpen);
  }, [isLyricsPanelOpen, isChatbotOpen]);

  // Editing handlers
  const handleEditModeToggle = useCallback(() => {
    if (!isEditMode) {
      setEditedTitle(videoTitle);
      setEditedChords({});
    }
    setIsEditMode(!isEditMode);
  }, [isEditMode, videoTitle]);

  const handleTitleSave = useCallback(() => {
    setVideoTitle(editedTitle);

    setIsEditMode(false);
  }, [editedTitle]);

  const handleTitleCancel = useCallback(() => {
    setEditedTitle(videoTitle);
    setEditedChords({});
    setIsEditMode(false);
  }, [videoTitle]);

  const handleTitleChange = useCallback((title: string) => {
    setEditedTitle(title);
  }, []);

  const handleChordEdit = useCallback((originalChord: string, newChord: string) => {
    setEditedChords(prev => ({
      ...prev,
      [originalChord]: newChord
    }));
  }, []);

  // UI toggle handlers
  const toggleRomanNumerals = useCallback(() => {
    setShowRomanNumerals(v => {
      const next = !v;
      onShowRomanNumeralsChange?.(next);
      return next;
    });
  }, [onShowRomanNumeralsChange]);
  const updateRomanNumeralData = useCallback((data: RomanNumeralData | null) => {
    setRomanNumeralData(data);
    onRomanNumeralDataChange?.(data);
  }, [onRomanNumeralDataChange]);
  const toggleSegmentation = useCallback(() => {
    setShowSegmentation(v => {
      const next = !v;
      onShowSegmentationChange?.(next);
      return next;
    });
  }, [onShowSegmentationChange]);

  const toggleSimplifyChords = useCallback(() => {
    setSimplifyChords(v => {
      const next = !v;
      onSimplifyChordsChange?.(next);
      return next;
    });
  }, [onSimplifyChordsChange]);

  // Memoized context value to prevent unnecessary re-renders
  const contextValue = useMemo((): UIState => ({
    // Tab management

    activeTab,
    setActiveTab,

    // Panel toggles
    isChatbotOpen,
    isLyricsPanelOpen,
    toggleChatbot,
    toggleLyricsPanel,

    // Title and editing
    videoTitle,
    setVideoTitle,
    isEditMode,
    editedTitle,
    editedChords,

    // UI features (authoritative)
    showRomanNumerals,
    setShowRomanNumerals,
    toggleRomanNumerals,
    romanNumeralData,
    updateRomanNumeralData,
    showSegmentation,
    setShowSegmentation,
    toggleSegmentation,

    // Chord simplification
    simplifyChords,
    setSimplifyChords,
    toggleSimplifyChords,

    // Editing handlers
    handleEditModeToggle,
    handleTitleSave,
    handleTitleCancel,
    handleTitleChange,
    handleChordEdit,
  }), [
    activeTab,
    isChatbotOpen,
    isLyricsPanelOpen,
    toggleChatbot,
    toggleLyricsPanel,
    videoTitle,
    isEditMode,
    editedTitle,
    editedChords,
    showRomanNumerals,
    romanNumeralData,
    showSegmentation,
    handleEditModeToggle,
    handleTitleSave,
    handleTitleCancel,
    handleTitleChange,
    handleChordEdit,
    toggleRomanNumerals,
    toggleSegmentation,
    updateRomanNumeralData,
    simplifyChords,
    toggleSimplifyChords,
  ]);

  return (
    <UIContext.Provider value={contextValue}>
      {children}
    </UIContext.Provider>
  );
};

export const useUI = (): UIState => {
  const context = useContext(UIContext);
  if (context === undefined) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
};

export default UIContext;
