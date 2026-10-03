/**
 * ChatAI - Clean, High-Performance Frontend Client
 * Powered by Groq, Gemini, and OpenAI
 */

// Application State
let currentSessionId = null;
let isStreaming = false;
let isRecording = false;
let currentSpeechUtterance = null;
let activeSpeakerBtn = null;

// DOM References
const sidebar = document.getElementById("sidebar");
const toggleSidebarBtn = document.getElementById("toggleSidebarBtn");
const sessionsList = document.getElementById("sessionsList");
const sessionCountBadge = document.getElementById("sessionCountBadge");
const newChatBtn = document.getElementById("newChatBtn");
const clearChatBtn = document.getElementById("clearChatBtn");
const personaSelect = document.getElementById("personaSelect");
const providerSelect = document.getElementById("providerSelect");
const customPromptContainer = document.getElementById("customPromptContainer");
const customPromptInput = document.getElementById("customPromptInput");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const activeModelLabel = document.getElementById("activeModelLabel");
const activeChatTitle = document.getElementById("activeChatTitle");
const chatFeed = document.getElementById("chatFeed");
const welcomeScreen = document.getElementById("welcomeScreen");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const voiceBtn = document.getElementById("voiceBtn");
const voiceStatus = document.getElementById("voiceStatus");
const themeToggleBtn = document.getElementById("themeToggleBtn");
const exportBtn = document.getElementById("exportBtn");
const exportMenu = document.getElementById("exportMenu");
const exportMdBtn = document.getElementById("exportMdBtn");
const exportJsonBtn = document.getElementById("exportJsonBtn");
const toastContainer = document.getElementById("toastContainer");

// -------------------------------------------------------------
// Markdown & Highlight.js Configuration
// -------------------------------------------------------------
if (typeof marked !== "undefined") {
  marked.setOptions({
    breaks: true,
    gfm: true,
    highlight: function (code, lang) {
      if (typeof hljs !== "undefined" && lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value;
        } catch (e) {}
      }
      return code;
    }
  });
}

// -------------------------------------------------------------
// Appearance (Dark / Light Theme)
// -------------------------------------------------------------
function initTheme() {
  const savedTheme = localStorage.getItem("chatai_theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
  updateThemeIcon(savedTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const newTheme = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", newTheme);
  localStorage.setItem("chatai_theme", newTheme);
  updateThemeIcon(newTheme);

  const hljsLink = document.getElementById("hljsTheme");
  if (hljsLink) {
    hljsLink.href = newTheme === "dark"
      ? "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github-dark.min.css"
      : "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github.min.css";
  }
}

function updateThemeIcon(theme) {
  const icon = document.getElementById("themeIcon");
  if (!icon) return;
  if (theme === "light") {
    icon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>`;
  } else {
    icon.innerHTML = `
      <circle cx="12" cy="12" r="5"></circle>
      <line x1="12" y1="1" x2="12" y2="3"></line>
      <line x1="12" y1="21" x2="12" y2="23"></line>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
      <line x1="1" y1="12" x2="3" y2="12"></line>
      <line x1="21" y1="12" x2="23" y2="12"></line>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
    `;
  }
}

if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", toggleTheme);
}

// -------------------------------------------------------------
// Toast Notifications
// -------------------------------------------------------------
function showToast(message, duration = 2400) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.25s";
    setTimeout(() => toast.remove(), 260);
  }, duration);
}

// -------------------------------------------------------------
// Backend Status Check
// -------------------------------------------------------------
async function checkBackendStatus() {
  try {
    const res = await fetch("/api/status");
    if (!res.ok) throw new Error("Status check failed");
    const data = await res.json();

    statusDot.classList.add("online");
    statusText.textContent = "Online";
    statusText.title = `${data.provider} (${data.model})`;
  } catch (err) {
    statusDot.classList.remove("online");
    statusDot.style.backgroundColor = "var(--error)";
    statusText.textContent = "Offline";
  }
}

// -------------------------------------------------------------
// Chat Sessions Management (SQLite)
// -------------------------------------------------------------
async function loadSessions() {
  try {
    const res = await fetch("/api/sessions");
    if (!res.ok) return;
    const data = await res.json();
    const sessions = data.sessions || [];

    sessionCountBadge.textContent = sessions.length;
    sessionsList.innerHTML = "";

    if (sessions.length === 0) {
      sessionsList.innerHTML = '<div class="sessions-empty">No conversations yet</div>';
      return;
    }

    sessions.forEach(s => {
      const item = document.createElement("div");
      item.className = `session-item ${s.id === currentSessionId ? "active" : ""}`;
      item.dataset.id = s.id;

      const titleWrap = document.createElement("div");
      titleWrap.className = "session-title-wrap";
      titleWrap.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
        <span>${escapeHtml(s.title || "New chat")}</span>
      `;

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "delete-session-btn";
      deleteBtn.title = "Delete";
      deleteBtn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
        </svg>
      `;

      deleteBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await deleteSession(s.id);
      });

      item.appendChild(titleWrap);
      item.appendChild(deleteBtn);

      item.addEventListener("click", () => switchSession(s.id));
      sessionsList.appendChild(item);
    });
  } catch (e) {
    console.error("Failed to load sessions:", e);
  }
}

async function switchSession(sessionId) {
  if (isStreaming) return;
  currentSessionId = sessionId;
  stopSpeech();

  document.querySelectorAll(".session-item").forEach(el => {
    el.classList.toggle("active", el.dataset.id === sessionId);
  });

  try {
    const res = await fetch(`/api/sessions/${sessionId}`);
    if (!res.ok) throw new Error("Could not load session");
    const data = await res.json();
    const session = data.session;
    const messages = data.messages || [];

    activeChatTitle.textContent = session.title || "New chat";
    if (session.persona && personaSelect) {
      personaSelect.value = session.persona;
    }

    renderMessages(messages);

    if (window.innerWidth <= 768) {
      sidebar.classList.remove("open");
    }
  } catch (e) {
    showToast("Failed to load conversation.");
  }
}

async function createNewChat() {
  if (isStreaming) return;
  stopSpeech();
  currentSessionId = null;
  activeChatTitle.textContent = "New chat";
  chatFeed.innerHTML = "";
  if (welcomeScreen) {
    chatFeed.appendChild(welcomeScreen);
    welcomeScreen.style.display = "flex";
  }

  document.querySelectorAll(".session-item").forEach(el => el.classList.remove("active"));
  messageInput.value = "";
  messageInput.focus();

  if (window.innerWidth <= 768) {
    sidebar.classList.remove("open");
  }
}

async function deleteSession(sessionId) {
  try {
    const res = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete");
    if (currentSessionId === sessionId) {
      createNewChat();
    }
    await loadSessions();
  } catch (e) {
    showToast("Error deleting session.");
  }
}

async function clearCurrentChat() {
  if (!currentSessionId) {
    chatFeed.innerHTML = "";
    if (welcomeScreen) {
      chatFeed.appendChild(welcomeScreen);
      welcomeScreen.style.display = "flex";
    }
    showToast("Chat cleared.");
    return;
  }

  try {
    const res = await fetch(`/api/sessions/${currentSessionId}/messages`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to clear messages");
    chatFeed.innerHTML = "";
    if (welcomeScreen) {
      chatFeed.appendChild(welcomeScreen);
      welcomeScreen.style.display = "flex";
    }
    showToast("Chat cleared.");
    await loadSessions();
  } catch (e) {
    showToast("Error clearing chat.");
  }
}

newChatBtn.addEventListener("click", createNewChat);
clearChatBtn.addEventListener("click", clearCurrentChat);

// -------------------------------------------------------------
// Message Rendering
// -------------------------------------------------------------
function renderMessages(messages) {
  chatFeed.innerHTML = "";
  if (!messages || messages.length === 0) {
    if (welcomeScreen) {
      chatFeed.appendChild(welcomeScreen);
      welcomeScreen.style.display = "flex";
    }
    return;
  }

  if (welcomeScreen) welcomeScreen.style.display = "none";
  messages.forEach(m => {
    appendMessage(m.role, m.content, { model: m.model, provider: m.provider });
  });
  chatFeed.scrollTop = chatFeed.scrollHeight;
}

function appendMessage(role, rawContent, meta = {}, isError = false) {
  if (welcomeScreen) welcomeScreen.style.display = "none";

  const entry = document.createElement("div");
  entry.className = `message-entry ${role === "user" ? "user-entry" : "bot-entry"}`;

  if (role === "user") {
    const bubble = document.createElement("div");
    bubble.className = "user-bubble";
    bubble.textContent = rawContent;
    entry.appendChild(bubble);
  } else {
    // Assistant Header indicator
    const header = document.createElement("div");
    header.className = "bot-header-indicator";
    header.innerHTML = `
      <svg class="bot-spark-icon" width="13" height="13" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.4 14.4L2 12L9.4 9.4L12 2Z" fill="currentColor"/>
      </svg>
      <span>${escapeHtml(meta.provider || meta.model || "ChatAI")}</span>
    `;
    entry.appendChild(header);

    // Assistant Markdown Body
    const body = document.createElement("div");
    body.className = "bot-body";
    if (isError) body.style.color = "var(--error)";
    renderMarkdownInto(body, rawContent);
    entry.appendChild(body);

    // Subtle Actions (Copy & Speak)
    if (!isError) {
      const actionsRow = document.createElement("div");
      actionsRow.className = "bot-actions-row";

      const copyBtn = document.createElement("button");
      copyBtn.className = "action-pill-btn";
      copyBtn.title = "Copy";
      copyBtn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        Copy
      `;
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(rawContent);
        showToast("Copied to clipboard");
      });

      const speakBtn = document.createElement("button");
      speakBtn.className = "action-pill-btn";
      speakBtn.title = "Read aloud";
      speakBtn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        </svg>
        Speak
      `;
      speakBtn.addEventListener("click", () => toggleSpeech(rawContent, speakBtn));

      actionsRow.appendChild(copyBtn);
      actionsRow.appendChild(speakBtn);
      entry.appendChild(actionsRow);
    }
  }

  chatFeed.appendChild(entry);
  chatFeed.scrollTop = chatFeed.scrollHeight;
  return entry;
}

function renderMarkdownInto(container, markdownText) {
  if (typeof marked !== "undefined") {
    container.innerHTML = marked.parse(markdownText);
  } else {
    container.textContent = markdownText;
  }

  // Format Code Blocks
  container.querySelectorAll("pre").forEach(pre => {
    if (pre.parentElement.classList.contains("code-wrapper")) return;

    const code = pre.querySelector("code");
    const langMatch = code ? code.className.match(/language-(\w+)/) : null;
    const lang = langMatch ? langMatch[1] : "code";

    const wrapper = document.createElement("div");
    wrapper.className = "code-wrapper";

    const topbar = document.createElement("div");
    topbar.className = "code-topbar";
    topbar.innerHTML = `
      <span>${lang}</span>
      <button class="copy-snippet-btn" title="Copy code">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        Copy
      </button>
    `;

    const copyBtn = topbar.querySelector(".copy-snippet-btn");
    copyBtn.addEventListener("click", () => {
      const text = code ? code.innerText : pre.innerText;
      navigator.clipboard.writeText(text);
      copyBtn.innerHTML = `✓ Copied`;
      setTimeout(() => {
        copyBtn.innerHTML = `
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          Copy
        `;
      }, 1800);
    });

    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(topbar);
    wrapper.appendChild(pre);

    if (typeof hljs !== "undefined" && code) {
      hljs.highlightElement(code);
    }
  });
}

function appendStreamingPlaceholder() {
  const entry = document.createElement("div");
  entry.className = "message-entry bot-entry streaming-entry";

  const header = document.createElement("div");
  header.className = "bot-header-indicator";
  header.innerHTML = `
    <svg class="bot-spark-icon" width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.4 14.4L2 12L9.4 9.4L12 2Z" fill="currentColor"/>
    </svg>
    <span>ChatAI</span>
  `;

  const body = document.createElement("div");
  body.className = "bot-body";
  body.innerHTML = `<span class="loading-dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>`;

  entry.appendChild(header);
  entry.appendChild(body);
  chatFeed.appendChild(entry);
  chatFeed.scrollTop = chatFeed.scrollHeight;

  return { entry, body };
}

// -------------------------------------------------------------
// Chat Submission via SSE Streaming
// -------------------------------------------------------------
chatForm.addEventListener("submit", async function (e) {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text || isStreaming) return;

  appendMessage("user", text);

  messageInput.value = "";
  messageInput.style.height = "auto";
  sendBtn.disabled = true;
  isStreaming = true;

  const placeholder = appendStreamingPlaceholder();

  const selectedPersona = personaSelect ? personaSelect.value : "helpful";
  const customPrompt = selectedPersona === "custom" && customPromptInput
    ? customPromptInput.value.trim()
    : "";
  const selectedProvider = providerSelect ? providerSelect.value : "auto";

  const payload = {
    message: text,
    session_id: currentSessionId || "",
    persona: selectedPersona,
    custom_prompt: customPrompt,
    provider: selectedProvider
  };

  let accumulatedText = "";
  let finalProvider = "";
  let finalModel = "";

  try {
    const response = await fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const msg = errData.details || errData.error || "Service unavailable.";
      placeholder.entry.remove();
      appendMessage("assistant", `⚠️ **Error (${response.status}):** ${msg}`, {}, true);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const rawJson = line.slice(6).trim();
        if (!rawJson) continue;

        try {
          const parsed = JSON.parse(rawJson);

          if (parsed.type === "session_meta" && parsed.session_id) {
            currentSessionId = parsed.session_id;
            if (!activeChatTitle.textContent || activeChatTitle.textContent === "New chat") {
              const snippet = text.split(" ").slice(0, 5).join(" ");
              activeChatTitle.textContent = snippet;
            }
          }

          if (parsed.chunk) {
            accumulatedText += parsed.chunk;
            placeholder.body.innerHTML = marked.parse(accumulatedText) + '<span class="typing-cursor"></span>';
            chatFeed.scrollTop = chatFeed.scrollHeight;
          }

          if (parsed.done) {
            finalProvider = parsed.provider || "";
            finalModel = parsed.model || "";
          }

          if (parsed.error) {
            throw new Error(parsed.error);
          }
        } catch (jsonErr) {}
      }
    }

    placeholder.entry.remove();
    appendMessage("assistant", accumulatedText, {
      model: finalModel,
      provider: finalProvider
    });

    await loadSessions();

  } catch (err) {
    placeholder.entry.remove();
    appendMessage("assistant", `⚠️ **Connection Error:** ${err.message}`, {}, true);
  } finally {
    isStreaming = false;
    updateSendButtonState();
    messageInput.focus();
  }
});

// -------------------------------------------------------------
// Voice Input (Web Speech API STT)
// -------------------------------------------------------------
function initVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    if (voiceBtn) voiceBtn.style.display = "none";
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.onstart = () => {
    isRecording = true;
    voiceBtn.classList.add("recording");
    voiceStatus.classList.remove("hidden");
  };

  recognition.onresult = (event) => {
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      transcript += event.results[i][0].transcript;
    }
    messageInput.value = transcript;
    messageInput.style.height = "auto";
    messageInput.style.height = Math.min(messageInput.scrollHeight, 160) + "px";
    updateSendButtonState();
  };

  recognition.onerror = () => stopRecording();
  recognition.onend = () => stopRecording();

  function stopRecording() {
    isRecording = false;
    voiceBtn.classList.remove("recording");
    voiceStatus.classList.add("hidden");
  }

  if (voiceBtn) {
    voiceBtn.addEventListener("click", () => {
      if (isRecording) {
        recognition.stop();
      } else {
        try {
          recognition.start();
        } catch (e) {
          recognition.stop();
        }
      }
    });
  }
}

// -------------------------------------------------------------
// Voice Output (Speech Synthesis TTS)
// -------------------------------------------------------------
function toggleSpeech(text, btnElement) {
  if (!window.speechSynthesis) {
    showToast("Text-to-speech not supported");
    return;
  }

  if (window.speechSynthesis.speaking && activeSpeakerBtn === btnElement) {
    stopSpeech();
    return;
  }

  stopSpeech();

  const cleanText = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~#>]/g, "")
    .trim();

  currentSpeechUtterance = new SpeechSynthesisUtterance(cleanText);
  activeSpeakerBtn = btnElement;
  btnElement.classList.add("active-speaker");
  btnElement.innerHTML = `Pause`;

  currentSpeechUtterance.onend = () => stopSpeech();
  currentSpeechUtterance.onerror = () => stopSpeech();

  window.speechSynthesis.speak(currentSpeechUtterance);
}

function stopSpeech() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (activeSpeakerBtn) {
    activeSpeakerBtn.classList.remove("active-speaker");
    activeSpeakerBtn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
      </svg>
      Speak
    `;
    activeSpeakerBtn = null;
  }
}

// -------------------------------------------------------------
// Export Handlers
// -------------------------------------------------------------
if (exportBtn && exportMenu) {
  exportBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle("hidden");
  });

  document.addEventListener("click", () => exportMenu.classList.add("hidden"));

  exportMdBtn.addEventListener("click", () => {
    if (!currentSessionId) {
      showToast("Start a conversation first");
      return;
    }
    window.location.href = `/api/export/${currentSessionId}?format=markdown`;
  });

  exportJsonBtn.addEventListener("click", () => {
    if (!currentSessionId) {
      showToast("Start a conversation first");
      return;
    }
    window.location.href = `/api/export/${currentSessionId}?format=json`;
  });
}

// -------------------------------------------------------------
// Input Handlers & Composer Interactions
// -------------------------------------------------------------
function updateSendButtonState() {
  if (isStreaming) {
    sendBtn.disabled = true;
    sendBtn.classList.remove("active");
    return;
  }
  const hasText = messageInput.value.trim().length > 0;
  sendBtn.disabled = !hasText;
  sendBtn.classList.toggle("active", hasText);
}

const composerBox = document.getElementById("composerBox");
if (composerBox) {
  composerBox.addEventListener("click", (e) => {
    if (!e.target.closest("#voiceBtn") && !e.target.closest("#sendBtn")) {
      messageInput.focus();
    }
  });
}

if (sendBtn) {
  sendBtn.addEventListener("click", function (e) {
    if (!messageInput.value.trim() && !isStreaming) {
      e.preventDefault();
      messageInput.focus();
    }
  });
}

messageInput.addEventListener("input", function () {
  this.style.height = "auto";
  this.style.height = Math.min(this.scrollHeight, 160) + "px";
  updateSendButtonState();
});

messageInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (messageInput.value.trim() && !isStreaming) {
      chatForm.dispatchEvent(new Event("submit"));
    }
  }
});

// Keyboard shortcut: Ctrl+K or Cmd+K for new chat
document.addEventListener("keydown", function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    createNewChat();
  }
});

if (personaSelect) {
  personaSelect.addEventListener("change", function () {
    if (this.value === "custom") {
      customPromptContainer.classList.remove("hidden");
      customPromptInput.focus();
    } else {
      customPromptContainer.classList.add("hidden");
    }
  });
}

if (toggleSidebarBtn) {
  toggleSidebarBtn.addEventListener("click", () => {
    if (window.innerWidth <= 768) {
      sidebar.classList.toggle("open");
    } else {
      sidebar.classList.toggle("collapsed");
    }
  });
}

document.addEventListener("click", function (e) {
  const card = e.target.closest(".prompt-card");
  if (card) {
    const prompt = card.getAttribute("data-prompt");
    if (prompt) {
      messageInput.value = prompt;
      chatForm.dispatchEvent(new Event("submit"));
    }
  }
});

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// -------------------------------------------------------------
// Initialization
// -------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  initVoiceInput();
  updateSendButtonState();
  await checkBackendStatus();
  await loadSessions();
  messageInput.focus();
});
