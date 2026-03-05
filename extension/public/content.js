// 1. Create a button element using JavaScript
const button = document.createElement('button');
button.innerText = '✨ Ask AI';

// 2. Style the button to float in the bottom right corner
button.style.position = 'fixed';
button.style.bottom = '20px';
button.style.right = '20px';
button.style.zIndex = '999999'; // Make sure it stays on top of videos
button.style.padding = '12px 20px';
button.style.backgroundColor = '#6366f1'; // Nice indigo color
button.style.color = 'white';
button.style.border = 'none';
button.style.borderRadius = '50px';
button.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
button.style.cursor = 'pointer';
button.style.fontWeight = 'bold';
button.style.fontFamily = 'Arial, sans-serif';

// Add a simple hover effect
button.onmouseover = () => button.style.backgroundColor = '#4f46e5';
button.onmouseout = () => button.style.backgroundColor = '#6366f1';

// 3. When clicked, send a message to background.js to open the Side Panel
button.onclick = () => {
    chrome.runtime.sendMessage({ action: 'open_side_panel' });
};

// 4. Inject the button into the webpage's body
document.body.appendChild(button);