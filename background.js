// background.js - Service worker for background tasks
// Currently we don't heavily rely on this for Phase 1 MVP, 
// as most logic lives in the popup.js, but it's essential for Manifest V3 extension structure.

chrome.runtime.onInstalled.addListener(() => {
    console.log("FocusFlow Extension installed.");
});
