import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import { fabric } from 'fabric';
import { useWhiteboard } from '../context/WhiteboardContext';
import { EVENTS, DRAW_ACTIONS, createDrawAction } from '../utils/socketEvents';
import * as fabricHelpers from '../utils/fabricHelpers';
import EquationEditor from './EquationEditor';
import html2canvas from 'html2canvas';
import katex from 'katex';

const Canvas = forwardRef(({ roomId, userId, userRole, isConnected, emit, on, off }, ref) => {
    const canvasRef = useRef(null);
    const fabricCanvasRef = useRef(null);
    const isProcessingEvent = useRef(false);
    const pendingUpdates = useRef(new Map());
    const [equationEditorOpen, setEquationEditorOpen] = useState(false);
    const [equationPosition, setEquationPosition] = useState({ x: 0, y: 0 });
    const laserPointerTimeout = useRef(null);
    const isRemoteAction = useRef(false);
    const processedObjects = useRef(new Set());

    const historyStack = useRef([]);
    const redoStack = useRef([]);
    const isUndoRedoAction = useRef(false);
    const maxHistoryLength = 50;

    const actionStack = useRef([]);

    const currentPath = useRef(null);
    const pathPoints = useRef([]);

    const {
        tool,
        setTool,
        color,
        brushSize,
        isActionBlocked,
        setIsActionBlocked
    } = useWhiteboard();

    const STORAGE_KEY = `whiteboard_${roomId}_state`;

    useImperativeHandle(ref, () => ({
        clearCanvas: () => {
            clearCanvas();
        },
        exportCanvasAsImage: (format) => {
            return exportCanvasAsImage(format);
        },
        exportCanvasAsSVG: () => {
            return exportCanvasAsSVG();
        },
        undoAction: () => {
            undoAction();
        },
        redoAction: () => {
            redoAction();
        },
        handleImageUpload: (file) => {
            handleImageUpload(file);
        }
    }));

    const cleanupDrawingListeners = useCallback(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        canvas.off('mouse:down');
        canvas.off('mouse:move');
        canvas.off('mouse:up');

        if (canvas.eraserTool) {
            canvas.eraserTool.deactivate();
            canvas.eraserTool = null;
        }

        canvas.defaultCursor = 'default';
        canvas.selection = true;
    }, []);

    const setupEraserTool = useCallback(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        canvas.isDrawingMode = true;
        const backgroundColor = canvas.backgroundColor || '#ffffff';

        const eraserBrush = new fabric.PencilBrush(canvas);
        eraserBrush.width = brushSize;
        eraserBrush.color = backgroundColor;

        canvas.freeDrawingBrush = eraserBrush;
        canvas.defaultCursor = 'none';

        const existingCursors = canvas.getObjects().filter(obj => 
            obj.excludeFromExport === true && obj.eraserCursor === true
        );
        
        if (existingCursors.length > 0) {
            existingCursors.forEach(cursor => canvas.remove(cursor));
        }

        let eraserCursor = new fabric.Circle({
            radius: brushSize / 2,
            fill: 'rgba(255,255,255,0.2)',
            stroke: 'rgba(0,0,0,0.5)',
            strokeWidth: 1,
            strokeDashArray: [5, 5],
            originX: 'center',
            originY: 'center',
            left: -100,
            top: -100,
            selectable: false,
            evented: false,
            excludeFromExport: true,
            hoverCursor: 'none',
            eraserCursor: true,
            visible: true
        });

        canvas.add(eraserCursor);

        const handlePathCreated = (e) => {
            if (tool !== 'eraser') return;

            const eraserPath = e.path;
            canvas.remove(eraserPath);

            let modifiedObjects = [];

            canvas.getObjects().forEach(obj => {
                if (obj === eraserCursor || obj.temporary || obj.excludeFromExport) return;

                try {
                    const clipPath = new fabric.Path(eraserPath.path, {
                        inverted: true,
                        absolutePositioned: true
                    });

                    const currentClipPaths = obj.clipPath ?
                        (Array.isArray(obj.clipPath) ? obj.clipPath : [obj.clipPath]) :
                        [];

                    obj.clipPath = [
                        ...currentClipPaths,
                        clipPath.toObject()
                    ];

                    obj.dirty = true;
                    modifiedObjects.push(obj);
                } catch (error) {
                    console.error('Error applying eraser:', error);
                }
            });

            canvas.renderAll();

            if (isConnected && modifiedObjects.length > 0) {
                modifiedObjects.forEach(obj => {
                    if (obj.id) {
                        const objData = obj.toObject(['id', 'ownerId']);
                        if (objData.clipPath) {
                            objData.clipPath = Array.isArray(objData.clipPath) 
                                ? objData.clipPath 
                                : [objData.clipPath];
                            
                            objData.clipPath = objData.clipPath.map(path =>
                                typeof path.toObject === 'function' ? path.toObject() : path
                            );
                        }

                        if (obj.type) objData.type = obj.type;
                        if (obj.path) objData.path = obj.path;
                        objData.left = obj.left;
                        objData.top = obj.top;
                        objData.scaleX = obj.scaleX;
                        objData.scaleY = obj.scaleY;
                        objData.angle = obj.angle || 0;

                        emit(EVENTS.DRAW_ACTION, createDrawAction(
                            DRAW_ACTIONS.MODIFY_OBJECT,
                            {
                                objectId: obj.id,
                                json: objData
                            },
                            userId,
                            roomId
                        ));
                    }
                });
            }
        };

        const handleMouseMove = (e) => {
            const pointer = canvas.getPointer(e.e);
            eraserCursor.set({
                left: pointer.x,
                top: pointer.y,
                visible: true
            });
            canvas.requestRenderAll();
        };

        const canvasContainer = document.querySelector('.canvas-container');
        if (canvasContainer) {
            canvasContainer.addEventListener('mouseleave', () => {
                eraserCursor.set({ visible: false });
                canvas.requestRenderAll();
            });

            canvasContainer.addEventListener('mouseenter', () => {
                eraserCursor.set({ visible: true });
                canvas.requestRenderAll();
            });
        }

        canvas.on('path:created', handlePathCreated);
        canvas.on('mouse:move', handleMouseMove);
        canvas.on('mouse:down', handleMouseMove);
        canvas.on('mouse:up', handleMouseMove);

        return () => {
            canvas.off('path:created', handlePathCreated);
            canvas.off('mouse:move', handleMouseMove);
            canvas.off('mouse:down', handleMouseMove);
            canvas.off('mouse:up', handleMouseMove);

            if (canvasContainer) {
                canvasContainer.removeEventListener('mouseleave', () => { });
                canvasContainer.removeEventListener('mouseenter', () => { });
            }

            if (eraserCursor && eraserCursor.canvas) {
                canvas.remove(eraserCursor);
            }
        };
    }, [brushSize, tool, isConnected, emit, userId, roomId]);

    useEffect(() => {
        const canvas = new fabric.Canvas(canvasRef.current, {
            isDrawingMode: false,
            selection: true,
            width: window.innerWidth - 60,
            height: window.innerHeight - 60,
            perPixelTargetFind: false,
            targetFindTolerance: 0,
            skipTargetFind: true
        });

        canvas.userId = userId;

        fabricCanvasRef.current = canvas;

        const savedState = loadStateFromStorage();
        if (savedState) {
            isRemoteAction.current = true;
            try {
                canvas.loadFromJSON(savedState.canvasState, () => {
                    canvas.getObjects().forEach(obj => {
                        if (obj.id) {
                            processedObjects.current.add(obj.id);
                        }
                        applyPermissions(obj);
                    });

                    if (savedState.actionHistory) {
                        actionStack.current = savedState.actionHistory;
                    }

                    canvas.renderAll();
                });
            } catch (error) {
            } finally {
                isRemoteAction.current = false;
            }
        }

        const handleResize = () => {
            canvas.setDimensions({
                width: window.innerWidth - 60,
                height: window.innerHeight - 60
            });
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            canvas.dispose();
        };
    }, [userId]);

    useEffect(() => {
        if (!isConnected) return;

        const handlePermissionChange = (data) => {
            if (data.studentId === userId) {
                setIsActionBlocked(data.isAllowed);

                if (data.isAllowed) {
                    setTool('select');
                }
            }
        };

        on(EVENTS.STUDENT_PERMISSION_CHANGE, handlePermissionChange);

        return () => {
            off(EVENTS.STUDENT_PERMISSION_CHANGE);
        };
    }, [isConnected, on, off, userId, setIsActionBlocked, setTool]);

    useEffect(() => {
        if (!isConnected || !fabricCanvasRef.current) return;

        emit(EVENTS.REQUEST_CANVAS_STATE, {
            roomId,
            userId,
            timestamp: Date.now()
        });

        on(EVENTS.CANVAS_STATE_RESPONSE, (response) => {
            const canvas = fabricCanvasRef.current;
            if (!canvas || !response) return;

            isRemoteAction.current = true;
            try {
                canvas.clear();
                processedObjects.current.clear();
                actionStack.current = [];
                redoStack.current = [];

                if (response.state) {
                    canvas.loadFromJSON(response.state, () => {
                        canvas.getObjects().forEach(obj => {
                            if (obj.id) {
                                processedObjects.current.add(obj.id);
                            }
                            applyPermissions(obj);
                        });

                        if (response.actionHistory) {
                            actionStack.current = response.actionHistory;
                        }

                        saveStateToStorage();

                        canvas.renderAll();
                    });
                }
            } catch (error) {
            } finally {
                isRemoteAction.current = false;
            }
        });

        on(EVENTS.REQUEST_CANVAS_STATE, (data) => {
            if (userRole === 'tutor') {
                const canvas = fabricCanvasRef.current;
                if (!canvas) return;

                emit(EVENTS.CANVAS_STATE_RESPONSE, {
                    roomId,
                    userId: data.userId,
                    state: canvas.toJSON(['id', 'ownerId', 'type']),
                    actionHistory: actionStack.current,
                    timestamp: Date.now()
                });
            }
        });

        on(EVENTS.DRAW_ACTION, (action) => {
            if (action.userId === userId) return;
            handleRemoteDrawAction(action);
            saveStateToStorage();
        });

        return () => {
            off(EVENTS.DRAW_ACTION);
            off(EVENTS.CANVAS_STATE_RESPONSE);
            off(EVENTS.REQUEST_CANVAS_STATE);
        };
    }, [isConnected, emit, on, off, roomId, userId, userRole]);

    const applyPermissions = (obj) => {
        if (isActionBlocked) {
            obj.selectable = false;
            obj.evented = false;
            obj.lockMovementX = true;
            obj.lockMovementY = true;
            obj.lockRotation = true;
            obj.lockScalingX = true;
            obj.lockScalingY = true;
            return;
        }

            obj.selectable = true;
            obj.evented = true;
            obj.lockMovementX = false;
            obj.lockMovementY = false;
            obj.lockRotation = false;
            obj.lockScalingX = false;
            obj.lockScalingY = false;
    };

    const handleRemoteDrawAction = (action) => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        if (action.userId === userId) return;

        isRemoteAction.current = true;

        try {
            switch (action.type) {
                case DRAW_ACTIONS.ADD_OBJECT:
                    if (action.data && action.data.json) {
                        const objectId = action.data.json.id;

                        if (processedObjects.current.has(objectId)) {
                            return;
                        }

                        const existingObj = canvas.getObjects().find(obj => obj.id === objectId);
                        if (existingObj) {
                            canvas.remove(existingObj);
                            processedObjects.current.delete(objectId);
                        }

                        if (action.data.json.type === 'equation') {
                            fabric.Image.fromURL(action.data.json.src, (img) => {
                                if (!img) return;

                                img.set({
                                    ...action.data.json,
                                    ownerId: action.userId,
                                    selectable: true,
                                    evented: true,
                                    crossOrigin: 'anonymous'
                                });

                                canvas.add(img);
                                processedObjects.current.add(objectId);
                                applyPermissions(img);
                                canvas.renderAll();

                                if (isConnected) {
                                    const objectJSON = {
                                        ...img.toJSON(['id', 'ownerId', 'type', 'equation', 'color']),
                                        src: action.data.json.src,
                                        left: img.left,
                                        top: img.top,
                                        scaleX: img.scaleX,
                                        scaleY: img.scaleY,
                                        angle: img.angle || 0,
                                        equation: action.data.json.equation,
                                        color: action.data.json.color
                                    };

                                    emit(EVENTS.DRAW_ACTION, createDrawAction(
                                        DRAW_ACTIONS.ADD_OBJECT,
                                        { json: objectJSON },
                                        userId,
                                        roomId
                                    ));
                                }
                            }, { crossOrigin: 'anonymous' });
                        } else {
                            fabric.util.enlivenObjects([action.data.json], (objects) => {
                                objects.forEach(obj => {
                                    obj._skipObjectAdded = true;
                                    obj.set({
                                        ownerId: action.userId,
                                        selectable: true,
                                        evented: true,
                                        id: objectId
                                    });

                                    canvas.add(obj);
                                    processedObjects.current.add(objectId);
                                    applyPermissions(obj);
                                });

                                canvas.requestRenderAll();
                            });
                        }
                    }
                    break;

                case DRAW_ACTIONS.MODIFY_OBJECT:
                    if (action.data && action.data.objectId && action.data.json) {
                        const existingObj = canvas.getObjects().find(obj => obj.id === action.data.objectId);
                        if (existingObj) {
                            isRemoteAction.current = true;
                            try {
                                // Handle text objects specifically
                                if (action.data.json.type === 'i-text') {
                                    existingObj.set({
                                        text: action.data.json.text,
                                        left: action.data.json.left,
                                        top: action.data.json.top,
                                        scaleX: action.data.json.scaleX,
                                        scaleY: action.data.json.scaleY,
                                        angle: action.data.json.angle || 0,
                                        fontSize: action.data.json.fontSize,
                                        fontFamily: action.data.json.fontFamily,
                                        fill: action.data.json.fill
                                    });
                                } else if (action.data.json.type === 'image' || action.data.json.type === 'pdf-page') {
                                    // For images, only update position and transformation properties
                                    existingObj.set({
                                        left: action.data.json.left,
                                        top: action.data.json.top,
                                        scaleX: action.data.json.scaleX,
                                        scaleY: action.data.json.scaleY,
                                        angle: action.data.json.angle || 0
                                    });
                                } else {
                                    // Handle other object types
                                    existingObj.set({
                                        left: action.data.json.left,
                                        top: action.data.json.top,
                                        scaleX: action.data.json.scaleX,
                                        scaleY: action.data.json.scaleY,
                                        angle: action.data.json.angle || 0
                                    });

                                    if (action.data.json.path) {
                                        existingObj.set('path', action.data.json.path);
                                    }
                                }

                                existingObj.setCoords();
                                canvas.requestRenderAll();
                            } finally {
                                isRemoteAction.current = false;
                            }
                        }
                    }
                    break;

                case DRAW_ACTIONS.REMOVE_OBJECT:
                    if (action.data && action.data.objectId) {
                        const object = canvas.getObjects().find(obj => obj.id === action.data.objectId);
                        if (object) {
                            canvas.remove(object);
                            processedObjects.current.delete(action.data.objectId);
                            canvas.requestRenderAll();
                        }
                    }
                    break;

                case DRAW_ACTIONS.CLEAR:
                    canvas.clear();
                    processedObjects.current.clear();
                    canvas.requestRenderAll();
                    break;

                case DRAW_ACTIONS.UNDO:
                    if (action.data && action.data.state) {
                        // For any user (tutor or student), only handle their objects
                        // Remove this user's objects
                        canvas.getObjects()
                            .filter(obj => obj.ownerId === action.userId)
                            .forEach(obj => canvas.remove(obj));
                        
                        // Restore the user's objects from the state
                        const userObjects = action.data.state.objects.filter(obj => obj.ownerId === action.userId);
                        
                        if (userObjects.length > 0) {
                            fabric.util.enlivenObjects(userObjects, (objects) => {
                                objects.forEach(obj => {
                                    if (obj.id) {
                                        processedObjects.current.add(obj.id);
                                    }
                                    canvas.add(obj);
                                });
                                canvas.renderAll();
                            });
                        }
                    }
                    break;

                case DRAW_ACTIONS.REDO:
                    if (action.data && action.data.state) {
                        // For any user (tutor or student), only handle their objects
                        // Remove this user's objects
                        canvas.getObjects()
                            .filter(obj => obj.ownerId === action.userId)
                            .forEach(obj => canvas.remove(obj));
                        
                        // Restore the user's objects from the state
                        const userObjects = action.data.state.objects.filter(obj => obj.ownerId === action.userId);
                        
                        if (userObjects.length > 0) {
                            fabric.util.enlivenObjects(userObjects, (objects) => {
                                objects.forEach(obj => {
                                    if (obj.id) {
                                        processedObjects.current.add(obj.id);
                                    }
                                    canvas.add(obj);
                                });
                                canvas.renderAll();
                            });
                        }
                    }
                    break;

                default:
                    break;
            }
        } catch (error) {
            console.error('Error in handleRemoteDrawAction:', error);
        } finally {
            isRemoteAction.current = false;
        }
    };

    const handleRemoteCursor = (data) => {
        if (data.userId === userId) return;

        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        const existingPointers = canvas.getObjects().filter(obj => 
            obj.temporary === true && 
            obj.userId === data.userId &&
            obj.isLaserPointer === true
        );
        
        if (existingPointers.length > 0) {
            existingPointers.forEach(pointer => canvas.remove(pointer));
        }

        const { x, y, color } = data.position;
        const remotePointer = new fabric.Circle({
            left: x - 5,
            top: y - 5,
            radius: 5,
            fill: color || '#ff0000',
            opacity: 0.7,
            selectable: false,
            evented: false,
            originX: 'center',
            originY: 'center',
            temporary: true,
            isLaserPointer: true,
            userId: data.userId
        });

        canvas.add(remotePointer);

        setTimeout(() => {
            if (remotePointer && remotePointer.canvas) {
                canvas.remove(remotePointer);
                canvas.renderAll();
            }
        }, 100);

        canvas.renderAll();
    };

    useEffect(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;
    
        canvas.getObjects().forEach(obj => {
            applyPermissions(obj);
        });
        canvas.renderAll();
    }, [isActionBlocked]);
    
    useEffect(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        const ensureColorString = (colorValue) => {
            if (!colorValue || typeof colorValue !== 'string') {
                return '#000000';
            }
            return colorValue;
        };

        const safeColor = ensureColorString(color);

        if (isActionBlocked) {
            canvas.isDrawingMode = false;
            canvas.selection = false;
            canvas.defaultCursor = 'not-allowed';
            canvas.forEachObject(obj => {
                obj.selectable = false;
                obj.evented = false;
            });
            canvas.renderAll();
            return;
        }

        const throttle = (func, delay) => {
            let lastCall = 0;
            return function (...args) {
                const now = new Date().getTime();
                if (now - lastCall < delay) {
                    return;
                }
                lastCall = now;
                return func(...args);
            };
        };

        const setupShapeDrawing = (shapeType) => {
            canvas.isDrawingMode = false;
            canvas.selection = false;

            let isDrawing = false;
            let startPoint = { x: 0, y: 0 };
            let shape = null;

            canvas.on('mouse:down', (e) => {
                if (e.target || isActionBlocked) return;

                isDrawing = true;
                const pointer = canvas.getPointer(e.e);
                startPoint = { x: pointer.x, y: pointer.y };

                switch (shapeType) {
                    case 'rectangle':
                        shape = new fabric.Rect({
                            left: startPoint.x,
                            top: startPoint.y,
                            width: 0,
                            height: 0,
                            fill: 'transparent',
                            stroke: safeColor,
                            strokeWidth: brushSize,
                            selectable: false,
                            evented: false,
                            temporary: true
                        });
                        break;
                    case 'circle':
                        shape = new fabric.Circle({
                            left: startPoint.x,
                            top: startPoint.y,
                            radius: 0,
                            fill: 'transparent',
                            stroke: safeColor,
                            strokeWidth: brushSize,
                            selectable: false,
                            evented: false,
                            temporary: true
                        });
                        break;
                    case 'line':
                        shape = new fabric.Line([startPoint.x, startPoint.y, startPoint.x, startPoint.y], {
                            stroke: safeColor,
                            strokeWidth: brushSize,
                            selectable: false,
                            evented: false,
                            temporary: true
                        });
                        break;
                    case 'arrow':
                        shape = new fabric.Line([startPoint.x, startPoint.y, startPoint.x, startPoint.y], {
                            stroke: safeColor,
                            strokeWidth: brushSize,
                            selectable: false,
                            evented: false,
                            temporary: true
                        });
                        break;
                }

                if (shape) {
                    canvas.add(shape);
                    canvas.renderAll();
                }
            });

            canvas.on('mouse:move', (e) => {
                if (!isDrawing || !shape) return;

                const pointer = canvas.getPointer(e.e);

                switch (shapeType) {
                    case 'rectangle':
                        const width = Math.abs(pointer.x - startPoint.x);
                        const height = Math.abs(pointer.y - startPoint.y);

                        shape.set({
                            left: Math.min(startPoint.x, pointer.x),
                            top: Math.min(startPoint.y, pointer.y),
                            width: width,
                            height: height
                        });
                        break;
                    case 'circle':
                        const dx = pointer.x - startPoint.x;
                        const dy = pointer.y - startPoint.y;
                        const radius = Math.sqrt(dx * dx + dy * dy) / 2;

                        shape.set({
                            left: startPoint.x - radius,
                            top: startPoint.y - radius,
                            radius: radius
                        });
                        break;
                    case 'line':
                    case 'arrow':
                        shape.set({
                            x2: pointer.x,
                            y2: pointer.y
                        });
                        break;
                }

                canvas.renderAll();
            });

            canvas.on('mouse:up', () => {
                if (!isDrawing || !shape) return;

                isDrawing = false;

                shape.temporary = false;

                if (shapeType === 'arrow') {
                    canvas.remove(shape);

                    const dx = shape.x2 - shape.x1;
                    const dy = shape.y2 - shape.y1;
                    const angle = Math.atan2(dy, dx);

                    const headLength = brushSize * 3;
                    const headAngle = Math.PI / 6;

                    const x1 = shape.x2 - headLength * Math.cos(angle - headAngle);
                    const y1 = shape.y2 - headLength * Math.sin(angle - headAngle);
                    const x2 = shape.x2 - headLength * Math.cos(angle + headAngle);
                    const y2 = shape.y2 - headLength * Math.sin(angle + headAngle);

                    const path = [
                        'M', shape.x1, shape.y1,
                        'L', shape.x2, shape.y2,
                        'L', x1, y1,
                        'M', shape.x2, shape.y2,
                        'L', x2, y2
                    ];

                    const arrow = new fabric.Path(path.join(' '), {
                        stroke: safeColor,
                        strokeWidth: brushSize,
                        fill: '',
                        id: `obj_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        ownerId: userId
                    });

                    canvas.add(arrow);

                    if (isConnected) {
                        const objectJSON = arrow.toJSON(['id', 'ownerId']);
                        emit(EVENTS.DRAW_ACTION, createDrawAction(
                            DRAW_ACTIONS.ADD_OBJECT,
                            { json: objectJSON },
                            userId,
                            roomId
                        ));
                    }
                } else {
                    shape.set({
                        selectable: true,
                        evented: true,
                        id: `obj_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        ownerId: userId
                    });

                    if (isConnected) {
                        const objectJSON = shape.toJSON(['id', 'ownerId']);
                        emit(EVENTS.DRAW_ACTION, createDrawAction(
                            DRAW_ACTIONS.ADD_OBJECT,
                            { json: objectJSON },
                            userId,
                            roomId
                        ));
                    }
                }

                canvas.renderAll();
                shape = null;
            });
        };

        const setupTextTool = () => {
            canvas.isDrawingMode = false;
            canvas.selection = true;

            canvas.on('mouse:down', (e) => {
                if (e.target || isActionBlocked) return;

                const pointer = canvas.getPointer(e.e);
                const text = new fabric.IText('Text', {
                    left: pointer.x,
                    top: pointer.y,
                    fontFamily: 'Arial',
                    fontSize: brushSize * 5,
                    fill: color,
                    id: `obj_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    ownerId: userId,
                    selectable: true,
                    evented: true,
                    editable: true
                });

                canvas.add(text);
                canvas.setActiveObject(text);
                text.enterEditing();

                if (isConnected) {
                    const objectJSON = text.toJSON(['id', 'ownerId']);
                    emit(EVENTS.DRAW_ACTION, createDrawAction(
                        DRAW_ACTIONS.ADD_OBJECT,
                        { json: objectJSON },
                        userId,
                        roomId
                    ));
                }

                canvas.renderAll();
            });

            canvas.on('text:changed', (e) => {
                if (isRemoteAction.current || !isConnected) return;

                const text = e.target;
                if (!text || !text.id) return;

                const objectJSON = {
                    ...text.toJSON(['id', 'ownerId']),
                    text: text.text,
                    left: text.left,
                    top: text.top,
                    scaleX: text.scaleX,
                    scaleY: text.scaleY,
                    angle: text.angle || 0,
                    fontSize: text.fontSize,
                    fontFamily: text.fontFamily,
                    fill: text.fill
                };

                emit(EVENTS.DRAW_ACTION, createDrawAction(
                    DRAW_ACTIONS.MODIFY_OBJECT,
                    { objectId: text.id, json: objectJSON },
                    userId,
                    roomId
                ));
            });

            canvas.on('object:modified', (e) => {
                if (isRemoteAction.current || !isConnected) return;

                const object = e.target;
                if (!object || object.temporary || object.excludeFromExport) return;
                if (object.type !== 'i-text') return;

                const objectJSON = {
                    ...object.toJSON(['id', 'ownerId']),
                    text: object.text,
                    left: object.left,
                    top: object.top,
                    scaleX: object.scaleX,
                    scaleY: object.scaleY,
                    angle: object.angle || 0,
                    fontSize: object.fontSize,
                    fontFamily: object.fontFamily,
                    fill: object.fill
                };

                emit(EVENTS.DRAW_ACTION, createDrawAction(
                    DRAW_ACTIONS.MODIFY_OBJECT,
                    { objectId: object.id, json: objectJSON },
                    userId,
                    roomId
                ));
            });
        };

        const setupEquationTool = () => {
            canvas.isDrawingMode = false;
            canvas.selection = false;

            canvas.on('mouse:down', (e) => {
                if (e.target || isActionBlocked) return;

                const pointer = canvas.getPointer(e.e);
                setEquationPosition({ x: pointer.x, y: pointer.y });
                setEquationEditorOpen(true);
            });
        };

        const setupLaserPointer = () => {
            try {
                canvas.isDrawingMode = false;
                canvas.selection = false;
                canvas.defaultCursor = 'none';

                let laserPoint = null;
                let lastPosition = { x: 0, y: 0 };

                const throttledEmit = throttle((x, y) => {
                        if (isActionBlocked || !isConnected) return;

                        const dx = x - lastPosition.x;
                        const dy = y - lastPosition.y;
                        const distanceSquared = dx * dx + dy * dy;

                        if (distanceSquared > 25) {
                            lastPosition = { x, y };

                            emit(EVENTS.CURSOR_POSITION, {
                                roomId,
                                userId,
                            position: {
                                x,
                                y,
                                color: safeColor,
                                timestamp: Date.now()
                            }
                        });
                    }
                }, 16);

                canvas.on('mouse:move', (e) => {
                    try {
                        if (isActionBlocked) return;

                        const pointer = canvas.getPointer(e.e);

                        if (laserPoint) {
                            canvas.remove(laserPoint);
                            laserPoint = null;
                        }

                        const existingLasers = canvas.getObjects().filter(obj => 
                            obj.temporary === true && 
                            obj.isLaserPointer === true && 
                            obj.ownerId === userId
                        );
                        
                        if (existingLasers.length > 0) {
                            existingLasers.forEach(pointer => canvas.remove(pointer));
                        }

                        laserPoint = new fabric.Circle({
                            left: pointer.x - 5,
                            top: pointer.y - 5,
                            radius: 5,
                            fill: safeColor,
                            opacity: 0.7,
                            selectable: false,
                            evented: false,
                            originX: 'center',
                            originY: 'center',
                            temporary: true,
                            isLaserPointer: true,
                            ownerId: userId
                        });

                        canvas.add(laserPoint);
                        throttledEmit(pointer.x, pointer.y);

                        if (laserPointerTimeout.current) {
                            clearTimeout(laserPointerTimeout.current);
                        }

                        laserPointerTimeout.current = setTimeout(() => {
                            if (laserPoint && laserPoint.canvas) {
                                canvas.remove(laserPoint);
                                canvas.renderAll();
                                laserPoint = null;
                            }
                        }, 50);

                        canvas.renderAll();
                    } catch (error) {
                        console.error('Error in laser pointer mouse:move:', error);
                    }
                });

                const handleRemoteCursor = (data) => {
                    if (data.userId === userId) return;

                    const canvas = fabricCanvasRef.current;
                    if (!canvas) return;

                    const existingPointers = canvas.getObjects().filter(obj =>
                        obj.temporary === true &&
                        obj.userId === data.userId &&
                        obj.isLaserPointer === true
                    );

                    existingPointers.forEach(pointer => canvas.remove(pointer));

                    const { x, y, color } = data.position;
                    const remotePointer = new fabric.Circle({
                        left: x - 5,
                        top: y - 5,
                        radius: 5,
                        fill: color || '#ff0000',
                        opacity: 0.7,
                        selectable: false,
                        evented: false,
                        originX: 'center',
                        originY: 'center',
                        temporary: true,
                        isLaserPointer: true,
                        userId: data.userId
                    });

                    canvas.add(remotePointer);

                    setTimeout(() => {
                        if (remotePointer && remotePointer.canvas) {
                            canvas.remove(remotePointer);
                            canvas.renderAll();
                        }
                    }, 100);

                    canvas.renderAll();
                };

                if (isConnected) {
                    on(EVENTS.CURSOR_POSITION, handleRemoteCursor);
                }

                const canvasContainer = document.querySelector('.canvas-container');
                if (canvasContainer) {
                    canvasContainer.addEventListener('mouseleave', () => {
                        try {
                            if (laserPoint) {
                                canvas.remove(laserPoint);
                                canvas.renderAll();
                                laserPoint = null;
                            }
                            
                            const existingLasers = canvas.getObjects().filter(obj => 
                                obj.temporary === true && 
                                obj.isLaserPointer === true && 
                                obj.ownerId === userId
                            );
                            
                            if (existingLasers.length > 0) {
                                existingLasers.forEach(pointer => canvas.remove(pointer));
                                canvas.renderAll();
                            }
                        } catch (error) {
                            console.error('Error in laser pointer mouseleave:', error);
                        }
                    });
                }

                return () => {
                    if (isConnected) {
                        off(EVENTS.CURSOR_POSITION);
                    }
                    if (canvasContainer) {
                        canvasContainer.removeEventListener('mouseleave', () => { });
                    }
                    if (laserPoint && laserPoint.canvas) {
                        canvas.remove(laserPoint);
                        canvas.renderAll();
                    }
                };
            } catch (error) {
                console.error('Error setting up laser pointer:', error);
                canvas.defaultCursor = 'default';
            }
        };

        const setupCanvasEventHandlers = () => {
            const canvas = fabricCanvasRef.current;
            if (!canvas) return;

            canvas.on('mouse:down', (e) => {
                if (canvas.isDrawingMode && !isRemoteAction.current) {
                    const pointer = canvas.getPointer(e.e);
                    currentPath.current = {
                        startPoint: pointer,
                        points: [pointer],
                        timestamp: Date.now()
                    };
                    pathPoints.current = [pointer];
                }
            });

            canvas.on('mouse:move', (e) => {
                if (canvas.isDrawingMode && currentPath.current && !isRemoteAction.current) {
                    const pointer = canvas.getPointer(e.e);
                    pathPoints.current.push(pointer);
                    currentPath.current.points.push(pointer);
                }
            });

            canvas.on('mouse:up', () => {
                if (canvas.isDrawingMode && currentPath.current && !isRemoteAction.current) {
                    const pathData = {
                        ...currentPath.current,
                        endPoint: pathPoints.current[pathPoints.current.length - 1]
                    };
                    currentPath.current = null;
                    pathPoints.current = [];
                }
            });

            canvas.on('path:created', (e) => {
                if (isRemoteAction.current || !isConnected) return;

                // Save state before new path is added
                if (!isUndoRedoAction.current) {
                    saveCurrentStateToHistory();
                }

                const path = e.path;
                if (!path) return;

                // Skip if this path was already processed
                if (path._skipObjectAdded) return;

                const timestamp = Date.now();
                const pathId = `path_${userId}_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;
                
                // Set _skipObjectAdded flag to prevent duplicate processing
                path._skipObjectAdded = true;
                
                path.set({
                    id: pathId,
                    ownerId: userId,
                    selectable: true,
                    evented: true
                });

                // Add to processedObjects immediately
                processedObjects.current.add(pathId);

                const objectJSON = {
                    ...path.toJSON(['id', 'ownerId']),
                    type: 'path',
                    path: path.path,
                    left: path.left,
                    top: path.top,
                    scaleX: path.scaleX,
                    scaleY: path.scaleY,
                    angle: path.angle || 0,
                    stroke: path.stroke,
                    strokeWidth: path.strokeWidth
                };

                // Emit only once
                emit(EVENTS.DRAW_ACTION, createDrawAction(
                    DRAW_ACTIONS.ADD_OBJECT,
                    { json: objectJSON },
                    userId,
                    roomId
                ));
            });

            canvas.on('object:added', (e) => {
                if (isRemoteAction.current || !isConnected || isUndoRedoAction.current) return;

                const object = e.target;
                if (!object || 
                    object.temporary === true || 
                    object.excludeFromExport === true) return;

                // Skip if this is a path that was just created (prevent double emission)
                if (object._skipObjectAdded) {
                    delete object._skipObjectAdded;
                    return;
                }

                // Skip if this object was already processed
                if (object.id && processedObjects.current.has(object.id)) return;

                // Skip if this is a path object (we handle paths in path:created)
                if (object.type === 'path') return;

                // Generate new ID if not exists
                if (!object.id) {
                    object.id = `obj_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    object.ownerId = userId;
                }

                processedObjects.current.add(object.id);

                // Save current state for objects that aren't paths
                if (!isUndoRedoAction.current) {
                    saveCurrentStateToHistory();
                }

                const action = {
                    type: 'add',
                    objectId: object.id,
                    timestamp: Date.now(),
                    object: object.toJSON(['id', 'ownerId', 'type', 'src'])
                };

                actionStack.current.push(action);
                saveStateToStorage();
            });

            canvas.on('object:modified', (e) => {
                if (isRemoteAction.current || !isConnected || isUndoRedoAction.current) return;

                // Save current state when objects are modified
                if (!isUndoRedoAction.current) {
                    saveCurrentStateToHistory();
                }

                const object = e.target;
                if (!object ||
                    object.temporary === true ||
                    object.excludeFromExport === true) return;

                if (!object.id) return;

                const objectJSON = {
                    ...object.toObject(['id', 'ownerId']),
                    type: object.type,
                    path: object.path,
                    left: object.left,
                    top: object.top,
                    scaleX: object.scaleX,
                    scaleY: object.scaleY,
                    angle: object.angle || 0
                };

                    emit(EVENTS.DRAW_ACTION, createDrawAction(
                        DRAW_ACTIONS.MODIFY_OBJECT,
                        { 
                            objectId: object.id, 
                        json: objectJSON
                        },
                        userId,
                        roomId
                    ));

                const action = {
                    type: 'modify',
                    objectId: object.id,
                    timestamp: Date.now(),
                    object: object.toJSON(['id', 'ownerId', 'type', 'src']),
                    originalState: e.originalState || object.toJSON(['id', 'ownerId', 'type', 'src'])
                };

                actionStack.current.push(action);
                saveStateToStorage();
            });

            canvas.on('object:removed', (e) => {
                if (isRemoteAction.current || !isConnected || isUndoRedoAction.current) return;

                // Save current state when objects are removed
                if (!isUndoRedoAction.current) {
                    saveCurrentStateToHistory();
                }

                const object = e.target;
                if (!object || object.temporary === true || object.excludeFromExport === true) return;
                if (userRole === 'student' && object.ownerId !== userId) return;

                const action = {
                    type: 'remove',
                    objectId: object.id,
                    timestamp: Date.now(),
                    object: object.toJSON(['id', 'ownerId', 'type', 'src'])
                };

                actionStack.current.push(action);
                saveStateToStorage();

                if (object.id) {
                    processedObjects.current.delete(object.id);

                    if (isConnected) {
                        emit(EVENTS.DRAW_ACTION, createDrawAction(
                            DRAW_ACTIONS.REMOVE_OBJECT,
                            {
                                objectId: object.id,
                                actionId: action.objectId
                            },
                            userId,
                            roomId
                        ));
                    }
                }
            });
        };

        const configureTool = () => {
            cleanupDrawingListeners();
            const canvas = fabricCanvasRef.current;
            if (!canvas) return;

            canvas.perPixelTargetFind = false;
            canvas.targetFindTolerance = 0;
            canvas.skipTargetFind = true;

            canvas.selection = false;
            canvas.isDrawingMode = false;

            switch (tool) {
                case 'select':
                    canvas.selection = true;
                    canvas.perPixelTargetFind = true;
                    canvas.targetFindTolerance = 4;
                    canvas.skipTargetFind = false;
                    canvas.forEachObject((obj) => {
                        obj.selectable = !isActionBlocked && (userRole === 'tutor' || obj.ownerId === userId);
                    });
                    break;
                case 'pen':
                    fabricHelpers.createPenBrush(canvas, safeColor, brushSize);
                    canvas.isDrawingMode = true;
                    break;
                case 'eraser':
                    setupEraserTool();
                    break;
                case 'rectangle':
                    setupShapeDrawing('rectangle');
                    break;
                case 'circle':
                    setupShapeDrawing('circle');
                    break;
                case 'line':
                    setupShapeDrawing('line');
                    break;
                case 'arrow':
                    setupShapeDrawing('arrow');
                    break;
                case 'text':
                    setupTextTool();
                    break;
                case 'equation':
                    setupEquationTool();
                    break;
                case 'laser':
                    setupLaserPointer();
                    break;
                case 'image':
                    break;
                default:
                    break;
            }
            canvas.renderAll();
        };

        setupCanvasEventHandlers();
        configureTool();

        return () => {
            cleanupDrawingListeners();
            canvas.off('object:added');
            canvas.off('object:modified');
            canvas.off('object:removed');
        };
    }, [tool, color, brushSize, isActionBlocked, isConnected, emit, userId, userRole, roomId, cleanupDrawingListeners, setupEraserTool]);

    useEffect(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas || tool !== 'eraser' || !canvas.eraserTool) return;
        cleanupDrawingListeners();
        setupEraserTool();

    }, [brushSize, tool, cleanupDrawingListeners, setupEraserTool]);

    const handleImageUpload = async (file) => {
        if (!file || !fabricCanvasRef.current) return;

        const canvas = fabricCanvasRef.current;
        const reader = new FileReader();

        reader.onerror = (error) => {
            alert('Failed to read the file. Please try again.');
        };

        const baseId = `${file.type.includes('pdf') ? 'pdf' : 'img'}_${userId}_${Date.now()}`;

        if (file.type === 'application/pdf') {
            reader.onload = async (e) => {
                try {
                    if (!window.pdfjsLib) {
                        window.pdfjsLib = await import('pdfjs-dist');
                        window.pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${window.pdfjsLib.version}/pdf.worker.min.js`;
                    }

                    const pdfData = new Uint8Array(e.target.result);
                    const pdf = await window.pdfjsLib.getDocument({ data: pdfData }).promise;
                    const totalPages = pdf.numPages;

                    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
                        const page = await pdf.getPage(pageNum);
                        const viewport = page.getViewport({ scale: 1.5 });

                        const tempCanvas = document.createElement('canvas');
                        const context = tempCanvas.getContext('2d');
                        tempCanvas.height = viewport.height;
                        tempCanvas.width = viewport.width;

                        await page.render({
                            canvasContext: context,
                            viewport: viewport
                        }).promise;

                        const imgData = tempCanvas.toDataURL('image/jpeg', 0.8);
                        const objectId = `${baseId}_page${pageNum}`;

                        // Remove any existing image with the same ID
                        const existingPage = canvas.getObjects().find(obj => obj.id === objectId);
                        if (existingPage) {
                            canvas.remove(existingPage);
                            processedObjects.current.delete(objectId);
                        }

                        await new Promise((resolve) => {
                            fabric.Image.fromURL(imgData, (fabricImg) => {
                                if (!fabricImg) {
                                    return;
                                }

                                const margin = 20;
                                const xOffset = (pageNum - 1) * margin;
                                const yOffset = (pageNum - 1) * margin;

                                const maxWidth = canvas.width * 0.8;
                                const maxHeight = canvas.height * 0.8;
                                if (fabricImg.width > maxWidth || fabricImg.height > maxHeight) {
                                    const scale = Math.min(maxWidth / fabricImg.width, maxHeight / fabricImg.height);
                                    fabricImg.scale(scale);
                                }

                                fabricImg.set({
                                    left: xOffset + margin,
                                    top: yOffset + margin,
                                    id: objectId,
                                    ownerId: userId,
                                    type: 'pdf-page',
                                    pageNumber: pageNum,
                                    totalPages: totalPages,
                                    selectable: true,
                                    evented: true,
                                    crossOrigin: 'anonymous'
                                });

                                canvas.add(fabricImg);
                                canvas.setActiveObject(fabricImg);
                                canvas.renderAll();

                                processedObjects.current.add(objectId);

                                if (isConnected) {
                                    const objectToSync = {
                                        ...fabricImg.toObject(['id', 'ownerId']),
                                        type: 'pdf-page',
                                        pageNumber: pageNum,
                                        totalPages: totalPages,
                                        src: imgData,
                                        left: fabricImg.left,
                                        top: fabricImg.top,
                                        scaleX: fabricImg.scaleX,
                                        scaleY: fabricImg.scaleY,
                                        angle: fabricImg.angle || 0
                                    };

                                    emit(EVENTS.DRAW_ACTION, createDrawAction(
                                        DRAW_ACTIONS.ADD_OBJECT,
                                        { json: objectToSync },
                                        userId,
                                        roomId
                                    ));
                                }

                                resolve();
                            }, { crossOrigin: 'anonymous' });
                        });

                        tempCanvas.remove();
                    }
                } catch (error) {
                    alert('Failed to process the PDF. Please try again.');
                }
            };

            reader.readAsArrayBuffer(file);
        } else {
            reader.onload = (e) => {
                const imgData = e.target.result;
                const objectId = baseId;

                // Remove any existing image with the same ID
                const existingImg = canvas.getObjects().find(obj => obj.id === objectId);
                if (existingImg) {
                    canvas.remove(existingImg);
                    processedObjects.current.delete(objectId);
                }

                fabric.Image.fromURL(imgData, (fabricImg) => {
                    if (!fabricImg) {
                        return;
                    }

                    const viewportCenter = {
                        x: canvas.width / 2,
                        y: canvas.height / 2
                    };

                    const maxWidth = canvas.width * 0.8;
                    const maxHeight = canvas.height * 0.8;
                    if (fabricImg.width > maxWidth || fabricImg.height > maxHeight) {
                        const scale = Math.min(maxWidth / fabricImg.width, maxHeight / fabricImg.height);
                        fabricImg.scale(scale);
                    }

                    fabricImg.set({
                        left: viewportCenter.x - (fabricImg.width * fabricImg.scaleX) / 2,
                        top: viewportCenter.y - (fabricImg.height * fabricImg.scaleY) / 2,
                        id: objectId,
                        ownerId: userId,
                        type: 'image',
                        selectable: true,
                        evented: true,
                        crossOrigin: 'anonymous'
                    });

                    canvas.add(fabricImg);
                    canvas.setActiveObject(fabricImg);
                    canvas.renderAll();

                    processedObjects.current.add(objectId);

                    if (isConnected) {
                        const objectToSync = {
                            ...fabricImg.toObject(['id', 'ownerId']),
                            type: 'image',
                            src: imgData,
                            left: fabricImg.left,
                            top: fabricImg.top,
                            scaleX: fabricImg.scaleX,
                            scaleY: fabricImg.scaleY,
                            angle: fabricImg.angle || 0
                        };

                        emit(EVENTS.DRAW_ACTION, createDrawAction(
                            DRAW_ACTIONS.ADD_OBJECT,
                            { json: objectToSync },
                            userId,
                            roomId
                        ));
                    }
                }, { crossOrigin: 'anonymous' });
            };

            reader.readAsDataURL(file);
        }
    };

    const saveCanvasState = () => {
        const canvas = fabricCanvasRef.current;
        if (!canvas || !isConnected) return;

        const state = {
            roomId,
            state: canvas.toJSON(['id', 'ownerId', 'type']),
            actionHistory: actionStack.current,
            timestamp: Date.now()
        };

        emit(EVENTS.CANVAS_STATE, state);
    };

    const handleUserJoin = (userId) => {
        if (!fabricCanvasRef.current || !isConnected || userRole !== 'tutor') return;

        saveCanvasState();
    };

    const clearCanvas = () => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        isRemoteAction.current = true;
        canvas.clear();
        processedObjects.current.clear();
        isRemoteAction.current = false;

        if (isConnected) {
            emit(EVENTS.DRAW_ACTION, createDrawAction(
                DRAW_ACTIONS.CLEAR,
                {},
                userId,
                roomId
            ));
        }
    };

    const exportCanvasAsImage = (format = 'png') => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return null;

        return fabricHelpers.exportCanvasToImage(canvas, format);
    };

    const exportCanvasAsSVG = () => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return null;

        return fabricHelpers.exportCanvasToSVG(canvas);
    };

    const saveCurrentStateToHistory = () => {
        const canvas = fabricCanvasRef.current;
        if (!canvas || isUndoRedoAction.current) return;

        // Create a simplified state snapshot with just the objects
        // For students, only save their own objects in history
        const objects = canvas.getObjects()
            .filter(obj => !obj.temporary && !obj.excludeFromExport && 
                   (userRole === 'tutor' ? obj.ownerId === userId : obj.ownerId === userId));
        
        if (objects.length === 0) return; // Don't save empty states
        
        const stateSnapshot = {
            objects: objects.map(obj => obj.toJSON(['id', 'ownerId', 'type', 'src', 'path', 'equation', 'color']))
        };
        
        // Don't push duplicate states
        const lastState = historyStack.current.length > 0 ? historyStack.current[historyStack.current.length - 1] : null;
        if (lastState && JSON.stringify(lastState.objects) === JSON.stringify(stateSnapshot.objects)) {
            return;
        }
        
        historyStack.current.push(stateSnapshot);

        if (historyStack.current.length > maxHistoryLength) {
            historyStack.current.shift();
        }

        redoStack.current = [];
    };

    // First time app loads, save initial state
    useEffect(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;
        
        // Wait for canvas to be fully loaded
        setTimeout(() => {
            if (historyStack.current.length === 0) {
                saveCurrentStateToHistory();
            }
        }, 500);
    }, [userId]);
    
    const undoAction = () => {
        const canvas = fabricCanvasRef.current;
        if (!canvas || historyStack.current.length === 0) return;

        isUndoRedoAction.current = true;
        try {
            // Save current state for redo
            const currentObjects = canvas.getObjects()
                .filter(obj => !obj.temporary && !obj.excludeFromExport && 
                       (userRole === 'tutor' ? obj.ownerId === userId : obj.ownerId === userId))
                .map(obj => obj.toJSON(['id', 'ownerId', 'type', 'src', 'path', 'equation', 'color']));
            
            if (currentObjects.length > 0) {
                redoStack.current.push({ objects: currentObjects });
            }

            // Get previous state
            const previousState = historyStack.current.pop();

            // Remove only the current user's objects (student or tutor)
            canvas.getObjects()
                .filter(obj => !obj.temporary && !obj.excludeFromExport && obj.ownerId === userId)
                .forEach(obj => {
                    processedObjects.current.delete(obj.id);
                    canvas.remove(obj);
                });
            
            // Restore only the current user's objects from the previous state
            if (previousState && previousState.objects && previousState.objects.length > 0) {
                const userObjects = previousState.objects.filter(obj => obj.ownerId === userId);
                
                if (userObjects.length > 0) {
                    fabric.util.enlivenObjects(userObjects, (objects) => {
                        objects.forEach(obj => {
                            if (obj.id) {
                                processedObjects.current.add(obj.id);
                            }
                            obj.set({
                                selectable: !isActionBlocked,
                                evented: !isActionBlocked
                            });
                            canvas.add(obj);
                        });
                        
                        canvas.requestRenderAll();
                    });
                } else {
                    canvas.requestRenderAll();
                }
            } else {
                canvas.requestRenderAll();
            }

            if (isConnected) {
                emit(EVENTS.DRAW_ACTION, createDrawAction(
                    DRAW_ACTIONS.UNDO,
                    { 
                        state: previousState,
                        userRole: userRole 
                    },
                    userId,
                    roomId
                ));
            }
        } catch (error) {
            console.error('Error in undoAction:', error);
        } finally {
            isUndoRedoAction.current = false;
        }
    };

    const redoAction = () => {
        const canvas = fabricCanvasRef.current;
        if (!canvas || redoStack.current.length === 0) return;

        isUndoRedoAction.current = true;
        try {
            // Save current state for undo
            const currentObjects = canvas.getObjects()
                .filter(obj => !obj.temporary && !obj.excludeFromExport && 
                       (userRole === 'tutor' ? obj.ownerId === userId : obj.ownerId === userId))
                .map(obj => obj.toJSON(['id', 'ownerId', 'type', 'src', 'path', 'equation', 'color']));
            
            if (currentObjects.length > 0) {
                historyStack.current.push({ objects: currentObjects });
            }

            // Get next state
            const nextState = redoStack.current.pop();

            // Remove only the current user's objects (student or tutor)
            canvas.getObjects()
                .filter(obj => !obj.temporary && !obj.excludeFromExport && obj.ownerId === userId)
                .forEach(obj => {
                    processedObjects.current.delete(obj.id);
                    canvas.remove(obj);
                });
            
            // Restore only the current user's objects from the next state
            if (nextState && nextState.objects && nextState.objects.length > 0) {
                const userObjects = nextState.objects.filter(obj => obj.ownerId === userId);
                
                if (userObjects.length > 0) {
                    fabric.util.enlivenObjects(userObjects, (objects) => {
                        objects.forEach(obj => {
                            if (obj.id) {
                                processedObjects.current.add(obj.id);
                            }
                            obj.set({
                                selectable: !isActionBlocked,
                                evented: !isActionBlocked
                            });
                            canvas.add(obj);
                        });
                        
                        canvas.requestRenderAll();
                    });
                } else {
                    canvas.requestRenderAll();
                }
            } else {
                canvas.requestRenderAll();
            }

            if (isConnected) {
                emit(EVENTS.DRAW_ACTION, createDrawAction(
                    DRAW_ACTIONS.REDO,
                    { 
                        state: nextState,
                        userRole: userRole
                    },
                    userId,
                    roomId
                ));
            }
        } catch (error) {
            console.error('Error in redoAction:', error);
        } finally {
            isUndoRedoAction.current = false;
        }
    };

    const handleSaveEquation = async (latexEquation) => {
        if (!latexEquation.trim()) return;

        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        try {
            const tempElement = document.createElement('div');
            tempElement.style.position = 'absolute';
            tempElement.style.left = '-9999px';
            tempElement.style.backgroundColor = 'transparent';
            tempElement.style.padding = '20px';
            tempElement.style.color = color;
            document.body.appendChild(tempElement);

            katex.render(latexEquation, tempElement, {
                displayMode: true,
                throwOnError: false,
                errorColor: '#f44336',
                output: 'html',
                strict: false,
                trust: true,
                macros: {
                    "\\color": "\\textcolor"
                }
            });

            const imgData = await html2canvas(tempElement, {
                backgroundColor: 'transparent',
                scale: 2,
                logging: false
            }).then(tempCanvas => tempCanvas.toDataURL('image/png'));

                const objectId = `eq_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                fabric.Image.fromURL(imgData, (img) => {
                if (!img) return;

                    img.set({
                        left: equationPosition.x,
                        top: equationPosition.y,
                        id: objectId,
                        ownerId: userId,
                        selectable: true,
                        evented: true,
                        equation: latexEquation,
                        type: 'equation',
                        crossOrigin: 'anonymous',
                        color: color
                    });

                canvas.add(img);
                    processedObjects.current.add(objectId);
                    applyPermissions(img);
                canvas.renderAll();

                    if (isConnected) {
                        const objectJSON = {
                            ...img.toJSON(['id', 'ownerId', 'type', 'equation', 'color']),
                        src: imgData,
                            left: img.left,
                            top: img.top,
                            scaleX: img.scaleX,
                            scaleY: img.scaleY,
                        angle: img.angle || 0,
                        equation: latexEquation, 
                        color: color
                        };

                        emit(EVENTS.DRAW_ACTION, createDrawAction(
                            DRAW_ACTIONS.ADD_OBJECT,
                            { json: objectJSON },
                            userId,
                            roomId
                        ));
                    }
            }, { crossOrigin: 'anonymous' });

                document.body.removeChild(tempElement);
        } catch (error) {
            console.error('Error in handleSaveEquation:', error);
        }

        setEquationEditorOpen(false);
    };

    useEffect(() => {
        const handleKeyboardEvents = (e) => {
            const canvas = fabricCanvasRef.current;
            if (!canvas || isActionBlocked) return;

            // Undo: Ctrl+Z
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                console.log('Undo triggered, history stack length:', historyStack.current.length);
                undoAction();
                return;
            }

            // Redo: Either Ctrl+Shift+Z or Ctrl+Y
            if ((e.ctrlKey || e.metaKey) && 
                ((e.shiftKey && e.key.toLowerCase() === 'z') || (!e.shiftKey && e.key.toLowerCase() === 'y'))) {
                e.preventDefault();
                console.log('Redo triggered, redo stack length:', redoStack.current.length);
                redoAction();
                return;
            }

            if (e.key === 'Delete' || e.key === 'Backspace') {
                const activeObjects = canvas.getActiveObjects();
                if (activeObjects.length > 0) {
                    e.preventDefault();
                    
                    // Save current state before deleting
                    saveCurrentStateToHistory();
                    
                    activeObjects.forEach(obj => {
                        if (userRole === 'tutor' || obj.ownerId === userId) {
                            canvas.remove(obj);
                            actionStack.current.push({
                                type: 'remove',
                                objectId: obj.id,
                                object: obj.toJSON(['id', 'ownerId'])
                            });
                            processedObjects.current.delete(obj.id);
                            if (isConnected) {
                                emit(EVENTS.DRAW_ACTION, createDrawAction(
                                    DRAW_ACTIONS.REMOVE_OBJECT,
                                    { objectId: obj.id },
                                    userId,
                                    roomId
                                ));
                            }
                        }
                    });
                    canvas.discardActiveObject().renderAll();
                }
            }
        };

        window.addEventListener('keydown', handleKeyboardEvents);
        return () => window.removeEventListener('keydown', handleKeyboardEvents);
    }, [isActionBlocked, userRole, userId, isConnected, emit, roomId]);

    const saveStateToStorage = () => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        const state = {
            canvasState: canvas.toJSON(['id', 'ownerId', 'type']),
            actionHistory: actionStack.current,
            timestamp: Date.now()
        };

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (error) {
        }
    };

    const loadStateFromStorage = () => {
        try {
            const savedState = localStorage.getItem(STORAGE_KEY);
            if (!savedState) return null;

            return JSON.parse(savedState);
        } catch (error) {
            return null;
        }
    };

    useEffect(() => {
        if (!isConnected) return;

        const handleCursorPosition = (data) => {
            handleRemoteCursor(data);
        };

        on(EVENTS.CURSOR_POSITION, handleCursorPosition);

        return () => {
            off(EVENTS.CURSOR_POSITION);
        };
    }, [isConnected, on, off]);

    return (
        <div className="canvas-container">
            <canvas ref={canvasRef} />
            {equationEditorOpen && (
                <EquationEditor
                    position={equationPosition}
                    onClose={() => setEquationEditorOpen(false)}
                    onSubmit={handleSaveEquation}
                />
            )}
        </div>
    );
});

export default Canvas;
