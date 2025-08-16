'use client';

import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';

// UI state types
type ActiveTab = 'beatChordMap' | 'guitarChords' | 'lyricsChords';

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
}

export const UIProvider: React.FC<UIProviderProps> = ({ 
  children, 
  initialVideoTitle = '' 
}) => {
  // Tab state
  const [activeTab, setActiveTab] = useState<ActiveTab>('beatChordMap');
  
  // Panel state
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);
  const [isLyricsPanelOpen, setIsLyricsPanelOpen] = useState(false);
  
  // Title and editing state
  const [videoTitle, setVideoTitle] = useState(initialVideoTitle);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedChords, setEditedChords] = useState<Record<string, string>>({});

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
    handleEditModeToggle,
    handleTitleSave,
    handleTitleCancel,
    handleTitleChange,
    handleChordEdit,
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
