import React, { useState, useEffect, useRef } from 'react';
import {
    FaPencilAlt,
    FaEraser,
    FaSquare,
    FaCircle,
    FaSlash,
    FaLongArrowAltRight,
    FaFont,
    FaTh,
    FaMousePointer,
    FaUndo,
    FaRedo,
    FaDownload,
    FaTrash,
    FaSignOutAlt,
    FaDotCircle,
    FaImage,
    FaFileUpload,
    FaSquareRootAlt
} from 'react-icons/fa';
import { useWhiteboard } from '../context/WhiteboardContext';
import { CirclePicker, ChromePicker } from 'react-color';
import Tooltip from './Tooltip';
import '../styles/Toolbar.css';

const Toolbar = ({ onClear, onSave, onUndo, onRedo, onUpload, onLeave, disabled = false }) => {
    const {
        tool,
        setTool,
        color,
        setColor,
        brushSize,
        setBrushSize,
        availableTools,
        userRole,
        darkMode
    } = useWhiteboard();

    const [showColorPicker, setShowColorPicker] = useState(false);
    const [advancedColorPicker, setAdvancedColorPicker] = useState(false);
    const colorPickerRef = useRef(null);
    const toolbarRef = useRef(null);
    const colorButtonRef = useRef(null);
    const fileInputRef = useRef(null);

    const handleClear = () => {
        if (onClear) {
            try {
                onClear();
            } catch (error) {
                console.error("Error clearing canvas:", error);
            }
        }
    };

    useEffect(() => {
        const handleClickOutside = (event) => {
            // Check if the click is inside the color picker container, color button, or any color picker component
            const isColorPickerClick = colorPickerRef.current?.contains(event.target);
            const isColorButtonClick = colorButtonRef.current?.contains(event.target);
            const isToggleButtonClick = event.target.classList.contains('toggle-picker-button');
            const isChromePickerClick = event.target.closest('.chrome-picker');
            const isCirclePickerClick = event.target.closest('.circle-picker');
            const isChromePickerContainerClick = event.target.closest('.chrome-picker-container');

            // Don't close if clicking inside any of these elements
            if (isColorPickerClick || isColorButtonClick || isToggleButtonClick ||
                isChromePickerClick || isCirclePickerClick || isChromePickerContainerClick) {
                return;
            }

            setShowColorPicker(false);
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const getToolIcon = (toolName) => {
        switch (toolName) {
            case 'cursor':
            case 'select':
                return <FaMousePointer />;
            case 'pen':
                return <FaPencilAlt />;
            case 'eraser':
                return <FaEraser />;
            case 'rectangle':
                return <FaSquare />;
            case 'circle':
                return <FaCircle />;
            case 'line':
                return <FaSlash />;
            case 'arrow':
                return <FaLongArrowAltRight />;
            case 'text':
                return <FaFont />;
            case 'equation':
                return <FaSquareRootAlt />;
            case 'laser':
                return <FaDotCircle />;
            case 'image':
                return <FaImage />;
            case 'pixel':
                return <FaTh />;
            default:
                return <FaPencilAlt />;
        }
    };

    const handleToolChange = (newTool) => {
        if (disabled) return;
        setTool(newTool);
    };

    const handleColorChange = (newColor) => {
        if (disabled) return;
        setColor(newColor.hex);
    };

    const handleFileUpload = (e) => {
        if (disabled || !onUpload) return;

        const file = e.target.files[0];
        if (!file) return;

        onUpload(file);
        e.target.value = null;
    };

    const renderSizeControl = () => {

        return (
            <div className="size-control">
                <label>Brush Size: {brushSize}</label>
                <input
                    type="range"
                    min="1"
                    max="50"
                    value={brushSize}
                    onChange={(e) => setBrushSize(parseInt(e.target.value))}
                    disabled={disabled}
                />
            </div>
        );
    };

    const canUseTools = () => {
        if (userRole === 'teacher' || userRole === 'admin') {
            return true;
        }
        return !disabled;
    };

    return (
        <div className="toolbar-container">

            <div className={`toolbar ${darkMode ? 'dark-mode' : ''}`} ref={toolbarRef}>
                <div className="tool-section">
                    <Tooltip content="Select" direction="bottom">
                        <button
                            className={`tool-button ${tool === 'select' ? 'active' : ''}`}
                            onClick={() => handleToolChange('select')}
                            disabled={disabled}
                        >
                            <FaMousePointer />
                        </button>
                    </Tooltip>
                    <Tooltip content="Pen" direction="bottom">
                        <button
                            className={`tool-button ${tool === 'pen' ? 'active' : ''}`}
                            onClick={() => handleToolChange('pen')}
                            disabled={!canUseTools()}
                        >
                            <FaPencilAlt />
                        </button>
                    </Tooltip>
                    <Tooltip content="Color" direction="bottom">
                        <div className="color-picker-container" ref={colorPickerRef}>
                            <button
                                ref={colorButtonRef}
                                className="color-button"
                                onClick={() => setShowColorPicker(!showColorPicker)}
                                disabled={disabled}
                            >
                                <div className="color-preview" style={{ backgroundColor: color }}></div>
                            </button>
                            {showColorPicker && (
                                <div className={`color-picker-dropdown ${darkMode ? 'dark-mode' : ''}`}>
                                    {renderSizeControl()}
                                    {advancedColorPicker ? (
                                        <div
                                            className="chrome-picker-container"
                                            onClick={(e) => e.stopPropagation()}
                                            onMouseDown={(e) => e.stopPropagation()}
                                        >
                                            <ChromePicker
                                                color={color}
                                                onChange={handleColorChange}
                                                disableAlpha={true}
                                                styles={{
                                                    default: {
                                                        picker: {
                                                            position: 'relative',
                                                            zIndex: 1003
                                                        }
                                                    }
                                                }}
                                            />
                                        </div>
                                    ) : (
                                        <div
                                            className="circle-picker-container"
                                            onClick={(e) => e.stopPropagation()}
                                            onMouseDown={(e) => e.stopPropagation()}
                                        >
                                            <CirclePicker
                                                color={color}
                                                onChange={handleColorChange}
                                                colors={[
                                                    '#FF0000', // Red
                                                    '#00FF00', // Green
                                                    '#0000FF', // Blue
                                                    '#FF00FF', // Magenta
                                                    '#00FFFF', // Cyan
                                                    '#FFFF00', // Yellow
                                                    '#000000', // Black
                                                    '#333333', // Dark Gray
                                                    '#666666', // Medium Gray
                                                    '#FFB6C1', // Light Pink
                                                    '#98FB98', // Pale Green
                                                    '#87CEEB', // Sky Blue
                                                    '#FFA500', // Orange
                                                    '#FF4500', // Orange Red
                                                    '#FFD700', // Gold
                                                    '#4169E1', // Royal Blue
                                                    '#9370DB', // Medium Purple
                                                    '#20B2AA'  // Light Sea Green
                                                ]}
                                            />
                                        </div>
                                    )}
                                    <button
                                        className="toggle-picker-button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            setAdvancedColorPicker(!advancedColorPicker);
                                        }}
                                        onMouseDown={(e) => e.stopPropagation()}
                                    >
                                        {advancedColorPicker ? 'Simple' : 'Advanced'} Colors
                                    </button>
                                </div>
                            )}
                        </div>
                    </Tooltip>
                    <Tooltip content="Eraser" direction="bottom">
                        <button
                            className={`tool-button ${tool === 'eraser' ? 'active' : ''}`}
                            onClick={() => handleToolChange('eraser')}
                            disabled={!canUseTools()}
                        >
                            <FaEraser />
                        </button>
                    </Tooltip>
                    <Tooltip content="Rectangle" direction="bottom">
                        <button
                            className={`tool-button ${tool === 'rectangle' ? 'active' : ''}`}
                            onClick={() => handleToolChange('rectangle')}
                            disabled={!canUseTools()}
                        >
                            <FaSquare />
                        </button>
                    </Tooltip>
                    <Tooltip content="Circle" direction="bottom">
                        <button
                            className={`tool-button ${tool === 'circle' ? 'active' : ''}`}
                            onClick={() => handleToolChange('circle')}
                            disabled={!canUseTools()}
                        >
                            <FaCircle />
                        </button>
                    </Tooltip>
                    <Tooltip content="Line" direction="bottom">
                        <button
                            className={`tool-button ${tool === 'line' ? 'active' : ''}`}
                            onClick={() => handleToolChange('line')}
                            disabled={!canUseTools()}
                        >
                            <FaSlash />
                        </button>
                    </Tooltip>
                    <Tooltip content="Arrow" direction="bottom">
                        <button
                            className={`tool-button ${tool === 'arrow' ? 'active' : ''}`}
                            onClick={() => handleToolChange('arrow')}
                            disabled={!canUseTools()}
                        >
                            <FaLongArrowAltRight />
                        </button>
                    </Tooltip>
                    <Tooltip content="Text" direction="bottom">
                        <button
                            className={`tool-button ${tool === 'text' ? 'active' : ''}`}
                            onClick={() => handleToolChange('text')}
                            disabled={!canUseTools()}
                        >
                            <FaFont />
                        </button>
                    </Tooltip>
                    <Tooltip content="Equation" direction="bottom">
                        <button
                            className={`tool-button ${tool === 'equation' ? 'active' : ''}`}
                            onClick={() => handleToolChange('equation')}
                            disabled={!canUseTools()}
                        >
                            <FaSquareRootAlt />
                        </button>
                    </Tooltip>
                    <Tooltip content="Laser Pointer" direction="bottom">
                        <button
                            className={`tool-button ${tool === 'laser' ? 'active' : ''}`}
                            onClick={() => handleToolChange('laser')}
                            disabled={!canUseTools()}
                        >
                            <FaDotCircle />
                        </button>
                    </Tooltip>
                    <Tooltip content="Upload Image" direction="bottom">
                        <button
                            className={`tool-button ${tool === 'image' ? 'active' : ''}`}
                            onClick={() => fileInputRef.current?.click()}
                            disabled={!canUseTools() || !onUpload}
                        >
                            <FaFileUpload />
                        </button>
                    </Tooltip>
                    <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        accept="image/*,.pdf"
                        onChange={handleFileUpload}
                    />

                    <Tooltip content="Undo" direction="bottom">
                        <button
                            className="tool-button"
                            onClick={onUndo}
                            disabled={disabled}
                        >
                            <FaUndo />
                        </button>
                    </Tooltip>
                    <Tooltip content="Redo" direction="bottom">
                        <button
                            className="tool-button"
                            onClick={onRedo}
                            disabled={disabled}
                        >
                            <FaRedo />
                        </button>
                    </Tooltip>
                    <Tooltip content="Clear Canvas" direction="bottom">
                        <button
                            className="tool-button"
                            onClick={handleClear}
                            disabled={disabled}
                        >
                            <FaTrash />
                        </button>
                    </Tooltip>
                    <Tooltip content="Save" direction="bottom">
                        <button
                            className="tool-button"
                            onClick={onSave}
                        >
                            <FaDownload />
                        </button>
                    </Tooltip>
                    <Tooltip content="Leave Room" direction="bottom">
                        <button
                            className="tool-button leave-button"
                            onClick={onLeave}
                        >
                            <FaSignOutAlt />
                        </button>
                    </Tooltip>
                </div>


            </div>
        </div>
    );
};

export default Toolbar;