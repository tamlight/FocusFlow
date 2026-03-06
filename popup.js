document.addEventListener("DOMContentLoaded", async () => {
    const activeTabsCountObj = document.getElementById("active-tabs-count");
    const workspaceCountObj = document.getElementById("workspace-count");
    const saveContextBtn = document.getElementById("save-context-btn");
    const contextNameInput = document.getElementById("context-name");
    const contextList = document.getElementById("context-list");
    const aiNameBtn = document.getElementById("ai-name-btn");

    const groqApiInput = document.getElementById("groq-api-key");
    const saveApiBtn = document.getElementById("save-api-key");
    const apiStatusDesc = document.getElementById("api-status-desc");

    let userGroqKey = "";

    function updateApiStatus(key) {
        if (!apiStatusDesc) return;
        if (key) {
            const masked = key.length > 8 ? `${key.substring(0, 4)}...${key.substring(key.length - 4)}` : "****";
            apiStatusDesc.textContent = `Status: Key saved (${masked})`;
            apiStatusDesc.style.color = "var(--accent-green)";
        } else {
            apiStatusDesc.textContent = "Status: No key saved";
            apiStatusDesc.style.color = "var(--text-secondary)";
        }
    }

    // Load initial data
    const tabs = await chrome.tabs.query({ currentWindow: true });
    if (activeTabsCountObj) activeTabsCountObj.textContent = `${tabs.length} tabs open`;

    // Load API Key and Contexts
    chrome.storage.local.get(["groq_api_key"], (result) => {
        if (result.groq_api_key) {
            userGroqKey = result.groq_api_key;
            groqApiInput.value = userGroqKey;
            saveApiBtn.classList.add("saved");
            updateApiStatus(userGroqKey);
        } else {
            updateApiStatus(null);
        }
    });

    await renderSavedContexts();

    // Save API Key Event
    saveApiBtn.addEventListener("click", async () => {
        const key = groqApiInput.value.trim();
        if (key) {
            await chrome.storage.local.set({ groq_api_key: key });
            userGroqKey = key;
            saveApiBtn.classList.add("saved");
            updateApiStatus(key);

            // Visual feedback
            const originalIcon = saveApiBtn.innerHTML;
            saveApiBtn.innerHTML = "✓";
            setTimeout(() => {
                saveApiBtn.innerHTML = originalIcon;
            }, 1500);
        } else {
            await chrome.storage.local.remove("groq_api_key");
            userGroqKey = "";
            updateApiStatus(null);
            alert("API Key removed.");
        }
    });

    groqApiInput.addEventListener("input", () => {
        saveApiBtn.classList.remove("saved");
    });

    // AI Name Generation Event
    aiNameBtn.addEventListener("click", async () => {
        try {
            if (!userGroqKey) {
                alert("Please enter and save your Groq API key first in the configuration section above.");
                return;
            }

            aiNameBtn.disabled = true;
            aiNameBtn.querySelector('svg').classList.add("loading");

            const currentTabs = await chrome.tabs.query({ currentWindow: true });
            const tabTitles = currentTabs.map(t => t.title).join(", ");

            const prompt = `I have the following browser tabs open: ${tabTitles}. Suggest ONE short, concise categorization name (max 3 words). Respond ONLY with the name.`;

            const response = await fetch(`https://api.groq.com/openai/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${userGroqKey}`
                },
                body: JSON.stringify({
                    model: "llama-3.1-8b-instant",
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.3,
                    max_tokens: 10
                })
            });

            if (!response.ok) throw new Error('API Request failed');

            const data = await response.json();
            const generatedName = data.choices[0].message.content.trim();
            contextNameInput.value = generatedName.replace(/^["']|["']$/g, '');

        } catch (error) {
            console.error("AI Error:", error);
            alert("AI Failed: Check your API Key or Network.");
        } finally {
            aiNameBtn.disabled = false;
            aiNameBtn.querySelector('svg').classList.remove("loading");
        }
    });

    // Save Context Event
    saveContextBtn.addEventListener("click", async () => {
        const contextName = contextNameInput.value.trim() || `Workspace ${new Date().toLocaleDateString()}`;
        const currentTabs = await chrome.tabs.query({ currentWindow: true });

        const tabData = [];
        for (const tab of currentTabs) {
            let scrollY = 0;
            if (tab.url.startsWith("http")) {
                try {
                    const results = await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: () => { return window.scrollY; }
                    });
                    if (results && results[0] && results[0].result !== undefined) {
                        scrollY = results[0].result;
                    }
                } catch (e) {
                    console.log("Scroll fetching failed", e);
                }
            }

            tabData.push({
                url: tab.url,
                title: tab.title,
                favIconUrl: tab.favIconUrl,
                scrollY: scrollY
            });
        }

        const newContext = {
            id: Date.now().toString(),
            name: contextName,
            tabs: tabData,
            createdAt: new Date().toISOString()
        };

        chrome.storage.local.get(["focusFlowContexts"], async (result) => {
            const contexts = result.focusFlowContexts || [];
            contexts.push(newContext);
            await chrome.storage.local.set({ focusFlowContexts: contexts });

            await chrome.tabs.create({});
            const tabIdsToClose = currentTabs.map(t => t.id);
            await chrome.tabs.remove(tabIdsToClose);

            contextNameInput.value = "";
            renderSavedContexts();
        });
    });

    async function renderSavedContexts() {
        chrome.storage.local.get(["focusFlowContexts"], (result) => {
            const contexts = result.focusFlowContexts || [];
            contextList.innerHTML = "";

            if (workspaceCountObj) {
                workspaceCountObj.textContent = contexts.length;
            }

            if (contexts.length === 0) {
                contextList.innerHTML = "<p style='color: var(--text-secondary); font-size: 13px; text-align: center; padding: 20px;'>No workspaces yet.</p>";
                return;
            }

            [...contexts].reverse().forEach(context => {
                const card = document.createElement("div");
                card.className = "context-card";

                card.innerHTML = `
                  <div class="ctx-info">
                    <div class="ctx-name">${context.name}</div>
                    <div class="ctx-meta">
                      ${context.tabs.length} tabs • ${timeAgo(new Date(context.createdAt))}
                    </div>
                  </div>
                  <div class="ctx-actions">
                    <button class="restore-btn-mini" data-id="${context.id}">Restore</button>
                    <button class="delete-btn-mini" data-id="${context.id}" title="Delete">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>
                  </div>
                `;

                contextList.appendChild(card);
            });

            document.querySelectorAll(".restore-btn-mini").forEach(btn => {
                btn.addEventListener("click", (e) => restoreContext(e.target.dataset.id));
            });

            document.querySelectorAll(".delete-btn-mini").forEach(btn => {
                btn.addEventListener("click", (e) => deleteContext(e.currentTarget.dataset.id));
            });
        });
    }

    async function restoreContext(contextId) {
        chrome.storage.local.get(["focusFlowContexts"], async (result) => {
            const contexts = result.focusFlowContexts || [];
            const contextToRestore = contexts.find(c => c.id === contextId);

            if (contextToRestore) {
                // Open all tabs in a new window or current window
                // For now, let's open them in the current window
                for (const tabData of contextToRestore.tabs) {
                    const newTab = await chrome.tabs.create({ url: tabData.url, active: false });

                    // If we saved a scroll position, inject a script to scroll down once the page loads
                    if (tabData.scrollY > 0 && tabData.url.startsWith("http")) {
                        const tabIdToUpdate = newTab.id;
                        const scrollYToRestore = tabData.scrollY;

                        // We use a listener on tab update because the page needs to load first before we can scroll
                        chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                            if (tabId === tabIdToUpdate && info.status === 'complete') {
                                chrome.tabs.onUpdated.removeListener(listener);

                                // Execute script. Use a staggered polling approach since background 
                                // tabs might not render DOM immediately until they are focused.
                                chrome.scripting.executeScript({
                                    target: { tabId: tabIdToUpdate },
                                    func: (targetScroll) => {
                                        let attempts = 0;
                                        const tryScroll = setInterval(() => {
                                            attempts++;
                                            window.scrollTo({ top: targetScroll, behavior: 'auto' });
                                            // Stop polling after 10 tries (about 5 seconds) or if we successfully scrolled near the target
                                            if (attempts >= 10 || Math.abs(window.scrollY - targetScroll) < 50) {
                                                clearInterval(tryScroll);
                                            }
                                        }, 500);
                                    },
                                    args: [scrollYToRestore]
                                }).catch(e => console.log("Failed to inject scroll script", e));
                            }
                        });
                    }
                }
            }
        });
    }

    async function deleteContext(contextId) {
        chrome.storage.local.get(["focusFlowContexts"], async (result) => {
            let contexts = result.focusFlowContexts || [];
            contexts = contexts.filter(c => c.id !== contextId);
            await chrome.storage.local.set({ focusFlowContexts: contexts });
            renderSavedContexts();
        });
    }

    // Helper for formatting time
    function timeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        let interval = seconds / 31536000;
        if (interval > 1) return Math.floor(interval) + " years ago";
        interval = seconds / 2592000;
        if (interval > 1) return Math.floor(interval) + " months ago";
        interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + " days ago";
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + " hours ago";
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + " minutes ago";
        return Math.floor(seconds) + " seconds ago";
    }
});
