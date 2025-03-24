import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { EVENTS } from '../utils/socketEvents';

const useSocket = (roomId, userId, userName, userRole) => {
  const [isConnected, setIsConnected] = useState(false);
  const [users, setUsers] = useState([]);
  const socketRef = useRef(null);
  const [effectiveRole, setEffectiveRole] = useState(null);
  const eventListeners = useRef(new Map());

  useEffect(() => {
    if (!roomId || !userId || !userName) {
      return;
    }
    
    const role = userRole || localStorage.getItem('whiteboard_user_role') || 'student';
    setEffectiveRole(role);
    
    
    const socket = io(process.env.REACT_APP_SOCKET_URL || 'http://172.20.1.119:5000', {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      forceNew: true,
      transports: ['websocket', 'polling'],
      query: {
        roomId,
        userId,
        userName,
        userRole: role
      }
    });
    
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      
      socket.emit(EVENTS.JOIN_ROOM, roomId, userId, userName || 'Anonymous', role);
      
      socket.emit(EVENTS.REQUEST_CANVAS_STATE, roomId);
    });

    socket.on('connect_error', (error) => {
      setIsConnected(false);
    });

    socket.on('disconnect', (reason) => {
      setIsConnected(false);
    });

    socket.on(EVENTS.USERS_LIST, (usersList) => {
      setUsers(usersList);
    });

    socket.on(EVENTS.DRAW_ACTION, (action) => {
      const handler = eventListeners.current.get(EVENTS.DRAW_ACTION);
      if (handler) {
        handler(action);
      } else {
      }
    });

    socket.on(EVENTS.CANVAS_STATE_RESPONSE, (canvasState) => {
      const handler = eventListeners.current.get(EVENTS.CANVAS_STATE_RESPONSE);
      if (handler) {
        handler(canvasState);
      }
    });

    socket.on(EVENTS.CLOSE_ROOM, () => {
      const handler = eventListeners.current.get(EVENTS.CLOSE_ROOM);
      if (handler) {
        handler();
      }
    });

    socket.on(EVENTS.STUDENT_PERMISSION_CHANGE, (data) => {
      const handler = eventListeners.current.get(EVENTS.STUDENT_PERMISSION_CHANGE);
      if (handler) {
        handler(data);
      }
    });

    return () => {
      if (socket.connected) {
        socket.emit(EVENTS.LEAVE_ROOM, roomId, userId);
        socket.disconnect();
      }
    };
  }, [roomId, userId, userName, userRole]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      if (socketRef.current.connected) {
        socketRef.current.emit(EVENTS.LEAVE_ROOM, roomId, userId);
        socketRef.current.disconnect();
      }
      socketRef.current = null;
      setIsConnected(false);
      setUsers([]);
    }
  }, [roomId, userId]);

  const emit = useCallback((event, ...args) => {
    if (socketRef.current && socketRef.current.connected) {
      
      if (event === EVENTS.DRAW_ACTION) {
        const drawAction = args[0];
        if (!drawAction.roomId) {
          drawAction.roomId = roomId;
        }
        if (!drawAction.userId) {
          drawAction.userId = userId;
        }
        socketRef.current.emit(event, drawAction);
      } else {
        socketRef.current.emit(event, ...args);
      }
      return true;
    } else {
      return false;
    }
  }, [roomId, userId]);

  const on = useCallback((event, callback) => {
    eventListeners.current.set(event, callback);
    
    if (socketRef.current) {
      socketRef.current.on(event, callback);
    }
  }, []);
  
  const off = useCallback((event) => {
    eventListeners.current.delete(event);
    
    if (socketRef.current) {
      socketRef.current.off(event);
    }
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
    users,
    emit,
    on,
    off,
    disconnect,
    effectiveRole
  };
};

export default useSocket;