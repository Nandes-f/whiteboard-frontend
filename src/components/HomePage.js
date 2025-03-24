import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { FaChalkboardTeacher, FaPlus, FaDoorOpen } from 'react-icons/fa';

const HomePage = ({ userId }) => {
  const navigate = useNavigate();
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState('student');
  const [roomIdToJoin, setRoomIdToJoin] = useState('');
  const [action, setAction] = useState(''); 

  useEffect(() => {
    const storedName = localStorage.getItem('whiteboard_user_name');
    if (storedName) {
      setUserName(storedName);
    }
  }, []);

  const handleCreateRoom = () => {
    setAction('create');
    setShowNamePrompt(true);
  };

  const handleJoinRoom = () => {
    setAction('join');
    setShowNamePrompt(true);
  };

  const handleNameSubmit = (e) => {
    e.preventDefault();
    if (userName.trim()) {
      localStorage.setItem('whiteboard_user_name', userName);
      localStorage.setItem('whiteboard_user_role', userRole);

      if (action === 'create') {
        const roomId = uuidv4().substring(0, 8);
        navigate(`/room/${roomId}`);
      } else if (action === 'join') {
        if (roomIdToJoin.trim()) {
          navigate(`/room/${roomIdToJoin.trim()}`);
        }
      }
    }
  };

  if (showNamePrompt) {
    return (
      <div className="home-container">
        <div className="home-content">
          <h1><FaChalkboardTeacher /> TutorTrack Whiteboard</h1>
          <h2>{action === 'create' ? 'Create New Room' : 'Join Existing Room'}</h2>
          
          <form onSubmit={handleNameSubmit} className="user-info-form">
            <div className="form-group">
              <label htmlFor="userName">Your Name</label>
              <input
                type="text"
                id="userName"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Enter your name"
                required
                autoFocus
              />
            </div>
            
            <div className="form-group role-selector">
              <label>Your Role</label>
              <div className="radio-options">
                <label>
                  <input
                    type="radio"
                    name="role"
                    value="tutor"
                    checked={userRole === 'tutor'}
                    onChange={() => setUserRole('tutor')}
                  />
                  Tutor
                </label>
                <label>
                  <input
                    type="radio"
                    name="role"
                    value="student"
                    checked={userRole === 'student'}
                    onChange={() => setUserRole('student')}
                  />
                  Student
                </label>
              </div>
            </div>
            
            {action === 'join' && (
              <div className="form-group">
                <label htmlFor="roomId">Room ID</label>
                <input
                  type="text"
                  id="roomId"
                  value={roomIdToJoin}
                  onChange={(e) => setRoomIdToJoin(e.target.value)}
                  placeholder="Enter room ID"
                  required
                />
              </div>
            )}
            
            <div className="form-actions">
              <button type="button" onClick={() => setShowNamePrompt(false)}>
                Back
              </button>
              <button type="submit">
                {action === 'create' ? 'Create Room' : 'Join Room'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="home-container">
      <div className="home-content">
        <h1><FaChalkboardTeacher /> TutorTrack Whiteboard</h1>
        <p>Interactive whiteboard for tutoring sessions</p>
        
        <div className="home-actions">
          <button className="create-room-button" onClick={handleCreateRoom}>
            <FaPlus /> Create New Whiteboard
          </button>
          <button className="join-room-button" onClick={handleJoinRoom}>
            <FaDoorOpen /> Join Existing Whiteboard
          </button>
        </div>
      </div>
    </div>
  );
};

export default HomePage;