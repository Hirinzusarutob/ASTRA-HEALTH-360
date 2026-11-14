
/* =========================================================
   ASTRA HEALTH 360 — CREW MANAGEMENT
   Features:
   - Load astronaut profiles from Flask backend
   - Add new crew members
   - Search and filter crew
   - Display crew statistics
   - Show mission status and profile details
   ========================================================= */

(() => {
    "use strict";

    const API_URL = "/api/crew";

    const elements = {
        form: document.getElementById("crew-form"),
        name: document.getElementById("crew-name"),
        role: document.getElementById("crew-role"),
        status: document.getElementById("crew-status"),
        notes: document.getElementById("crew-notes"),
        search: document.getElementById("crew-search"),
        list: document.getElementById("crew-list"),
        total: document.getElementById("crew-count"),
        active: document.getElementById("active-crew-count"),
        standby: document.getElementById("standby-crew-count"),
        feedback: document.getElementById("crew-feedback"),
        submit: document.getElementById("add-crew-button")
    };

    let crewMembers = [];
    let isSaving = false;

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[character]);
    }

    function showFeedback(message, type = "info") {
        if (!elements.feedback) return;

        elements.feedback.textContent = message;
        elements.feedback.className = `crew-feedback ${type}`;
        elements.feedback.setAttribute("role", "status");
    }

    async function request(url, options = {}) {
        const response = await fetch(url, {
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {})
            },
            ...options
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(result.error || result.message || "Request failed.");
        }

        return result;
    }

    function getCrewArray(result) {
        if (Array.isArray(result)) return result;

        return (
            result.crew ||
            result.members ||
            result.records ||
            result.data ||
            []
        );
    }

    function normalizeStatus(status) {
        const value = String(status || "Active").toLowerCase();

        if (value.includes("standby")) return "Standby";
        if (value.includes("inactive")) return "Inactive";
        if (value.includes("critical")) return "Critical";

        return "Active";
    }

    function renderStatistics() {
        const total = crewMembers.length;

        const active = crewMembers.filter(member =>
            normalizeStatus(member.status) === "Active"
        ).length;

        const standby = crewMembers.filter(member =>
            normalizeStatus(member.status) === "Standby"
        ).length;

        if (elements.total) elements.total.textContent = total;
        if (elements.active) elements.active.textContent = active;
        if (elements.standby) elements.standby.textContent = standby;
    }

    function renderCrew() {
        if (!elements.list) return;

        const searchTerm = (elements.search?.value || "")
            .trim()
            .toLowerCase();

        const filtered = crewMembers.filter(member => {
            const searchableText = [
                member.name,
                member.role,
                member.status,
                member.notes
            ].join(" ").toLowerCase();

            return searchableText.includes(searchTerm);
        });

        if (!filtered.length) {
            elements.list.innerHTML = `
                <tr>
                    <td colspan="6" class="empty-state">
                        <div style="padding:24px;text-align:center;">
                            <div style="font-size:30px;">👨‍🚀</div>
                            <strong>No crew members found</strong>
                            <p>Try another search or add a crew member.</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        elements.list.innerHTML = filtered.map((member, index) => {
            const status = normalizeStatus(member.status);

            const statusClass = status.toLowerCase();

            return `
                <tr>
                    <td>${index + 1}</td>
                    <td>
                        <strong>${escapeHTML(member.name || "Unnamed crew member")}</strong>
                    </td>
                    <td>${escapeHTML(member.role || "Crew member")}</td>
                    <td>
                        <span class="status-badge ${statusClass}">
                            ${escapeHTML(status)}
                        </span>
                    </td>
                    <td>${escapeHTML(member.notes || "No additional details")}</td>
                    <td>
                        <button
                            type="button"
                            class="crew-view-button"
                            data-crew-id="${escapeHTML(member.id)}">
                            View
                        </button>
                    </td>
                </tr>
            `;
        }).join("");
    }

    async function loadCrew() {
        if (elements.list) {
            elements.list.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center;padding:20px;">
                        Loading crew records...
                    </td>
                </tr>
            `;
        }

        try {
            const result = await request(API_URL);
            crewMembers = getCrewArray(result);

            renderStatistics();
            renderCrew();

        } catch (error) {
            console.error("Crew loading error:", error);

            if (elements.list) {
                elements.list.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align:center;padding:20px;">
                            Unable to load crew records.
                            Check that the Flask server is running.
                        </td>
                    </tr>
                `;
            }

            showFeedback(error.message, "error");
        }
    }

    async function addCrewMember(event) {
        event.preventDefault();

        if (isSaving) return;

        const name = elements.name?.value.trim();
        const role = elements.role?.value.trim();
        const status = elements.status?.value || "Active";
        const notes = elements.notes?.value.trim() || "";

        if (!name || !role) {
            showFeedback("Please enter the crew member's name and role.", "error");
            return;
        }

        isSaving = true;

        if (elements.submit) {
            elements.submit.disabled = true;
            elements.submit.textContent = "Adding...";
        }

        try {
            await request(API_URL, {
                method: "POST",
                body: JSON.stringify({
                    name,
                    role,
                    status,
                    notes
                })
            });

            elements.form.reset();

            showFeedback(
                "Crew member successfully added to the mission database.",
                "success"
            );

            await loadCrew();

        } catch (error) {
            console.error("Crew save error:", error);
            showFeedback(error.message, "error");

        } finally {
            isSaving = false;

            if (elements.submit) {
                elements.submit.disabled = false;
                elements.submit.textContent = "Add Crew Member";
            }
        }
    }

    function showCrewDetails(id) {
        const member = crewMembers.find(item =>
            String(item.id) === String(id)
        );

        if (!member) return;

        const details = [
            `Name: ${member.name || "Not available"}`,
            `Role: ${member.role || "Not available"}`,
            `Status: ${normalizeStatus(member.status)}`,
            `Notes: ${member.notes || "No additional details"}`
        ].join("\n");

        window.alert(details);
    }

    function addEventListeners() {
        elements.form?.addEventListener("submit", addCrewMember);

        elements.search?.addEventListener("input", renderCrew);

        elements.list?.addEventListener("click", event => {
            const button = event.target.closest("[data-crew-id]");

            if (!button) return;

            showCrewDetails(button.dataset.crewId);
        });
    }

    function initialize() {
        addEventListeners();
        loadCrew();

        // Refresh crew records periodically.
        window.setInterval(loadCrew, 30000);
    }

    document.addEventListener("DOMContentLoaded", initialize);
})();
