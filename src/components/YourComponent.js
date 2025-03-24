const shareRoom = async (roomId) => {
    const url = `${window.location.origin}/room/${roomId}`;
    
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(url);
            alert('Room link copied to clipboard!');
        } else {
            const textArea = document.createElement('textarea');
            textArea.value = url;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();

            try {
                document.execCommand('copy');
                alert('Room link copied to clipboard!');
            } catch (err) {
                console.error('Failed to copy text:', err);
                alert(`Please copy this link manually: ${url}`);
            } finally {
                textArea.remove();
            }
        }
    } catch (err) {
        console.error('Failed to copy:', err);
        alert(`Please copy this link manually: ${url}`);
    }
}; 