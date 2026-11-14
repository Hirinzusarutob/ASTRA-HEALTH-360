
/* ==========================================================
   ASTRA HEALTH 360 — CREW WELLNESS MODULE
   Features:
   - Load crew members
   - Daily mood check-ins
   - Save optional wellness notes
   - Display wellness history
   - Simple supportive wellness suggestions
   ========================================================== */

(() => {
    "use strict";

    const API = {
        crew: "/api/crew",
        wellness: "/api/wellness"
    };

    const el = {
        form: document.getElementById("wellness-form"),
        crew: document.getElementById("wellness-crew"),
        mood: document.getElementById("wellness-mood"),
        notes: document.getElementById("wellness-notes"),
        submit: document.getElementById("wellness-submit"),
        feedback: document.getElementById("wellness-feedback"),
        history: document.getElementById("wellness-history")
    };

    let crewMembers = [];
    let checkIns = [];
    let saving = false;

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[char]);
    }

    async function apiRequest(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {})
            }
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || data.message || "Request failed.");
        }

        return data;
    }

    function getArray(data, keys) {
        if (Array.isArray(data)) return data;

        for (const key of keys) {
            if (Array.isArray(data?.[key])) return data[key];
        }

        return [];
    }

    function showFeedback(message, type = "info") {
        if (!el.feedback) return;

        el.feedback.textContent = message;
        el.feedback.className = `wellness-feedback ${type}`;
        el.feedback.setAttribute("role", "status");
    }

    function loadCrewOptions() {
        if (!el.crew) return;

        if (!crewMembers.length) {
            el.crew.innerHTML = `
                <option value="">No crew members available</option>
            `;
            return;
        }

        const previousValue = el.crew.value;

        el.crew.innerHTML = `
            <option value="">Select astronaut</option>
            ${crewMembers.map(member => `
                <option value="${escapeHTML(member.id)}">
                    ${escapeHTML(member.name || "Unnamed astronaut")}
                </option>
            `).join("")}
        `;

        if (crewMembers.some(member =>
            String(member.id) === previousValue
        )) {
            el.crew.value = previousValue;
        }
    }

    function formatDate(value) {
        if (!value) return "Date unavailable";

        const date = new Date(value);

        return Number.isNaN(date.getTime())
            ? String(value)
            : date.toLocaleString();
    }

    function getMoodIcon(mood) {
        const value = String(mood || "").toLowerCase();

        if (value.includes("excellent") || value.includes("happy")) return "😊";
        if (value.includes("good")) return "🙂";
        if (value.includes("okay") || value.includes("neutral")) return "😐";
        if (value.includes("stress") || value.includes("anxious")) return "😟";
        if (value.includes("low") || value.includes("sad")) return "😔";

        return "🧑‍🚀";
    }

    function renderHistory() {
        if (!el.history) return;

        if (!checkIns.length) {
            el.history.innerHTML = `
                <div class="empty-state" style="padding:22px;text-align:center;">
                    <div style="font-size:30px;">🌱</div>
                    <strong>No wellness check-ins yet</strong>
                    <p>Record the first crew wellness check-in.</p>
                </div>
            `;
            return;
        }

        const sorted = [...checkIns].sort((a, b) =>
            new Date(b.created_at || b.timestamp || 0) -
            new Date(a.created_at || a.timestamp || 0)
        );

        el.history.innerHTML = sorted.map(item => {
            const member = crewMembers.find(person =>
                String(person.id) === String(item.crew_id)
            );

            const name = member?.name ||
                `Crew member #${item.crew_id ?? "Unknown"}`;

            return `
                <article class="wellness-history-card">
                    <div class="wellness-history-icon">
                        ${getMoodIcon(item.mood)}
                    </div>

                    <div class="wellness-history-content">
                        <strong>${escapeHTML(name)}</strong>
                        <p>
                            Mood:
                            ${escapeHTML(item.mood || "Not specified")}
                        </p>

                        ${
                            item.notes
                            ? `<p>${escapeHTML(item.notes)}</p>`
                            : ""
                        }

                        <small>
                            ${escapeHTML(formatDate(
                                item.created_at || item.timestamp
                            ))}
                        </small>
                    </div>
                </article>
            `;
        }).join("");
    }

    async function loadData() {
        try {
            const [crewResult, wellnessResult] = await Promise.all([
                apiRequest(API.crew),
                apiRequest(API.wellness)
            ]);

            crewMembers = getArray(crewResult, [
                "crew", "members", "records", "data"
            ]);

            checkIns = getArray(wellnessResult, [
                "checkins", "wellness", "records", "data"
            ]);

            loadCrewOptions();
            renderHistory();

        } catch (error) {
            console.error("Wellness loading error:", error);
            showFeedback(error.message, "error");
        }
    }

    async function saveCheckIn(event) {
        event.preventDefault();

        if (saving) return;

        const crewId = el.crew?.value;
        const mood = el.mood?.value;
        const notes = el.notes?.value.trim() || "";

        if (!crewId) {
            showFeedback("Please select an astronaut.", "error");
            return;
        }

        if (!mood) {
            showFeedback("Please select a mood.", "error");
            return;
        }

        saving = true;

        if (el.submit) {
            el.submit.disabled = true;
            el.submit.textContent = "Saving...";
        }

        try {
            await apiRequest(API.wellness, {
                method: "POST",
                body: JSON.stringify({
                    crew_id: Number(crewId),
                    mood,
                    notes
                })
            });

            el.notes.value = "";
            showFeedback(
                "Wellness check-in saved successfully.",
                "success"
            );

            await loadData();

        } catch (error) {
            console.error("Wellness save error:", error);
            showFeedback(error.message, "error");

        } finally {
            saving = false;

            if (el.submit) {
                el.submit.disabled = false;
                el.submit.textContent = "Save Check-in";
            }
        }
    }

    function initialize() {
        el.form?.addEventListener("submit", saveCheckIn);

        loadData();

        // Refresh wellness history every 30 seconds.
        window.setInterval(loadData, 30000);
    }

    document.addEventListener("DOMContentLoaded", initialize);
})();
