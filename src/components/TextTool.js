import React, { useEffect } from 'react';
import { fabric } from 'fabric';
import { useWhiteboard } from '../context/WhiteboardContext';

const TextTool = ({ canvas }) => {
  const { color, brushSize } = useWhiteboard();
  
  useEffect(() => {
    if (!canvas) return;
    
    const handleMouseDown = (e) => {
      const pointer = canvas.getPointer(e.e);
      
      const text = new fabric.IText('Text', {
        left: pointer.x,
        top: pointer.y,
        fontFamily: 'Arial',
        fontSize: brushSize * 5, 
        fill: color,
        editable: true
      });
      
      canvas.add(text);
      
      canvas.setActiveObject(text);
      text.enterEditing();
      
      e.e.preventDefault();
    };
    
    canvas.on('mouse:down', handleMouseDown);
    
    return () => {
      canvas.off('mouse:down', handleMouseDown);
    };
  }, [canvas, color, brushSize]);
  
  return null;
};

export default TextTool;