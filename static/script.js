/**
 * AI Chatbot - Frontend Script
 * XICTEK Systems Internship Day 1 Task
 */

// Conversation history state (Array of { role: 'user' | 'assistant', content: string })
let conversationHistory = [];

// System Persona Presets
const personaPrompts = {
  helpful: "You are a helpful, knowledgeable, and polite AI assistant. Provide clear, accurate, and structured answers using markdown when appropriate.",
  coder: "You are an expert full-stack software engineer. Provide concise, clean, and bug-free code examples with explanatory markdown comments.",
  concise: "You are a direct, concise AI assistant. Answer questions in the minimum number of words necessary without fluff.",
  creative: "You are an imaginative, creative thinking assistant. Provide engaging, expressive, and thought-provoking responses.",
  custom: ""
};

// DOM Elements
const chatFeed = document.getElementById("chatFeed");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const welcomeScreen = document.getElementById("welcomeScreen");
const newChatBtn = document.getElementById("newChatBtn");
const clearChatBtn = document.getElementById("clearChatBtn");
const personaSelect = document.getElementById("personaSelect");
const customPromptContainer = document.getElementById("customPromptContainer");
const customPromptInput = document.getElementById("customPromptInput");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const activeModelLabel = document.getElementById("activeModelLabel");
const toggleSidebarBtn = document.getElementById("toggleSidebarBtn");
const sidebar = document.querySelector(".sidebar");

// Configure Markdown Parser
if (typeof marked !== "undefined") {
  marked.setOptions({
    breaks: true,
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

// Fetch backend status on startup
async function checkBackendStatus() {
  try {
    const res = await fetch("/api/status");
    if (!res.ok) throw new Error("Status endpoint failed");
    const data = await res.json();

    statusDot.classList.add("online");
    statusText.textContent = `${data.provider}`;
    activeModelLabel.textContent = `Provider: ${data.provider} • Model: ${data.model}`;

    if (!data.is_live_key_configured) {
      statusText.textContent = "Demo Mode (Add key in .env)";
    }
  } catch (err) {
    statusDot.classList.remove("online");
    statusDot.style.backgroundColor = "#ef4444";
    statusText.textContent = "Backend Offline";
    activeModelLabel.textContent = "Failed to connect to backend";
  }
}

// Get active system prompt
function getActiveSystemPrompt() {
  const selected = personaSelect.value;
  if (selected === "custom") {
    return customPromptInput.value.trim() || personaPrompts.helpful;
  }
  return personaPrompts[selected] || personaPrompts.helpful;
}

// Auto-expand textarea
messageInput.addEventListener("input", function () {
  this.style.height = "auto";
  this.style.height = Math.min(this.scrollHeight, 180) + "px";
});

// Handle Shift+Enter for newline, Enter to submit
messageInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (messageInput.value.trim() && !sendBtn.disabled) {
      chatForm.dispatchEvent(new Event("submit"));
    }
  }
});

// Persona change handler
personaSelect.addEventListener("change", function () {
  if (this.value === "custom") {
    customPromptContainer.classList.remove("hidden");
  } else {
    customPromptContainer.classList.add("hidden");
  }
});

// Mobile Sidebar Toggle
if (toggleSidebarBtn) {
  toggleSidebarBtn.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });
}

// Handle Form Submission
chatForm.addEventListener("submit", async function (e) {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;

  // Hide welcome screen
  if (welcomeScreen) {
    welcomeScreen.style.display = "none";
  }

  // Append user message to UI
  appendMessage("user", text);

  // Clear input
  messageInput.value = "";
  messageInput.style.height = "auto";
  messageInput.disabled = true;
  sendBtn.disabled = true;

  // Append loading animation
  const loadingElement = appendLoadingIndicator();

  try {
    const payload = {
      message: text,
      history: conversationHistory,
      system_prompt: getActiveSystemPrompt()
    };

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    loadingElement.remove();

    if (!res.ok) {
      const errorMsg = data.details || data.error || "Failed to reach AI service.";
      appendMessage("bot", `⚠️ **Error:** ${errorMsg}`, true);
      return;
    }

    // Save to conversation history
    conversationHistory.push({ role: "user", content: text });
    conversationHistory.push({ role: "assistant", content: data.reply });

    // Render AI Reply with Markdown
    appendMessage("bot", data.reply);

  } catch (err) {
    if (loadingElement) loadingElement.remove();
    appendMessage("bot", `⚠️ **Network Error:** Could not connect to chatbot server. (${err.message})`, true);
  } finally {
    messageInput.disabled = false;
    sendBtn.disabled = false;
    messageInput.focus();
  }
});

// Append a chat message row to the feed
function appendMessage(role, rawContent, isError = false) {
  const row = document.createElement("div");
  row.className = `message-row ${role === "user" ? "user-row" : "bot-row"}`;

  const avatar = document.createElement("div");
  avatar.className = `avatar ${role === "user" ? "user-avatar" : "bot-avatar"}`;
  avatar.textContent = role === "user" ? "👤" : "🤖";

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";
  if (isError) contentDiv.style.borderColor = "var(--error-color)";

  if (role === "user") {
    contentDiv.textContent = rawContent;
  } else {
    // Render Markdown for assistant
    if (typeof marked !== "undefined") {
      contentDiv.innerHTML = marked.parse(rawContent);
    } else {
      contentDiv.textContent = rawContent;
    }
  }

  row.appendChild(avatar);
  row.appendChild(contentDiv);
  chatFeed.appendChild(row);

  // Auto-scroll to bottom
  chatFeed.scrollTop = chatFeed.scrollHeight;
  return row;
}

// Append loading animation
function appendLoadingIndicator() {
  const row = document.createElement("div");
  row.className = "message-row bot-row loading-row";

  const avatar = document.createElement("div");
  avatar.className = "avatar bot-avatar";
  avatar.textContent = "🤖";

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";
  contentDiv.innerHTML = `
    <span class="dot"></span>
    <span class="dot"></span>
    <span class="dot"></span>
  `;

  row.appendChild(avatar);
  row.appendChild(contentDiv);
  chatFeed.appendChild(row);
  chatFeed.scrollTop = chatFeed.scrollHeight;
  return row;
}

// Reset / Clear Conversation
function resetChat() {
  conversationHistory = [];
  chatFeed.innerHTML = "";
  if (welcomeScreen) {
    chatFeed.appendChild(welcomeScreen);
    welcomeScreen.style.display = "flex";
  }
  messageInput.value = "";
  messageInput.focus();
}

newChatBtn.addEventListener("click", resetChat);
clearChatBtn.addEventListener("click", resetChat);

// Quick suggestion chips handler
document.addEventListener("click", function (e) {
  if (e.target && e.target.classList.contains("chip")) {
    const prompt = e.target.getAttribute("data-prompt");
    if (prompt) {
      messageInput.value = prompt;
      chatForm.dispatchEvent(new Event("submit"));
    }
  }
});

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
  checkBackendStatus();
  messageInput.focus();
});
