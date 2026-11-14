
/* ==========================================================
   ASTRA HEALTH 360 — MISSION COMMUNICATIONS

   Features:
   - Send mission messages
   - Select communication channels
   - Load saved message history
   - Search messages
   - Refresh communication records
   - Automatic history refresh

   NOTE:
   Messages are stored by the Flask backend.
   This is not a real radio or satellite communication system.
   ========================================================== */

(() => {
    "use strict";

    const API = "/api/messages";
    const REFRESH_INTERVAL = 20000;
    const MAX_MESSAGE_LENGTH = 2000;

    const el = {
        form: document.getElementById("message-form"),
        channel: document.getElementById("message-channel"),
        message: document.getElementById("message-text"),
        submit: document.getElementById("send-message"),
        feedback: document.getElementById("message-feedback"),
        count: document.getElementById("message-count"),
        list: document.getElementById("message-list"),
        refresh: document.getElementById("refresh-messages"),
        search: document.getElementById("message-search"),
        characterCount: document.getElementById("message-character-count")
    };

    let messages = [];
    let sending = false;
    let loading = false;
    let refreshTimer = null;

    // ----------------------------------------------------------
    // HELPERS
    // ----------------------------------------------------------

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[char]);
    }

    function showFeedback(message, type = "info") {
        if (!el.feedback) return;

        el.feedback.textContent = message;
        el.feedback.className = `message-feedback ${type}`;
        el.feedback.setAttribute("role", "status");
        el.feedback.setAttribute("aria-live", "polite");
    }

    function formatDate(value) {
        if (!value) return "Time unavailable";

        const date = new Date(value);

        return Number.isNaN(date.getTime())
            ? String(value)
            : date.toLocaleString();
    }

    function timestampOf(message) {
        const value =
            message.created_at ||
            message.timestamp ||
            message.date;

        if (!value) return null;

        const timestamp = new Date(value).getTime();

        return Number.isFinite(timestamp)
            ? timestamp
            : null;
    }

    function sortNewestFirst(records) {
        return [...records].sort((a, b) => {
            const timeA = timestampOf(a);
            const timeB = timestampOf(b);

            if (timeA === null && timeB === null) return 0;
            if (timeA === null) return 1;
            if (timeB === null) return -1;

            return timeB - timeA;
        });
    }

    function getMessageText(message) {
        return String(
            message.message ??
            message.content ??
            message.text ??
            ""
        );
    }

    function getArray(data) {
        if (Array.isArray(data)) return data;

        if (!data || typeof data !== "object") {
            return [];
        }

        for (const key of [
            "messages",
            "records",
            "communications",
            "data"
        ]) {
            if (Array.isArray(data[key])) {
                return data[key];
            }
        }

        return [];
    }

    // ----------------------------------------------------------
    // API REQUEST
    // ----------------------------------------------------------

    async function apiRequest(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: {
                Accept: "application/json",
                ...(options.body
                    ? { "Content-Type": "application/json" }
                    : {}),
                ...(options.headers || {})
            }
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                data.error ||
                data.message ||
                `Communication request failed (${response.status}).`
            );
        }

        return data;
    }

    // ----------------------------------------------------------
    // CHARACTER COUNTER
    // ----------------------------------------------------------

    function updateCharacterCount() {
        if (!el.message || !el.characterCount) return;

        const length = el.message.value.length;

        el.characterCount.textContent =
            `${length}/${MAX_MESSAGE_LENGTH}`;

        if (length > MAX_MESSAGE_LENGTH) {
            el.characterCount.classList.add("limit-exceeded");
        } else {
            el.characterCount.classList.remove("limit-exceeded");
        }
    }

    // ----------------------------------------------------------
    // SEARCH
    // ----------------------------------------------------------

    function getFilteredMessages() {
        const query = String(el.search?.value || "")
            .trim()
            .toLowerCase();

        if (!query) return messages;

        return messages.filter(message => {
            const sender = String(
                message.sender || "Mission Control"
            ).toLowerCase();

            const channel = String(
                message.channel || "General"
            ).toLowerCase();

            const content = getMessageText(message)
                .toLowerCase();

            return (
                sender.includes(query) ||
                channel.includes(query) ||
                content.includes(query)
            );
        });
    }

    // ----------------------------------------------------------
    // STATISTICS
    // ----------------------------------------------------------

    function renderStatistics() {
        if (el.count) {
            el.count.textContent = messages.length;
        }
    }

    // ----------------------------------------------------------
    // RENDER MESSAGES
    // ----------------------------------------------------------

    function renderMessages() {
        if (!el.list) return;

        const filtered = sortNewestFirst(
            getFilteredMessages()
        );

        if (!filtered.length) {
            const hasSearch = Boolean(
                el.search?.value.trim()
            );

            el.list.innerHTML = `
                <div class="empty-state"
                     style="padding:24px;text-align:center;">

                    <div style="font-size:32px;">📡</div>

                    <strong>
                        ${hasSearch
                            ? "No matching messages found"
                            : "No mission messages yet"}
                    </strong>

                    <p>
                        ${hasSearch
                            ? "Try a different search term."
                            : "Send the first message to begin the communication log."}
                    </p>

                </div>
            `;

            return;
        }

        el.list.innerHTML = filtered.map(message => {
            const sender = message.sender || "Mission Control";
            const channel = message.channel || "General";
            const content = getMessageText(message);

            return `
                <article class="mission-message-card">

                    <div class="mission-message-header">

                        <strong>${escapeHTML(sender)}</strong>

                        <span class="message-channel">
                            ${escapeHTML(channel)}
                        </span>

                    </div>

                    <p>${escapeHTML(content)}</p>

                    <small>
                        ${escapeHTML(formatDate(
                            message.created_at ||
                            message.timestamp ||
                            message.date
                        ))}
                    </small>

                </article>
            `;
        }).join("");
    }

    // ----------------------------------------------------------
    // LOAD MESSAGE HISTORY
    // ----------------------------------------------------------

    async function loadMessages(options = {}) {
        if (loading) return;

        loading = true;

        const originalRefreshText = el.refresh?.textContent;

        if (el.refresh && options.manual) {
            el.refresh.disabled = true;
            el.refresh.textContent = "Refreshing...";
        }

        try {
            const result = await apiRequest(API);

            const loadedMessages = getArray(result);

            messages = loadedMessages.filter(message =>
                message && typeof message === "object"
            );

            renderStatistics();
            renderMessages();

            if (options.manual) {
                showFeedback(
                    "Communication history refreshed.",
                    "success"
                );
            }

        } catch (error) {
            console.error(
                "Message loading error:",
                error
            );

            if (el.list) {
                el.list.innerHTML = `
                    <div class="empty-state" style="padding:20px;">
                        <strong>Unable to load communication history.</strong>
                        <p>Check your Flask server and try again.</p>
                    </div>
                `;
            }

            if (el.count) {
                el.count.textContent = "0";
            }

            showFeedback(error.message, "error");

        } finally {
            loading = false;

            if (el.refresh) {
                el.refresh.disabled = false;
                el.refresh.textContent =
                    originalRefreshText || "Refresh";
            }
        }
    }

    // ----------------------------------------------------------
    // SEND MESSAGE
    // ----------------------------------------------------------

    async function sendMessage(event) {
        event.preventDefault();

        if (sending) return;

        if (!el.message) {
            showFeedback(
                "Message input field was not found.",
                "error"
            );
            return;
        }

        const channel = el.channel?.value || "General";
        const message = el.message.value.trim();

        if (!message) {
            showFeedback(
                "Please enter a message.",
                "error"
            );
            el.message.focus();
            return;
        }

        if (message.length > MAX_MESSAGE_LENGTH) {
            showFeedback(
                `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`,
                "error"
            );
            return;
        }

        sending = true;

        const originalButtonText =
            el.submit?.textContent;

        if (el.submit) {
            el.submit.disabled = true;
            el.submit.textContent = "Sending...";
        }

        try {
            await apiRequest(API, {
                method: "POST",
                body: JSON.stringify({
                    channel,
                    message,
                    sender: "Mission Control"
                })
            });

            el.message.value = "";
            updateCharacterCount();

            showFeedback(
                "Message saved to the mission communication log.",
                "success"
            );

            await loadMessages();

        } catch (error) {
            console.error(
                "Message sending error:",
                error
            );

            showFeedback(error.message, "error");

        } finally {
            sending = false;

            if (el.submit) {
                el.submit.disabled = false;
                el.submit.textContent =
                    originalButtonText || "Send Message";
            }
        }
    }

    // ----------------------------------------------------------
    // INITIALIZATION
    // ----------------------------------------------------------

    function initialize() {
        el.form?.addEventListener(
            "submit",
            sendMessage
        );

        el.refresh?.addEventListener(
            "click",
            () => loadMessages({ manual: true })
        );

        el.search?.addEventListener(
            "input",
            renderMessages
        );

        el.message?.addEventListener(
            "input",
            updateCharacterCount
        );

        updateCharacterCount();

        loadMessages();

        refreshTimer = window.setInterval(
            () => loadMessages(),
            REFRESH_INTERVAL
        );
    }

    document.addEventListener(
        "DOMContentLoaded",
        initialize,
        { once: true }
    );

    // ----------------------------------------------------------
    // CLEANUP
    // ----------------------------------------------------------

    window.addEventListener("beforeunload", () => {
        if (refreshTimer !== null) {
            window.clearInterval(refreshTimer);
        }
    });

})();
