export const EVENTS = {
    JOIN_ROOM: 'join-room',
    LEAVE_ROOM: 'leave-room',
    USER_JOINED: 'user-joined',
    USER_LEFT: 'user-left',
    USERS_LIST: 'users-list',
    
    DRAW_ACTION: 'draw-action',
    REQUEST_CANVAS_STATE: 'request-canvas-state',
    CANVAS_STATE: 'canvas-state',
    CANVAS_STATE_RESPONSE: 'canvas-state-response',
    CLEAR_CANVAS: 'clear-canvas',
    
    CURSOR_POSITION: 'cursor-position',
    
    CLOSE_ROOM: 'close-room',
    
    TOGGLE_STUDENT_PERMISSION: 'toggle-student-permission',
    STUDENT_PERMISSION_CHANGE: 'student-permission-change',
    
    IMAGE_UPLOAD: 'image-upload',
    IMAGE_UPLOADED: 'image-uploaded',
    
    UNDO_ACTION: 'undoAction',
    REDO_ACTION: 'redoAction'
};

export const DRAW_ACTIONS = {
    ADD_OBJECT: 'add_object',
    MODIFY_OBJECT: 'modify_object',
    REMOVE_OBJECT: 'remove_object',
    CLEAR: 'clear',
    ADD_IMAGE: 'add_image',
    ADD_PDF: 'add_pdf'
};

export const createDrawAction = (type, data, userId, roomId) => {
    return {
        type,
        data,
        userId,
        roomId,
        timestamp: Date.now()
    };
};

export const createCursorPositionEvent = (roomId, userId, position) => {
    return {
        roomId,
        userId,
        position,
        timestamp: Date.now()
    };
};

export const createImageUploadEvent = (roomId, userId, imageData, imageType, position) => {
    return {
        roomId,
        userId,
        imageData,
        imageType,
        position,
        timestamp: Date.now()
    };
};