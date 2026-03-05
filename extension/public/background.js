// 1. Allow users to open the side panel by clicking the puzzle piece icon
chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

// 2. Listen for messages from our floating button on the webpage
chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.action === 'open_side_panel') {
        // If the button says "open", we open the panel on that specific tab
        chrome.sidePanel.open({ tabId: sender.tab.id });
    }
});