
document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const $ = id => document.getElementById(id);

    const elements = {
        messages: $("chat-messages"),
        form: $("assistant-form"),
        input: $("user-message"),
        send: $("send-button"),
        status: $("assistant-status"),
        speakToggle: $("speak-toggle"),
        stopSpeaking: $("stop-speaking")
    };

    const conversationHistory = [];
    const MAX_HISTORY = 12;

    let sending = false;

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[char]);
    }

    function addMessage(role, message) {
        if (!elements.messages) return;

        const messageElement = document.createElement("div");

        messageElement.className =
            role === "user" ? "user-message" : "assistant-message";

        messageElement.innerHTML = `
            <div class="message-content">
                ${escapeHTML(message).replace(/\n/g, "<br>")}
            </div>
        `;

        elements.messages.appendChild(messageElement);
        elements.messages.scrollTop = elements.messages.scrollHeight;
    }

    function updateStatus(message) {
        if (elements.status) {
            elements.status.textContent = message;
        }
    }

    function setSending(value) {
        sending = value;

        if (elements.send) {
            elements.send.disabled = value;
            elements.send.textContent = value ? "Thinking..." : "Send";
        }

        if (elements.input) {
            elements.input.disabled = value;
        }
    }

    async function askAstra(question) {
        const response = await fetch("/api/assistant", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                question,
                conversation_history: conversationHistory.slice(-MAX_HISTORY)
            })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                data.error || data.message ||
                `Assistant request failed (${response.status})`
            );
        }

        const answer =
            data.response ||
            data.answer ||
            data.message ||
            data.reply;

        if (!answer) {
            throw new Error("The assistant returned an empty response.");
        }

        return String(answer);
    }

    function speakAnswer(text) {
        if (!("speechSynthesis" in window)) return;

        if (elements.speakToggle && !elements.speakToggle.checked) {
            return;
        }

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

        conversationHistory.push({
            role: "user",
            content: question
        });

        elements.input.value = "";
        setSending(true);
        updateStatus("ASTRA is thinking...");

        try {
            const answer = await askAstra(question);

            addMessage("assistant", answer);

            conversationHistory.push({
                role: "assistant",
                content: answer
            });

            while (conversationHistory.length > MAX_HISTORY) {
                conversationHistory.shift();
            }

            updateStatus("ASTRA is ready.");
            speakAnswer(answer);

        } catch (error) {
            console.error("ASTRA assistant error:", error);

            const message =
                `I could not connect to the AI assistant. ${error.message}`;

            addMessage("assistant", message);
            updateStatus("AI connection unavailable.");

        } finally {
            setSending(false);
            elements.input?.focus();
        }
    }

    elements.form?.addEventListener("submit", sendMessage);

    // One-tap mission prompts help new users explore the assistant.
    document.querySelectorAll("[data-prompt]").forEach(button => {
        button.addEventListener("click", () => {
            if (!elements.input || sending) return;
            elements.input.value = button.dataset.prompt || "";
            elements.input.focus();
            elements.input.dispatchEvent(new Event("input", { bubbles: true }));
        });
    });

    elements.stopSpeaking?.addEventListener("click", () => {
        if ("speechSynthesis" in window) {
            window.speechSynthesis.cancel();
        }

        updateStatus("Voice playback stopped.");
    });

    if (!("speechSynthesis" in window) && elements.speakToggle) {
        elements.speakToggle.disabled = true;
    }

    updateStatus("ASTRA assistant ready.");
});
