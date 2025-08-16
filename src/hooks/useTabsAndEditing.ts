import { useState, useCallback } from 'react';

// Tab types
type ActiveTab = 'beatChordMap' | 'guitarChords' | 'lyricsChords';

/**
 * Custom hook to manage tab switching and title editing logic
 * Extracted from the main page component to isolate UI state management
 */
export const useTabsAndEditing = (initialVideoTitle: string = '') => {
  // Tab state
  const [activeTab, setActiveTab] = useState<ActiveTab>('beatChordMap');
  
  // Editing state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedChords, setEditedChords] = useState<Record<string, string>>({});
  const [videoTitle, setVideoTitle] = useState(initialVideoTitle);

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
    console.log('💾 Title saved:', editedTitle);
  }, [editedTitle]);

  const handleTitleCancel = useCallback(() => {
    setEditedTitle(videoTitle);
    setEditedChords({});
    setIsEditMode(false);
    console.log('❌ Title edit cancelled');
  }, [videoTitle]);

  const handleTitleChange = useCallback((title: string) => {
    setEditedTitle(title);
  }, []);

  const handleChordEdit = useCallback((originalChord: string, newChord: string) => {
    setEditedChords(prev => ({
      ...prev,
      [originalChord]: newChord
    }));
    console.log(`🎼 Chord edited: ${originalChord} → ${newChord}`);
  }, []);

  return {
    // Tab state
    activeTab,
    setActiveTab,
    
    // Title and editing state
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
  };
};
