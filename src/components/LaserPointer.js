import React, { useEffect, useRef } from 'react';

const LaserPointer = ({ position, color, duration = 1000 }) => {
  const pointerRef = useRef(null);
  
  useEffect(() => {
    const pointer = pointerRef.current;
    
    if (pointer) {
      pointer.style.opacity = '0.7';
      
      const fadeOut = setTimeout(() => {
        pointer.style.opacity = '0';
      }, 100);
      
      const remove = setTimeout(() => {
        pointer.remove();
      }, duration);
      
      return () => {
        clearTimeout(fadeOut);
        clearTimeout(remove);
      };
    }
  }, [position, duration]);
  
  return (
    <div 
      ref={pointerRef}
      className="laser-pointer"
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        width: '10px',
        height: '10px',
        borderRadius: '50%',
        backgroundColor: color || '#ff0000',
        opacity: 0.7,
        transition: 'opacity 0.9s ease-out',
        pointerEvents: 'none',
        zIndex: 1000,
        transform: 'translate(-50%, -50%)'
      }}
    />
  );
};

export default LaserPointer;