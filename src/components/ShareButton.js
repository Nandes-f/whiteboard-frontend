import React from 'react';

const ShareButton = ({ roomId }) => {
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
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
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
            const success = await copyToClipboard(url);
            if (success) {
                alert('Room URL copied to clipboard!');
            } else {
                alert(`Please copy this URL manually:\n${url}`);
            }
        } catch (error) {
            alert(`Please copy this URL manually:\n${url}`);
        }
    };

    return (
        <button 
            onClick={shareRoom}
            className="share-button"
        >
            Share Room
        </button>
    );
};

export default ShareButton; 