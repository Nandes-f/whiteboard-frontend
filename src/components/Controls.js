import React from 'react';
import { useWhiteboard } from '../context/WhiteboardContext';
import { FaMoon, FaSun, FaShareAlt, FaUsers } from 'react-icons/fa';

const Controls = ({ roomId }) => {
  const { darkMode, setDarkMode } = useWhiteboard();
  
  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };
  
  const shareRoom = async () => {
    const url = window.location.href;
    
    const copyToClipboard = async (text) => {
      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          return true;
        }
        
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-999999px';
        textarea.style.top = '-999999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        
        try {
          document.execCommand('copy');
          document.body.removeChild(textarea);
          return true;
        } catch (err) {
          document.body.removeChild(textarea);
          return false;
        }
      } catch (err) {
        return false;
      }
    };

    try {
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'Join my TutorTrack Whiteboard',
            text: 'Join my whiteboard session',
            url: url
          });
          return;
        } catch (err) {
        }
      }

      const success = await copyToClipboard(url);
      if (success) {
        alert('Room link copied to clipboard!');
      } else {
        alert(`Please copy this URL manually:\n${url}`);
      }
    } catch (err) {
      alert(`Please copy this URL manually:\n${url}`);
    }
  };
  
  return (
    <div className="whiteboard-controls">
      <button 
        className="control-button"
        onClick={toggleDarkMode}
        title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      >
        {darkMode ? <FaSun /> : <FaMoon />}
      </button>
      
      <button 
        className="control-button"
        onClick={shareRoom}
        title="Share Room Link"
      >
        <FaShareAlt />
      </button>
    </div>
  );
};

export default Controls;