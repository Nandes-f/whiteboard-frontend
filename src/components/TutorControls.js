import React, { useState, useEffect } from 'react';
import { useWhiteboard } from '../context/WhiteboardContext';
import { FaLock, FaLockOpen, FaUsers, FaCopy, FaSignOutAlt } from 'react-icons/fa';
import { EVENTS } from '../utils/socketEvents';

const TutorControls = ({ users, emit, roomId, userId, onCloseRoom }) => {
  const { userRole } = useWhiteboard();
  const [showControls, setShowControls] = useState(false);
  const [copySuccess, setCopySuccess] = useState('');
  const [studentsStatus, setStudentsStatus] = useState({});
  
  useEffect(() => {
    if (userRole === 'tutor') {
      const initialStatus = {};
      users.forEach(user => {
        if (user.role === 'student') {
          initialStatus[user.id] = user.isBlocked || false;
        }
      });
      setStudentsStatus(initialStatus);
    }
  }, [users, userRole]);
  
  if (userRole !== 'tutor') return null;
  
  const toggleStudentPermission = (studentId, currentlyBlocked) => {
    setStudentsStatus(prev => ({
      ...prev,
      [studentId]: !currentlyBlocked
    }));
    
    emit(EVENTS.TOGGLE_STUDENT_PERMISSION, {
      roomId,
      studentId,
      isAllowed: !currentlyBlocked  
    });
    
  };
  
  const copyRoomId = () => {
    const textarea = document.createElement('textarea');
    textarea.value = roomId;
    textarea.style.position = 'fixed'; 
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(roomId)
          .then(() => {
            setCopySuccess('Copied!');
            setTimeout(() => setCopySuccess(''), 2000);
          })
          .catch(() => {
            fallbackCopyToClipboard();
          });
      } else {
        fallbackCopyToClipboard();
      }
    } catch (err) {
      alert(`Room ID: ${roomId}`);
    } finally {
      document.body.removeChild(textarea);
    }
  };
  
  const fallbackCopyToClipboard = () => {
    const textarea = document.createElement('textarea');
    textarea.value = roomId;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    
    try {
      textarea.select();
      document.execCommand('copy');
      setCopySuccess('Copied!');
      setTimeout(() => setCopySuccess(''), 2000);
    } catch (err) {
      alert(`Room ID: ${roomId}`);
    } finally {
      document.body.removeChild(textarea);
    }
  };
  
  const students = users.filter(user => user.role === 'student');
  
  const handleCloseRoom = () => {
    if (window.confirm('Are you sure you want to close this room? All participants will be disconnected.')) {
      
      emit(EVENTS.CLOSE_ROOM, roomId);
      
      setTimeout(() => {
        if (onCloseRoom) onCloseRoom();
      }, 300);
    }
  };
  
  return (
    <div className="tutor-controls">
      <div className="tutor-controls-buttons">
        <button 
          className="control-button"
          onClick={copyRoomId}
          title="Copy Room ID"
        >
          <FaCopy /> {copySuccess ? copySuccess : 'Copy Room ID'}
        </button>
        
        <button 
          className="control-button"
          onClick={handleCloseRoom}
          title="Close Room"
        >
          <FaSignOutAlt /> Close Room
        </button>
        
        <button 
          className="control-button"
          onClick={() => setShowControls(!showControls)}
          title="Student Controls"
        >
          <FaUsers /> {showControls ? 'Hide Controls' : 'Student Controls'}
        </button>
      </div>
      
      {showControls && students.length > 0 && (
        <div className="student-controls-panel">
          <h3>Student Controls</h3>
          <ul className="student-list">
            {students.map(student => {
              const isBlocked = studentsStatus[student.id] !== undefined 
                ? studentsStatus[student.id] 
                : (student.isBlocked || false);
                
              return (
                <li key={student.id}>
                  <span>{student.name}</span>
                  <button 
                    onClick={() => toggleStudentPermission(student.id, isBlocked)}
                    className={`permission-toggle ${isBlocked ? 'blocked' : 'allowed'}`}
                    title={isBlocked ? "Unblock Student" : "Block Student"}
                  >
                    {isBlocked ? <FaLock /> : <FaLockOpen />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

export default TutorControls;