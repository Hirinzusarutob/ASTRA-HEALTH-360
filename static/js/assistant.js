document.addEventListener("DOMContentLoaded", () => {
    "use strict";
    const $ = id => document.getElementById(id);
    const elements = {
        messages: $("chat-messages"), form: $("assistant-form"),
        input: $("user-message"), send: $("send-button"),
        status: $("assistant-status"), speakToggle: $("speak-toggle"),
        stopSpeaking: $("stop-speaking")
    };
    const conversationHistory = [];
    const MAX_HISTORY = 12;
    const MAX_SENT_HISTORY = 10;
    let sending = false;

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[char]);
    }

    function addMessage(role, message) {
        if (!elements.messages) return;
        const messageElement = document.createElement("div");
        messageElement.className = role === "user" ? "user-message" : "assistant-message";
        messageElement.innerHTML = `<div class="message-content">${escapeHTML(message).replace(/\n/g, "<br>")}</div>`;
        elements.messages.appendChild(messageElement);
        elements.messages.scrollTop = elements.messages.scrollHeight;
    }

    function updateStatus(message) {
        if (elements.status) elements.status.textContent = message;
    }

    function setSending(value) {
        sending = value;
        if (elements.send) {
            elements.send.disabled = value;
            elements.send.textContent = value ? "Thinking..." : "Send";
        }
        if (elements.input) elements.input.disabled = value;
    }

    async function askAstra(question) {
        const previousMessages = conversationHistory.slice(0, -1).slice(-MAX_SENT_HISTORY);
        const response = await fetch("/api/assistant", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question, conversation_history: previousMessages })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || data.message || `Assistant request failed (${response.status})`);
        }
        const answer = data.answer || data.response || data.message || data.reply;
        if (!answer) throw new Error("The assistant returned an empty response.");
        return { answer: String(answer), copilot: data.copilot || {} };
    }

    function speakAnswer(text) {
        if (!("speechSynthesis" in window)) return;
        if (elements.speakToggle && !elements.speakToggle.checked) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "en-IN";
        utterance.rate = 1;
        utterance.pitch = 1;
        window.speechSynthesis.speak(utterance);
    }

    async function sendMessage(event) {
        event.preventDefault();
        if (sending) return;
        const question = elements.input?.value.trim();
        if (!question) {
            updateStatus("Please enter a message first.");
            return;
        }
        addMessage("user", question);
        conversationHistory.push({ role: "user", content: question });
        elements.input.value = "";
        setSending(true);
        updateStatus("ASTRA Mission Copilot is analysing mission data...");
        try {
            const result = await askAstra(question);
            addMessage("assistant", result.answer);
            conversationHistory.push({ role: "assistant", content: result.answer });
            while (conversationHistory.length > MAX_HISTORY) conversationHistory.shift();
            if (result.copilot.enabled && result.copilot.database_connected) {
                updateStatus("Mission Copilot connected • ASTRA database active");
            } else {
                updateStatus("ASTRA AI ready.");
            }
            speakAnswer(result.answer);
        } catch (error) {
            console.error("ASTRA Mission Copilot error:", error);
            addMessage("assistant", `I could not complete your request. ${error.message}`);
            updateStatus("Mission Copilot connection unavailable.");
        } finally {
            setSending(false);
            elements.input?.focus();
        }
    }

    elements.form?.addEventListener("submit", sendMessage);
    document.querySelectorAll("[data-prompt]").forEach(button => {
        button.addEventListener("click", () => {
            if (!elements.input || sending) return;
            elements.input.value = button.dataset.prompt || "";
            elements.input.focus();
            elements.input.dispatchEvent(new Event("input", { bubbles: true }));
        });
    });
    elements.stopSpeaking?.addEventListener("click", () => {
        if ("speechSynthesis" in window) window.speechSynthesis.cancel();
        updateStatus("Voice playback stopped.");
    });
    if (!("speechSynthesis" in window) && elements.speakToggle) {
        elements.speakToggle.disabled = true;
    }
    updateStatus("ASTRA Mission Copilot ready.");
});