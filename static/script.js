/**
 * AI Chatbot - Production Frontend Client
 * XICTEK Systems Internship - Day 2 & Day 3
 * 
 * Features:
 * - SQLite-backed persistent chat sessions
 * - Server-Sent Events (SSE) real-time token streaming
 * - Markdown rendering & Syntax Highlighting with Copy Code buttons
 * - Web Speech API Voice Input (STT) & Speech Synthesis (TTS)
 * - Dark & Light mode theme switching
 * - Export conversation (Markdown & JSON)
 * - Resilient error handling & retry mechanism
 */

// Application State
let currentSessionId = null;
let isStreaming = false;
let isRecording = false;
let currentSpeechUtterance = null;
let activeSpeakerBtn = null;

// System Persona Presets
const PERSONA_PROMPTS = {
  helpful: "You are a helpful, knowledgeable, and polite AI assistant. Provide clear, accurate, and concise answers using markdown when appropriate.",
  coder: "You are a Principal Software Engineer and System Architect. Provide concise, clean, and bug-free code examples with architecture tradeoffs.",
  tutor: "You are an inspiring technical mentor and educator. Break down difficult concepts into intuitive step-by-step explanations.",
  analyst: "You are an Executive Strategic Analyst. Provide crisp, structured bullet points, actionable insights, and data-driven analysis.",
  creative: "You are an inventive and imaginative creative writer. Provide engaging, vivid, and thought-provoking responses.",
  custom: ""
};

// DOM References
const sidebar = document.getElementById("sidebar");
const toggleSidebarBtn = document.getElementById("toggleSidebarBtn");
const sessionsList = document.getElementById("sessionsList");
const sessionCountBadge = document.getElementById("sessionCountBadge");
const newChatBtn = document.getElementById("newChatBtn");
const clearChatBtn = document.getElementById("clearChatBtn");
const personaSelect = document.getElementById("personaSelect");
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
const streamIndicator = document.getElementById("streamIndicator");
const charCounter = document.getElementById("charCounter");
const themeToggleBtn = document.getElementById("themeToggleBtn");
const exportBtn = document.getElementById("exportBtn");
const exportMenu = document.getElementById("exportMenu");
const exportMdBtn = document.getElementById("exportMdBtn");
const exportJsonBtn = document.getElementById("exportJsonBtn");
const toastContainer = document.getElementById("toastContainer");

// -------------------------------------------------------------
// Markdown & Syntax Highlighting Setup
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
// Theme Management (Dark & Light)
// -------------------------------------------------------------
function initTheme() {
  const savedTheme = localStorage.getItem("chatbot_theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
  updateThemeIcon(savedTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const newTheme = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", newTheme);
  localStorage.setItem("chatbot_theme", newTheme);
  updateThemeIcon(newTheme);

  // Switch highlight.js CSS
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
function showToast(message, duration = 2800) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s";
    setTimeout(() => toast.remove(), 300);
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
    statusText.textContent = `${data.provider}`;
    activeModelLabel.textContent = `Provider: ${data.provider} • Model: ${data.model}`;

    if (!data.is_live_key_configured) {
      statusText.textContent = "Demo Mode (Add key in .env)";
    }
  } catch (err) {
    statusDot.classList.remove("online");
    statusDot.style.backgroundColor = "var(--error)";
    statusText.textContent = "Backend Offline";
    activeModelLabel.textContent = "Failed to connect to backend";
  }
}

// -------------------------------------------------------------
// Chat Sessions Management (SQLite Persistence)
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
      sessionsList.innerHTML = '<div class="sessions-empty">No saved chats yet</div>';
      return;
    }

    sessions.forEach(s => {
      const item = document.createElement("div");
      item.className = `session-item ${s.id === currentSessionId ? "active" : ""}`;
      item.dataset.id = s.id;

      const titleWrap = document.createElement("div");
      titleWrap.className = "session-title-wrap";
      titleWrap.innerHTML = `<span>💬</span> <span class="session-text">${escapeHtml(s.title || "Conversation")}</span>`;

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "delete-session-btn";
      deleteBtn.title = "Delete conversation";
      deleteBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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

      item.addEventListener("click", () => {
        switchSession(s.id);
      });

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

  // Update active state in sidebar
  document.querySelectorAll(".session-item").forEach(el => {
    el.classList.toggle("active", el.dataset.id === sessionId);
  });

  try {
    const res = await fetch(`/api/sessions/${sessionId}`);
    if (!res.ok) throw new Error("Could not load session");
    const data = await res.json();
    const session = data.session;
    const messages = data.messages || [];

    activeChatTitle.textContent = session.title || "AI Assistant";
    if (session.persona && personaSelect) {
      personaSelect.value = session.persona in PERSONA_PROMPTS ? session.persona : "helpful";
    }

    renderMessages(messages);

    // On mobile, close sidebar after selecting
    if (window.innerWidth <= 768) {
      sidebar.classList.remove("open");
    }
  } catch (e) {
    showToast("Failed to load conversation history.");
  }
}

async function createNewChat() {
  if (isStreaming) return;
  stopSpeech();
  currentSessionId = null;
  activeChatTitle.textContent = "New Conversation";
  chatFeed.innerHTML = "";
  if (welcomeScreen) {
    chatFeed.appendChild(welcomeScreen);
    welcomeScreen.style.display = "flex";
  }

  // Deselect active session in sidebar
  document.querySelectorAll(".session-item").forEach(el => el.classList.remove("active"));
  messageInput.value = "";
  charCounter.textContent = "0 / 4000";
  messageInput.focus();

  if (window.innerWidth <= 768) {
    sidebar.classList.remove("open");
  }
}

async function deleteSession(sessionId) {
  try {
    const res = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete session");
    showToast("Conversation deleted.");
    if (currentSessionId === sessionId) {
      createNewChat();
    }
    await loadSessions();
  } catch (e) {
    showToast("Error deleting conversation.");
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
    showToast("Chat history cleared.");
    await loadSessions();
  } catch (e) {
    showToast("Error clearing chat history.");
  }
}

newChatBtn.addEventListener("click", createNewChat);
clearChatBtn.addEventListener("click", clearCurrentChat);

// -------------------------------------------------------------
// Message Rendering & UI Helpers
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
    appendMessage(m.role, m.content, {
      model: m.model,
      provider: m.provider,
      created_at: m.created_at
    });
  });
  chatFeed.scrollTop = chatFeed.scrollHeight;
}

function appendMessage(role, rawContent, meta = {}, isError = false) {
  if (welcomeScreen) welcomeScreen.style.display = "none";

  const row = document.createElement("div");
  row.className = `message-row ${role === "user" ? "user-row" : "bot-row"}`;

  const avatar = document.createElement("div");
  avatar.className = `avatar ${role === "user" ? "user-avatar" : "bot-avatar"}`;
  avatar.textContent = role === "user" ? "👤" : "🤖";

  const wrapper = document.createElement("div");
  wrapper.className = "message-wrapper";

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";
  if (isError) contentDiv.classList.add("error-card");

  if (role === "user") {
    contentDiv.textContent = rawContent;
  } else {
    // Parse Markdown for assistant
    renderMarkdownInto(contentDiv, rawContent);
  }

  wrapper.appendChild(contentDiv);

  // Assistant Metadata & Action Toolbar
  if (role === "assistant" && !isError) {
    const metaBar = document.createElement("div");
    metaBar.className = "message-meta";

    const tagSpan = document.createElement("span");
    const modelTag = meta.model || "AI";
    tagSpan.textContent = `${modelTag}`;

    const actions = document.createElement("div");
    actions.className = "message-actions";

    // Copy Response Button
    const copyBtn = document.createElement("button");
    copyBtn.className = "meta-action-btn";
    copyBtn.title = "Copy reply to clipboard";
    copyBtn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
      Copy
    `;
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(rawContent);
      showToast("Response copied to clipboard!");
    });

    // Read Aloud (Text to Speech) Button
    const speechBtn = document.createElement("button");
    speechBtn.className = "meta-action-btn";
    speechBtn.title = "Read aloud (Text to Speech)";
    speechBtn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
      </svg>
      Speak
    `;
    speechBtn.addEventListener("click", () => {
      toggleSpeech(rawContent, speechBtn);
    });

    actions.appendChild(copyBtn);
    actions.appendChild(speechBtn);

    metaBar.appendChild(tagSpan);
    metaBar.appendChild(actions);
    wrapper.appendChild(metaBar);
  }

  // Error Retry Button
  if (isError) {
    const retryBtn = document.createElement("button");
    retryBtn.className = "retry-btn";
    retryBtn.innerHTML = `🔄 Try Again`;
    retryBtn.addEventListener("click", () => {
      if (meta.lastUserPrompt) {
        messageInput.value = meta.lastUserPrompt;
        chatForm.dispatchEvent(new Event("submit"));
      }
    });
    wrapper.appendChild(retryBtn);
  }

  row.appendChild(avatar);
  row.appendChild(wrapper);
  chatFeed.appendChild(row);

  chatFeed.scrollTop = chatFeed.scrollHeight;
  return row;
}

function renderMarkdownInto(container, markdownText) {
  if (typeof marked !== "undefined") {
    container.innerHTML = marked.parse(markdownText);
  } else {
    container.textContent = markdownText;
  }

  // Post-process Code Blocks to inject Header & "Copy Code" button
  container.querySelectorAll("pre").forEach(pre => {
    // Avoid double-wrapping
    if (pre.parentElement.classList.contains("code-block-wrapper")) return;

    const code = pre.querySelector("code");
    const langMatch = code ? code.className.match(/language-(\w+)/) : null;
    const lang = langMatch ? langMatch[1] : "code";

    const wrapper = document.createElement("div");
    wrapper.className = "code-block-wrapper";

    const header = document.createElement("div");
    header.className = "code-header";
    header.innerHTML = `
      <span>${lang}</span>
      <button class="copy-code-btn" title="Copy code snippet">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        Copy Code
      </button>
    `;

    const copyBtn = header.querySelector(".copy-code-btn");
    copyBtn.addEventListener("click", () => {
      const textToCopy = code ? code.innerText : pre.innerText;
      navigator.clipboard.writeText(textToCopy);
      copyBtn.innerHTML = `✓ Copied!`;
      setTimeout(() => {
        copyBtn.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          Copy Code
        `;
      }, 2000);
    });

    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(header);
    wrapper.appendChild(pre);

    if (typeof hljs !== "undefined" && code) {
      hljs.highlightElement(code);
    }
  });
}

function appendStreamingPlaceholder() {
  const row = document.createElement("div");
  row.className = "message-row bot-row streaming-row";

  const avatar = document.createElement("div");
  avatar.className = "avatar bot-avatar";
  avatar.textContent = "🤖";

  const wrapper = document.createElement("div");
  wrapper.className = "message-wrapper";

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";
  contentDiv.innerHTML = `<span class="dot"></span><span class="dot"></span><span class="dot"></span>`;

  wrapper.appendChild(contentDiv);
  row.appendChild(avatar);
  row.appendChild(wrapper);
  chatFeed.appendChild(row);

  chatFeed.scrollTop = chatFeed.scrollHeight;
  return { row, contentDiv, wrapper };
}

// -------------------------------------------------------------
// Chat Submission with Server-Sent Events (SSE) Streaming
// -------------------------------------------------------------
chatForm.addEventListener("submit", async function (e) {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text || isStreaming) return;

  // Append user message to UI
  appendMessage("user", text);

  // Clear Input & reset height
  messageInput.value = "";
  messageInput.style.height = "auto";
  charCounter.textContent = "0 / 4000";
  sendBtn.disabled = true;
  isStreaming = true;
  streamIndicator.classList.remove("hidden");

  // Create streaming placeholder in feed
  const placeholder = appendStreamingPlaceholder();

  const selectedPersona = personaSelect ? personaSelect.value : "helpful";
  const customPrompt = selectedPersona === "custom" && customPromptInput
    ? customPromptInput.value.trim()
    : "";

  const payload = {
    message: text,
    session_id: currentSessionId || "",
    persona: selectedPersona,
    custom_prompt: customPrompt
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
      placeholder.row.remove();
      appendMessage("bot", `⚠️ **Error (${response.status}):** ${msg}`, { lastUserPrompt: text }, true);
      return;
    }

    // Process SSE stream chunks
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop(); // keep trailing incomplete chunk

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const rawJson = line.slice(6).trim();
        if (!rawJson) continue;

        try {
          const parsed = JSON.parse(rawJson);

          if (parsed.type === "session_meta" && parsed.session_id) {
            currentSessionId = parsed.session_id;
            // Update sidebar session title from first message
            if (!activeChatTitle.textContent || activeChatTitle.textContent === "New Conversation") {
              const snippet = text.split(" ").slice(0, 5).join(" ");
              activeChatTitle.textContent = snippet;
            }
          }

          if (parsed.chunk) {
            accumulatedText += parsed.chunk;
            // Render partial markdown with active typing cursor
            placeholder.contentDiv.innerHTML = marked.parse(accumulatedText) + '<span class="typing-cursor"></span>';
            chatFeed.scrollTop = chatFeed.scrollHeight;
          }

          if (parsed.done) {
            finalProvider = parsed.provider || "";
            finalModel = parsed.model || "";
          }

          if (parsed.error) {
            throw new Error(parsed.error);
          }
        } catch (jsonErr) {
          console.warn("SSE JSON Parse error:", jsonErr);
        }
      }
    }

    // Finalize assistant message with complete Markdown & actions
    placeholder.row.remove();
    appendMessage("bot", accumulatedText, {
      model: finalModel,
      provider: finalProvider
    });

    // Refresh sessions list
    await loadSessions();

  } catch (err) {
    placeholder.row.remove();
    appendMessage(
      "bot",
      `⚠️ **Connection Error:** ${err.message || "Failed to stream AI response."}`,
      { lastUserPrompt: text },
      true
    );
  } finally {
    isStreaming = false;
    sendBtn.disabled = false;
    streamIndicator.classList.add("hidden");
    messageInput.focus();
  }
});

// -------------------------------------------------------------
// Voice Input (Speech-to-Text via Web Speech API)
// -------------------------------------------------------------
function initVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    if (voiceBtn) {
      voiceBtn.title = "Voice input is not supported in this browser";
      voiceBtn.style.opacity = "0.5";
    }
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
    charCounter.textContent = `${transcript.length} / 4000`;
  };

  recognition.onerror = (event) => {
    console.error("Speech Recognition Error:", event.error);
    stopRecording();
    showToast(`Voice Error: ${event.error}`);
  };

  recognition.onend = () => {
    stopRecording();
  };

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
// Voice Output (Text-to-Speech via Web Speech API)
// -------------------------------------------------------------
function toggleSpeech(text, btnElement) {
  if (!window.speechSynthesis) {
    showToast("Text-to-speech not supported in this browser.");
    return;
  }

  // If already speaking from this button, stop
  if (window.speechSynthesis.speaking && activeSpeakerBtn === btnElement) {
    stopSpeech();
    return;
  }

  stopSpeech();

  // Strip markdown formatting for cleaner speech
  const cleanText = text
    .replace(/```[\s\S]*?```/g, "Code block omitted.")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~#>]/g, "")
    .trim();

  currentSpeechUtterance = new SpeechSynthesisUtterance(cleanText);
  currentSpeechUtterance.rate = 1.0;
  currentSpeechUtterance.pitch = 1.0;

  activeSpeakerBtn = btnElement;
  btnElement.classList.add("active-speaker");
  btnElement.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="6" y="4" width="4" height="16"></rect>
      <rect x="14" y="4" width="4" height="16"></rect>
    </svg>
    Pause
  `;

  currentSpeechUtterance.onend = () => {
    stopSpeech();
  };

  currentSpeechUtterance.onerror = () => {
    stopSpeech();
  };

  window.speechSynthesis.speak(currentSpeechUtterance);
}

function stopSpeech() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  if (activeSpeakerBtn) {
    activeSpeakerBtn.classList.remove("active-speaker");
    activeSpeakerBtn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
      </svg>
      Speak
    `;
    activeSpeakerBtn = null;
  }
}

// -------------------------------------------------------------
// Export Conversation
// -------------------------------------------------------------
if (exportBtn && exportMenu) {
  exportBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle("hidden");
  });

  document.addEventListener("click", () => {
    exportMenu.classList.add("hidden");
  });

  exportMdBtn.addEventListener("click", () => {
    if (!currentSessionId) {
      showToast("Start a conversation first before exporting.");
      return;
    }
    window.location.href = `/api/export/${currentSessionId}?format=markdown`;
    showToast("Exporting Markdown transcript...");
  });

  exportJsonBtn.addEventListener("click", () => {
    if (!currentSessionId) {
      showToast("Start a conversation first before exporting.");
      return;
    }
    window.location.href = `/api/export/${currentSessionId}?format=json`;
    showToast("Exporting JSON transcript...");
  });
}

// -------------------------------------------------------------
// Input Utilities & Event Handlers
// -------------------------------------------------------------
messageInput.addEventListener("input", function () {
  this.style.height = "auto";
  this.style.height = Math.min(this.scrollHeight, 180) + "px";
  charCounter.textContent = `${this.value.length} / 4000`;
});

messageInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (messageInput.value.trim() && !sendBtn.disabled) {
      chatForm.dispatchEvent(new Event("submit"));
    }
  }
});

// Persona Change
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

// Sidebar Mobile Toggle
if (toggleSidebarBtn) {
  toggleSidebarBtn.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });
}

// Quick Prompt Chips
document.addEventListener("click", function (e) {
  const chip = e.target.closest(".chip");
  if (chip) {
    const prompt = chip.getAttribute("data-prompt");
    if (prompt) {
      messageInput.value = prompt;
      charCounter.textContent = `${prompt.length} / 4000`;
      chatForm.dispatchEvent(new Event("submit"));
    }
  }
});

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// -------------------------------------------------------------
// App Initialization
// -------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  initVoiceInput();
  await checkBackendStatus();
  await loadSessions();
  messageInput.focus();
});
