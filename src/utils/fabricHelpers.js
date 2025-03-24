import { fabric } from 'fabric';

export const createPenBrush = (canvas, color, size) => {
    canvas.isDrawingMode = true;
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    canvas.freeDrawingBrush.color = color;
    canvas.freeDrawingBrush.width = size;
    return canvas.freeDrawingBrush;
};

export const createPixelBrush = (canvas, color, size) => {
    canvas.isDrawingMode = true;
    
    const PixelBrush = fabric.util.createClass(fabric.PencilBrush, {
        width: size,
        color: color,
        
        _renderStroke: function(ctx) {
            const pixelSize = Math.max(2, Math.round(this.width));
            
            ctx.save();
            
            ctx.globalCompositeOperation = this.globalCompositeOperation;
            
            ctx.strokeStyle = this.color;
            ctx.lineWidth = this.width;
            ctx.lineCap = this.strokeLineCap;
            ctx.lineJoin = this.strokeLineJoin;
            
            if (this._points && this._points.length > 1) {
                ctx.beginPath();
                
                for (let i = 0; i < this._points.length; i++) {
                    const point = this._points[i];
                    const x = Math.floor(point.x / pixelSize) * pixelSize;
                    const y = Math.floor(point.y / pixelSize) * pixelSize;
                    
                    ctx.fillStyle = this.color;
                    ctx.fillRect(x, y, pixelSize, pixelSize);
                }
                
                ctx.stroke();
            }
            
            ctx.restore();
        }
    });
    
    canvas.freeDrawingBrush = new PixelBrush(canvas);
    canvas.freeDrawingBrush.color = color;
    canvas.freeDrawingBrush.width = size;
    
    return canvas.freeDrawingBrush;
};

export const createEraserBrush = (canvas, size) => {
    canvas.isDrawingMode = false;
    canvas.defaultCursor = 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAAXNSR0IArs4c6QAAALJJREFUOE/tlDESgjAQRX8KLeUEeAW9Ah5BuYZH0CtwBT2C3kWvgDfQEgrJbCbDMJlAQ2Fn3G7y8vbv7gcR+1NH/NIGoN6qb5KllDUAEcA0pfQuMhfGmAZAqbV+BF5SyntK6clae/cxCmZFKeVMRCvn3MEYY4kosNb6llLuRLRwzp39DQDW3vtbCCHOA+P/0FrfAoCMMRYA5t77nYiu44DP9O9iZJsAhP8CkxE9G6/XZgCWv+kD38tfFRAkDYoAAAAASUVORK5CYII=), auto';
    
    canvas.off('mouse:down');
    canvas.off('mouse:move');
    canvas.off('mouse:up');
    
    let isErasing = false;
    let eraserRadius = size / 2;
    
    let eraserCircle = null;
    
    const createEraserCircle = (x, y) => {
        if (eraserCircle) {
            eraserCircle.set({
                left: x - eraserRadius,
                top: y - eraserRadius,
            });
        } else {
            eraserCircle = new fabric.Circle({
                left: x - eraserRadius,
                top: y - eraserRadius,
                radius: eraserRadius,
                fill: 'rgba(255,0,0,0.2)',
                stroke: 'rgba(255,0,0,0.5)',
                strokeWidth: 1,
                originX: 'center',
                originY: 'center',
                selectable: false,
                evented: false,
                excludeFromExport: true,
                temporary: true
            });
            canvas.add(eraserCircle);
        }
        canvas.renderAll();
    };
    
    const removeEraserCircle = () => {
        if (eraserCircle) {
            canvas.remove(eraserCircle);
            eraserCircle = null;
            canvas.renderAll();
        }
    };
    
    const isPointInObject = (x, y, obj) => {
        const objBounds = obj.getBoundingRect();
        return (
            x >= objBounds.left &&
            x <= objBounds.left + objBounds.width &&
            y >= objBounds.top &&
            y <= objBounds.top + objBounds.height &&
            obj.containsPoint(new fabric.Point(x, y))
        );
    };
    
    const eraseAtPoint = (x, y) => {
        const objects = canvas.getObjects().filter(obj => 
            !obj.temporary && !obj.excludeFromExport
        );
        
        const toErase = [];
        
        objects.forEach(obj => {
            if (obj instanceof fabric.Path) {
                if (obj.containsPoint(new fabric.Point(x, y)) || 
                    isPointNearPath(x, y, obj, eraserRadius)) {
                    toErase.push(obj);
                }
            }
            else if (obj instanceof fabric.Object) {
                if (isPointInObject(x, y, obj)) {
                    toErase.push(obj);
                }
            }
        });
        
        if (toErase.length > 0) {
            toErase.forEach(obj => {
                canvas.remove(obj);
                canvas.fire('object:removed', { target: obj });
            });
            canvas.renderAll();
            return true;
        }
        
        return false;
    };
    
    const isPointNearPath = (x, y, path, threshold) => {
        if (!path.path) return false;
        
        const pathPoints = path.path;
        
        for (let i = 1; i < pathPoints.length; i++) {
            const point = pathPoints[i];
            
            if (point[0] === 'L' || point[0] === 'M') {
                const x1 = pathPoints[i-1][1];
                const y1 = pathPoints[i-1][2];
                const x2 = point[1];
                const y2 = point[2];
                
                const distance = distanceToLineSegment(x1, y1, x2, y2, x, y);
                
                if (distance < threshold) {
                    return true;
                }
            }
        }
        
        return false;
    };
    
    const distanceToLineSegment = (x1, y1, x2, y2, px, py) => {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        
        if (lenSq !== 0) {
            param = dot / lenSq;
        }
        
        let xx, yy;
        
        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }
        
        const dx = px - xx;
        const dy = py - yy;
        
        return Math.sqrt(dx * dx + dy * dy);
    };
    
    canvas.on('mouse:down', (e) => {
        isErasing = true;
        const pointer = canvas.getPointer(e.e);
        eraseAtPoint(pointer.x, pointer.y);
    });
    
    canvas.on('mouse:move', (e) => {
        const pointer = canvas.getPointer(e.e);
        
        createEraserCircle(pointer.x, pointer.y);
        
        if (isErasing) {
            eraseAtPoint(pointer.x, pointer.y);
        }
    });
    
    canvas.on('mouse:up', () => {
        isErasing = false;
    });
    
    const canvasContainer = document.querySelector('.canvas-container');
    if (canvasContainer) {
        canvasContainer.addEventListener('mouseleave', removeEraserCircle);
    }
    
    return {
        activate: () => {
            canvas.isDrawingMode = false;
            canvas.defaultCursor = 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAAXNSR0IArs4c6QAAALJJREFUOE/tlDESgjAQRX8KLeUEeAW9Ah5BuYZH0CtwBT2C3kWvgDfQEgrJbCbDMJlAQ2Fn3G7y8vbv7gcR+1NH/NIGoN6qb5KllDUAEcA0pfQuMhfGmAZAqbV+BF5SyntK6clae/cxCmZFKeVMRCvn3MEYY4kosNb6llLuRLRwzp39DQDW3vtbCCHOA+P/0FrfAoCMMRYA5t77nYiu44DP9O9iZJsAhP8CkxE9G6/XZgCWv+kD38tfFRAkDYoAAAAASUVORK5CYII=), auto';
        },
        deactivate: () => {
            removeEraserCircle();
            canvas.defaultCursor = 'default';
            canvas.off('mouse:down');
            canvas.off('mouse:move');
            canvas.off('mouse:up');
            if (canvasContainer) {
                canvasContainer.removeEventListener('mouseleave', removeEraserCircle);
            }
        }
    };
};

export const createImageFromURL = (url, callback) => {
    fabric.Image.fromURL(url, img => {
        img.set({
            left: 100,
            top: 100
        });
        callback(img);
    });
};

export const importSVG = (svgData, callback) => {
    fabric.loadSVGFromString(svgData, (objects, options) => {
        const svgObject = fabric.util.groupSVGElements(objects, options);
        callback(svgObject);
    });
};

export const exportCanvasToImage = (canvas, format = 'png') => {
    return canvas.toDataURL({
        format: format,
        quality: 1
    });
};

export const exportCanvasToSVG = (canvas) => {
    return canvas.toSVG();
};

export const createObjectId = (userId) => {
    return `${userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export const addText = (canvas, options = {}) => {
  const text = new fabric.IText('Text', {
    left: options.left || canvas.width / 2,
    top: options.top || canvas.height / 2,
    fontFamily: options.fontFamily || 'Arial',
    fontSize: options.fontSize || 20,
    fill: options.fill || '#000000',
    editable: true
  });
  
  canvas.add(text);
  canvas.setActiveObject(text);
  text.enterEditing();
  
  return text;
};

export const addRectangle = (canvas, options = {}) => {
  const rect = new fabric.Rect({
    left: options.left || canvas.width / 2 - 50,
    top: options.top || canvas.height / 2 - 50,
    width: options.width || 100,
    height: options.height || 100,
    fill: options.fill || 'transparent',
    stroke: options.stroke || '#000000',
    strokeWidth: options.strokeWidth || 2
  });
  
  canvas.add(rect);
  canvas.setActiveObject(rect);
  
  return rect;
};

export const addCircle = (canvas, options = {}) => {
  const circle = new fabric.Circle({
    left: options.left || canvas.width / 2 - 50,
    top: options.top || canvas.height / 2 - 50,
    radius: options.radius || 50,
    fill: options.fill || 'transparent',
    stroke: options.stroke || '#000000',
    strokeWidth: options.strokeWidth || 2
  });
  
  canvas.add(circle);
  canvas.setActiveObject(circle);
  
  return circle;
};

export const addLine = (canvas, options = {}) => {
  const line = new fabric.Line([
    options.x1 || canvas.width / 2 - 50,
    options.y1 || canvas.height / 2,
    options.x2 || canvas.width / 2 + 50,
    options.y2 || canvas.height / 2
  ], {
    stroke: options.stroke || '#000000',
    strokeWidth: options.strokeWidth || 2
  });
  
  canvas.add(line);
  canvas.setActiveObject(line);
  
  return line;
};

export const addArrow = (canvas, options = {}) => {
  const x1 = options.x1 || canvas.width / 2 - 50;
  const y1 = options.y1 || canvas.height / 2;
  const x2 = options.x2 || canvas.width / 2 + 50;
  const y2 = options.y2 || canvas.height / 2;
  
  const line = new fabric.Line([x1, y1, x2, y2], {
    stroke: options.stroke || '#000000',
    strokeWidth: options.strokeWidth || 2
  });
  
  const angle = Math.atan2(y2 - y1, x2 - x1);
  
  const headSize = options.headSize || 15;
  const triangle = new fabric.Triangle({
    left: x2,
    top: y2,
    pointType: 'arrow_start',
    angle: (angle * 180 / Math.PI) + 90,
    width: headSize,
    height: headSize,
    fill: options.stroke || '#000000'
  });
  
  const arrow = new fabric.Group([line, triangle], {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2)
  });
  
  canvas.add(arrow);
  canvas.setActiveObject(arrow);
  
  return arrow;
};

export const addImage = (canvas, url, options = {}) => {
  fabric.Image.fromURL(url, (img) => {
    const maxWidth = canvas.width * 0.8;
    const maxHeight = canvas.height * 0.8;
    
    if (img.width > maxWidth || img.height > maxHeight) {
      const scale = Math.min(maxWidth / img.width, maxHeight / img.height);
      img.scale(scale);
    }
    
    img.set({
      left: options.left || canvas.width / 2 - (img.width * img.scaleX) / 2,
      top: options.top || canvas.height / 2 - (img.height * img.scaleY) / 2
    });
    
    canvas.add(img);
    canvas.setActiveObject(img);
  });
};

export const addPdfPage = (canvas, pdfData, pageNumber, options = {}) => {
  const rect = new fabric.Rect({
    left: options.left || canvas.width / 2 - 150,
    top: options.top || canvas.height / 2 - 200,
    width: options.width || 300,
    height: options.height || 400,
    fill: '#f0f0f0',
    stroke: '#cccccc',
    strokeWidth: 1
  });
  
  const text = new fabric.Text(`PDF Page ${pageNumber}`, {
    left: rect.left + rect.width / 2,
    top: rect.top + rect.height / 2,
    originX: 'center',
    originY: 'center',
    fill: '#999999'
  });
  
  const group = new fabric.Group([rect, text], {
    left: rect.left,
    top: rect.top
  });
  
  canvas.add(group);
  return group;
};

export const createLaserPointer = (canvas, x, y, color = '#ff0000') => {
  const pointer = new fabric.Circle({
    left: x,
    top: y,
    radius: 5,
    fill: color,
    opacity: 0.7,
    originX: 'center',
    originY: 'center',
    selectable: false,
    evented: false
  });
  
  canvas.add(pointer);
  
  const fadeOut = () => {
    pointer.animate('opacity', 0, {
      duration: 1000,
      onChange: canvas.renderAll.bind(canvas),
      onComplete: () => {
        canvas.remove(pointer);
      }
    });
  };
  
  setTimeout(fadeOut, 1000);
  
  return pointer;
};

export const canvasToJson = (canvas) => {
  return canvas.toJSON(['id', 'selectable']);
};

export const loadCanvasFromJson = (canvas, json) => {
  if (!json) return;
  
  canvas.loadFromJSON(json, canvas.renderAll.bind(canvas));
};

export const clearCanvas = (canvas) => {
  canvas.clear();
  canvas.setBackgroundColor('#ffffff', canvas.renderAll.bind(canvas));
};