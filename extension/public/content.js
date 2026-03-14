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
        z-index: 2147483646 !important;
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

    btn.onclick = () => {
        chrome.runtime.sendMessage({ action: "OPEN_SIDE_PANEL" });
    };

    document.body.appendChild(btn);
}

createAskAIButton();

// ==========================================
// 2. SCRAPING, SNIPPING & VISION
// ==========================================
let overlayCanvas, drawCanvas, ctx, startX, startY, isDrawing = false;
let img = new Image();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "START_SNIPPING") {
        initSnippingTool();
    } else if (request.action === "SCRAPE_WEBPAGE") {
        const pageText = document.body.innerText.replace(/\s+/g, ' ').trim();
        sendResponse({ text: pageText.substring(0, 50000), title: document.title });
    } else if (request.action === "SCRAPE_PRODUCT") {
        let productName = document.title;
        let productDetails = "";
        let extractedPrice = "";

        // --- ULTIMATE PRICE EXTRACTOR ---

        // Priority 1: Specific Main Buy Box Selectors (Amazon & Flipkart)
        // These target the ACTUAL main price area, ignoring related items or EMIs.
        const preciseSelectors = [
            '#corePriceDisplay_desktop_feature_div .a-price-whole',
            '#corePrice_feature_div .a-price-whole',
            '#priceblock_ourprice',
            '#priceblock_dealprice',
            'div.Nx9bqj.pNxLdS',
            'div._30jeq3._16Jk6d'
        ];

        for (const sel of preciseSelectors) {
            const el = document.querySelector(sel);
            if (el) {
                // Use textContent to penetrate hidden/nested spans
                const text = el.textContent || el.innerText || "";
                const num = text.replace(/[^0-9]/g, '');
                if (num && parseInt(num) > 100) {
                    extractedPrice = num;
                    break;
                }
            }
        }

        // Priority 2: JSON-LD Semantic Data Fallback (Invisible SEO data)
        if (!extractedPrice) {
            const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
            for (let script of ldScripts) {
                try {
                    const data = JSON.parse(script.innerText);
                    const items = Array.isArray(data) ? data : [data];
                    for (let item of items) {
                        if (item.offers && item.offers.price) {
                            extractedPrice = String(item.offers.price).replace(/[^0-9]/g, '');
                            break;
                        }
                    }
                } catch (e) { }
                if (extractedPrice) break;
            }
        }

        // Priority 3: Generic Fallback (Find the highest realistic price on page)
        if (!extractedPrice) {
            const genericSelectors = ['.a-price-whole', '.Nx9bqj', '._30jeq3'];
            for (const sel of genericSelectors) {
                const els = document.querySelectorAll(sel);
                for (let el of els) {
                    const text = el.textContent || el.innerText || "";
                    const num = text.replace(/[^0-9]/g, '');
                    const val = parseInt(num);
                    // Filter out small EMIs (usually < 500)
                    if (val && val > 500 && val < 500000) {
                        extractedPrice = num;
                        break;
                    }
                }
                if (extractedPrice) break;
            }
        }

        // --- DETAILS EXTRACTOR ---
        const ldJsonScripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (let script of ldJsonScripts) {
            try {
                const data = JSON.parse(script.innerText);
                const items = Array.isArray(data) ? data : [data];
                for (let item of items) {
                    if (item['@type'] === 'Product' || item['@type'] === 'ProductGroup') {
                        productName = item.name || productName;
                        productDetails = item.description || "";
                        break;
                    }
                }
            } catch (e) { /* Ignore parsing errors */ }
        }

        if (!productDetails) {
            const h1 = document.querySelector('h1');
            if (h1) productName = h1.innerText;
            const metaDesc = document.querySelector('meta[name="description"]');
            if (metaDesc) productDetails = metaDesc.content;
        }

        // Failsafe string assignment
        productDetails = productDetails || "Product details not found visually.";

        // 3. Inject the EXACT scraped price so the Python backend never falls back to 15,000!
        if (extractedPrice) {
            productDetails += `\n[PRICE_ON_PAGE: ${extractedPrice}]`;
        }

        sendResponse({ name: productName, details: productDetails });
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

    createFloatingInput(base64Image, x, y, width, height);

    drawCanvas.removeEventListener('mousedown', onMouseDown);
    drawCanvas.removeEventListener('mousemove', onMouseMove);
    drawCanvas.removeEventListener('mouseup', onMouseUp);
}

function createFloatingInput(base64Image, x, y, width, height) {
    const container = document.createElement('div');
    container.id = 'vernacular-vision-input';

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
        padding: 10px !important; border: 2px solid #e5e7eb !important; border-radius: 6px !important; outline: none !important; font-size: 14px !important; color: black !important; background: white !important; width: 100% !important; box-sizing: border-box !important; display: block !important;
    `;
    input.onfocus = () => input.style.borderColor = '#4f46e5';
    input.onblur = () => input.style.borderColor = '#e5e7eb';

    const sendBtn = document.createElement('button');
    sendBtn.innerText = '✨ Analyze Image';
    sendBtn.style.cssText = `
        padding: 10px !important; background: #4f46e5 !important; color: white !important; border: none !important; border-radius: 6px !important; cursor: pointer !important; font-weight: bold !important; width: 100% !important; display: block !important;
    `;
    sendBtn.onmouseover = () => sendBtn.style.backgroundColor = '#4338ca';
    sendBtn.onmouseout = () => sendBtn.style.backgroundColor = '#4f46e5';

    const resultDiv = document.createElement('div');
    resultDiv.style.cssText = `
        font-size: 14px !important; color: #1f2937 !important; margin-top: 5px !important; display: none; line-height: 1.5 !important; max-height: 200px !important; overflow-y: auto !important; word-wrap: break-word !important; background: transparent !important; text-align: left !important;
    `;

    const closeBtn = document.createElement('button');
    closeBtn.innerText = '✖';
    closeBtn.style.cssText = `
        position: absolute !important; top: -10px !important; right: -10px !important; background: #ef4444 !important; color: white !important; border: none !important; border-radius: 50% !important; width: 24px !important; height: 24px !important; cursor: pointer !important; font-size: 12px !important; display: flex !important; align-items: center !important; justify-content: center !important;
    `;
    closeBtn.onclick = closeSnippingTool;

    sendBtn.onclick = async () => {
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

            resultDiv.innerHTML = '';
            const responseText = document.createElement('div');
            responseText.innerHTML = `<strong>Response:</strong><br>${data.answer.replace(/\n/g, '<br>')}`;

            const ttsBtn = document.createElement('button');
            ttsBtn.innerHTML = '🔊 Read Aloud';
            ttsBtn.style.cssText = `
                margin-top: 10px !important; padding: 6px 10px !important; background: #e0e7ff !important; color: #4f46e5 !important; border: none !important; border-radius: 4px !important; cursor: pointer !important; font-size: 12px !important; font-weight: bold !important; width: 100% !important; display: block !important;
            `;

            ttsBtn.onclick = () => {
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(data.answer);
                const langMap = { 'English': 'en-US', 'Kannada': 'kn-IN', 'Hindi': 'hi-IN', 'Telugu': 'te-IN', 'Tamil': 'ta-IN', 'Malayalam': 'ml-IN' };
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
    window.speechSynthesis.cancel();
    const container = document.getElementById('vernacular-snip-container');
    if (container) container.remove();

    const inputUI = document.getElementById('vernacular-vision-input');
    if (inputUI) inputUI.remove();
}