import React, { createContext, useState, useContext, useEffect } from 'react';

const WhiteboardContext = createContext();

export const useWhiteboard = () => useContext(WhiteboardContext);

export const WhiteboardProvider = ({ children, userId, initialRole }) => {
  const [tool, setTool] = useState('select');
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(5);
  const [users, setUsers] = useState([]);
  const [darkMode, setDarkMode] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [canvasObjects, setCanvasObjects] = useState([]);
  const [userRole, setUserRole] = useState(initialRole || localStorage.getItem('whiteboard_user_role') || 'student');
  const [isActionBlocked, setIsActionBlocked] = useState(false);
  const [viewMode, setViewMode] = useState('normal');

  const availableTools = [
    { name: 'select', icon: 'mouse-pointer' },
    { name: 'pen', icon: 'pencil-alt' },
    { name: 'pixel', icon: 'th' },
    { name: 'eraser', icon: 'eraser' },
    { name: 'rectangle', icon: 'square' },
    { name: 'circle', icon: 'circle' },
    { name: 'line', icon: 'slash' },
    { name: 'arrow', icon: 'long-arrow-alt-right' },
    { name: 'text', icon: 'font' },
    { name: 'equation', icon: 'square-root-alt' },
    { name: 'laser', icon: 'dot-circle' },
    { name: 'image', icon: 'image' }
  ];
  useEffect(() => {
    const savedDarkMode = localStorage.getItem('whiteboard_dark_mode');
    if (savedDarkMode) {
      setDarkMode(savedDarkMode === 'true');
    }
    
    const savedColor = localStorage.getItem('whiteboard_color');
    if (savedColor) {
      setColor(savedColor);
    }
    
    const savedBrushSize = localStorage.getItem('whiteboard_brush_size');
    if (savedBrushSize) {
      setBrushSize(parseInt(savedBrushSize, 10));
    }
    
  }, []);

  useEffect(() => {
    localStorage.setItem('whiteboard_dark_mode', darkMode);
    localStorage.setItem('whiteboard_color', color);
    localStorage.setItem('whiteboard_brush_size', brushSize);
    localStorage.setItem('whiteboard_user_role', userRole);
  }, [darkMode, color, brushSize, userRole]);

  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [darkMode]);

  const addToHistory = (objects) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(objects);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      return history[historyIndex - 1];
    }
    return null;
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      return history[historyIndex + 1];
    }
    return null;
  };

  const handleToolChange = (newTool) => {
    setTool(newTool);
  };

  const handleColorChange = (newColor) => {
    setColor(newColor);
  };

  const handleBrushSizeChange = (newSize) => {
    setBrushSize(newSize);
  };

  const handleViewModeChange = (newMode) => {
    setViewMode(newMode);
  };

  const value = {
    tool,
    setTool: handleToolChange,
    color,
    setColor: handleColorChange,
    brushSize,
    setBrushSize: handleBrushSizeChange,
    users,
    setUsers,
    darkMode,
    setDarkMode,
    history,
    historyIndex,
    addToHistory,
    undo,
    redo,
    canvasObjects,
    setCanvasObjects,
    userRole,
    setUserRole,
    isActionBlocked,
    setIsActionBlocked,
    userId,
    viewMode,
    setViewMode,
    availableTools,
    handleToolChange,
    handleColorChange,
    handleBrushSizeChange,
    handleViewModeChange
  };

  return (
    <WhiteboardContext.Provider value={value}>
      {children}
    </WhiteboardContext.Provider>
  );
};