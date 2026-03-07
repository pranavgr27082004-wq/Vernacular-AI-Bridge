// Allows users to open the side panel by clicking the extension icon in the Chrome toolbar
if (chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
        .catch((error) => console.error(error));
}

// Listens for messages from the content script (The webpage)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    // 1. Handle taking screenshots for the Snipping Tool
    if (request.action === "TAKE_SCREENSHOT") {
        chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
            sendResponse({ dataUrl: dataUrl });
        });
        return true;
    }

    // 2. Handle opening the Side Panel when the floating button is clicked
    if (request.action === "OPEN_SIDE_PANEL") {
        // Find the active tab and force the side panel to open attached to it
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                chrome.sidePanel.open({ windowId: tabs[0].windowId });
            }
        });
    }
});