// ==========================================
// 1. FLOATING "ASK AI" BUTTON LOGIC
// ==========================================
function createAskAIButton() {
    if (document.getElementById('vernacular-ask-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'vernacular-ask-btn';
    btn.innerHTML = '✨ Ask AI';
    btn.style.cssText = `
        position: fixed !important;
        bottom: 20px !important;
        right: 20px !important;
        z-index: 2147483646 !important; /* One layer below the snipping tool */
        background-color: #4f46e5 !important;
        color: white !important;
        border: none !important;
        padding: 12px 20px !important;
        border-radius: 24px !important;
        font-weight: bold !important;
        font-size: 16px !important;
        cursor: pointer !important;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1) !important;
        transition: background 0.2s !important;
    `;

    btn.onmouseover = () => btn.style.backgroundColor = '#4338ca';
    btn.onmouseout = () => btn.style.backgroundColor = '#4f46e5';

    // Send a message to the background script to open the panel
    btn.onclick = () => {
        chrome.runtime.sendMessage({ action: "OPEN_SIDE_PANEL" });
    };

    document.body.appendChild(btn);
}

// Inject the button when the page loads
createAskAIButton();


// ==========================================
// 2. SNIPPING TOOL, VISION AI & WEB SCRAPER
// ==========================================
let overlayCanvas, drawCanvas, ctx, startX, startY, isDrawing = false;
let img = new Image();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "START_SNIPPING") {
        initSnippingTool();
    } else if (request.action === "SCRAPE_WEBPAGE") {
        // NEW FEATURE: Web Scraping Logic
        // Grabs all visible text from the webpage and cleans up excess whitespace
        const pageText = document.body.innerText.replace(/\s+/g, ' ').trim();
        // Send the text (capped at a safe limit) and the page title back to React
        sendResponse({ text: pageText.substring(0, 50000), title: document.title });
    }
});

async function initSnippingTool() {
    chrome.runtime.sendMessage({ action: "TAKE_SCREENSHOT" }, (response) => {
        if (response && response.dataUrl) {
            img.src = response.dataUrl;
            img.onload = createOverlay;
        }
    });
}

function createOverlay() {
    const container = document.createElement('div');
    container.id = 'vernacular-snip-container';

    overlayCanvas = document.createElement('canvas');
    overlayCanvas.width = window.innerWidth;
    overlayCanvas.height = window.innerHeight;
    const overlayCtx = overlayCanvas.getContext('2d');
    overlayCtx.drawImage(img, 0, 0, window.innerWidth, window.innerHeight);

    drawCanvas = document.createElement('canvas');
    drawCanvas.width = window.innerWidth;
    drawCanvas.height = window.innerHeight;
    ctx = drawCanvas.getContext('2d');

    fillDarkOverlay();

    container.appendChild(overlayCanvas);
    container.appendChild(drawCanvas);
    document.body.appendChild(container);

    drawCanvas.addEventListener('mousedown', onMouseDown);
    drawCanvas.addEventListener('mousemove', onMouseMove);
    drawCanvas.addEventListener('mouseup', onMouseUp);
}

function fillDarkOverlay() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, drawCanvas.width, drawCanvas.height);
}

function onMouseDown(e) {
    isDrawing = true;
    startX = e.clientX;
    startY = e.clientY;
}

function onMouseMove(e) {
    if (!isDrawing) return;
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    fillDarkOverlay();

    const currentX = e.clientX;
    const currentY = e.clientY;
    const width = currentX - startX;
    const height = currentY - startY;

    ctx.clearRect(startX, startY, width, height);
    ctx.strokeStyle = '#4f46e5';
    ctx.lineWidth = 2;
    ctx.strokeRect(startX, startY, width, height);
}

function onMouseUp(e) {
    isDrawing = false;
    const endX = e.clientX;
    const endY = e.clientY;

    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);
    const x = Math.min(startX, endX);
    const y = Math.min(startY, endY);

    if (width < 10 || height < 10) {
        closeSnippingTool();
        return;
    }

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = width;
    cropCanvas.height = height;
    const cropCtx = cropCanvas.getContext('2d');

    cropCtx.drawImage(overlayCanvas, x, y, width, height, 0, 0, width, height);

    const base64Image = cropCanvas.toDataURL('image/png');

    // Spawn the floating input box instead of the alert
    createFloatingInput(base64Image, x, y, width, height);

    // Lock the drawing canvas so they can't draw another box accidentally
    drawCanvas.removeEventListener('mousedown', onMouseDown);
    drawCanvas.removeEventListener('mousemove', onMouseMove);
    drawCanvas.removeEventListener('mouseup', onMouseUp);
}

// The Floating Input UI that talks to your Python server
function createFloatingInput(base64Image, x, y, width, height) {
    const container = document.createElement('div');
    container.id = 'vernacular-vision-input';

    // Boundary checks so the box never spawns off-screen
    let leftPos = x;
    if (leftPos + 320 > window.innerWidth) leftPos = window.innerWidth - 340;
    if (leftPos < 10) leftPos = 10;

    let topPos = y + height + 10;
    if (topPos + 180 > window.innerHeight) topPos = y - 180;
    if (topPos < 10) topPos = 10;

    container.style.cssText = `
        position: fixed !important; 
        top: ${topPos}px !important;
        left: ${leftPos}px !important;
        background: white !important;
        padding: 15px !important;
        border-radius: 8px !important;
        box-shadow: 0 10px 25px rgba(0,0,0,0.3) !important;
        z-index: 2147483648 !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 10px !important;
        width: 320px !important;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif !important;
        box-sizing: border-box !important;
    `;

    // Drag Handle so you can move it around!
    const dragHeader = document.createElement('div');
    dragHeader.innerHTML = '⠿ Drag to move';
    dragHeader.style.cssText = `
        text-align: center !important;
        color: #9ca3af !important;
        font-size: 12px !important;
        cursor: grab !important;
        padding-bottom: 5px !important;
        border-bottom: 1px solid #e5e7eb !important;
        user-select: none !important;
        margin-top: -5px !important;
    `;

    // Dragging Logic
    dragHeader.onmousedown = (e) => {
        let isDragging = true;
        dragHeader.style.cursor = 'grabbing';

        const rect = container.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;

        const onMouseMove = (moveEvent) => {
            if (!isDragging) return;
            container.style.setProperty('left', `${moveEvent.clientX - offsetX}px`, 'important');
            container.style.setProperty('top', `${moveEvent.clientY - offsetY}px`, 'important');
        };

        const onMouseUp = () => {
            isDragging = false;
            dragHeader.style.cursor = 'grab';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Ask AI about this image...';
    input.style.cssText = `
        padding: 10px !important; 
        border: 2px solid #e5e7eb !important; 
        border-radius: 6px !important; 
        outline: none !important; 
        font-size: 14px !important;
        color: black !important;
        background: white !important;
        width: 100% !important;
        box-sizing: border-box !important;
        display: block !important;
    `;
    input.onfocus = () => input.style.borderColor = '#4f46e5';
    input.onblur = () => input.style.borderColor = '#e5e7eb';

    const sendBtn = document.createElement('button');
    sendBtn.innerText = '✨ Analyze Image';
    sendBtn.style.cssText = `
        padding: 10px !important; 
        background: #4f46e5 !important; 
        color: white !important; 
        border: none !important; 
        border-radius: 6px !important; 
        cursor: pointer !important; 
        font-weight: bold !important;
        width: 100% !important;
        display: block !important;
    `;
    sendBtn.onmouseover = () => sendBtn.style.backgroundColor = '#4338ca';
    sendBtn.onmouseout = () => sendBtn.style.backgroundColor = '#4f46e5';

    const resultDiv = document.createElement('div');
    resultDiv.style.cssText = `
        font-size: 14px !important; 
        color: #1f2937 !important; 
        margin-top: 5px !important; 
        display: none; 
        line-height: 1.5 !important; 
        max-height: 200px !important; 
        overflow-y: auto !important; 
        word-wrap: break-word !important;
        background: transparent !important;
        text-align: left !important;
    `;

    const closeBtn = document.createElement('button');
    closeBtn.innerText = '✖';
    closeBtn.style.cssText = `
        position: absolute !important; 
        top: -10px !important; 
        right: -10px !important; 
        background: #ef4444 !important; 
        color: white !important; 
        border: none !important; 
        border-radius: 50% !important; 
        width: 24px !important; 
        height: 24px !important; 
        cursor: pointer !important; 
        font-size: 12px !important; 
        display: flex !important; 
        align-items: center !important; 
        justify-content: center !important;
    `;
    closeBtn.onclick = closeSnippingTool;

    sendBtn.onclick = async () => {
        // Automatically ask to explain if left empty
        const userPrompt = input.value.trim() || "Please explain this image in detail.";

        sendBtn.innerText = 'Thinking... 🤔';
        sendBtn.disabled = true;
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = '<span style="color: #6b7280;">Sending image to Google Gemini...</span>';

        try {
            const storageData = await chrome.storage.local.get(['targetLanguage']);
            const lang = storageData.targetLanguage || 'English';

            const response = await fetch('http://localhost:8000/analyze-vision', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    base64_image: base64Image,
                    prompt: userPrompt,
                    target_language: lang
                })
            });

            if (!response.ok) throw new Error("Backend connection failed.");
            const data = await response.json();

            // Clear "Thinking..."
            resultDiv.innerHTML = '';

            // Add the text response
            const responseText = document.createElement('div');
            responseText.innerHTML = `<strong>Response:</strong><br>${data.answer.replace(/\n/g, '<br>')}`;

            // NEW FEATURE: Add the Text-to-Speech (TTS) Button
            const ttsBtn = document.createElement('button');
            ttsBtn.innerHTML = '🔊 Read Aloud';
            ttsBtn.style.cssText = `
                margin-top: 10px !important; 
                padding: 6px 10px !important; 
                background: #e0e7ff !important; 
                color: #4f46e5 !important; 
                border: none !important; 
                border-radius: 4px !important; 
                cursor: pointer !important; 
                font-size: 12px !important; 
                font-weight: bold !important;
                width: 100% !important;
                display: block !important;
            `;

            ttsBtn.onclick = () => {
                window.speechSynthesis.cancel(); // Stop any current audio
                const utterance = new SpeechSynthesisUtterance(data.answer);

                // Map the selected language to standard speech codes
                const langMap = {
                    'English': 'en-US',
                    'Kannada': 'kn-IN',
                    'Hindi': 'hi-IN',
                    'Telugu': 'te-IN',
                    'Tamil': 'ta-IN',
                    'Malayalam': 'ml-IN'
                };
                utterance.lang = langMap[lang] || 'en-US';

                window.speechSynthesis.speak(utterance);
            };

            resultDiv.appendChild(responseText);
            resultDiv.appendChild(ttsBtn);

            sendBtn.innerText = '✨ Ask Another Question';
            sendBtn.disabled = false;
            input.value = '';
        } catch (err) {
            resultDiv.innerHTML = '<span style="color: #ef4444;">❌ Error connecting to the Python Server. Make sure it is running!</span>';
            sendBtn.innerText = '✨ Try Again';
            sendBtn.disabled = false;
        }
    };

    input.onkeydown = (e) => { if (e.key === 'Enter') sendBtn.click(); };

    container.appendChild(closeBtn);
    container.appendChild(dragHeader);
    container.appendChild(input);
    container.appendChild(sendBtn);
    container.appendChild(resultDiv);
    document.body.appendChild(container);

    input.focus();
}

function closeSnippingTool() {
    window.speechSynthesis.cancel(); // Stop audio if they close the tool!
    const container = document.getElementById('vernacular-snip-container');
    if (container) container.remove();

    const inputUI = document.getElementById('vernacular-vision-input');
    if (inputUI) inputUI.remove();
}