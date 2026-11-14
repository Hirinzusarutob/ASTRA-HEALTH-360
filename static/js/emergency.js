
/* ==========================================================
   ASTRA HEALTH 360 — EMERGENCY & ALERT MANAGEMENT
   Features:
   - Load mission alerts from Flask
   - Display alert statistics
   - Create test alerts
   - Acknowledge and resolve alerts
   - Refresh alert records
   ========================================================== */

(() => {
    "use strict";

    const API = "/api/alerts";

    const el = {
        total: document.getElementById("emergency-total"),
        active: document.getElementById("emergency-active"),
        critical: document.getElementById("emergency-critical"),
        resolved: document.getElementById("emergency-resolved"),
        create: document.getElementById("create-test-alert"),
        refresh: document.getElementById("refresh-alerts"),
        feedback: document.getElementById("emergency-feedback"),
        updated: document.getElementById("emergency-last-updated"),
        list: document.getElementById("emergency-alert-list")
    };

    let alerts = [];
    let busy = false;

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

    function getArray(data) {
        if (Array.isArray(data)) return data;

        return data.alerts || data.records || data.data || [];
    }

    function showFeedback(message, type = "info") {
        if (!el.feedback) return;

        el.feedback.textContent = message;
        el.feedback.className = `emergency-feedback ${type}`;
        el.feedback.setAttribute("role", "status");
    }

    function normalizeStatus(status) {
        const value = String(status || "Active").toLowerCase();

        if (value.includes("resolved")) return "Resolved";
        if (value.includes("acknowledged")) return "Acknowledged";

        return "Active";
    }

    function normalizeSeverity(severity) {
        const value = String(severity || "Low").toLowerCase();

        if (value === "critical") return "Critical";
        if (value === "high") return "High";
        if (value === "medium") return "Medium";

        return "Low";
    }

    function updateStatistics() {
        const total = alerts.length;

        const active = alerts.filter(alert =>
            normalizeStatus(alert.status) === "Active"
        ).length;

        const critical = alerts.filter(alert =>
            normalizeSeverity(alert.severity) === "Critical" &&
            normalizeStatus(alert.status) !== "Resolved"
        ).length;

        const resolved = alerts.filter(alert =>
            normalizeStatus(alert.status) === "Resolved"
        ).length;

        if (el.total) el.total.textContent = total;
        if (el.active) el.active.textContent = active;
        if (el.critical) el.critical.textContent = critical;
        if (el.resolved) el.resolved.textContent = resolved;
    }

    function formatDate(value) {
        if (!value) return "Time unavailable";

        const date = new Date(value);

        return Number.isNaN(date.getTime())
            ? String(value)
            : date.toLocaleString();
    }

    function renderAlerts() {
        if (!el.list) return;

        const sorted = [...alerts].sort((a, b) =>
            new Date(b.created_at || b.timestamp || 0) -
            new Date(a.created_at || a.timestamp || 0)
        );

        if (!sorted.length) {
            el.list.innerHTML = `
                <div class="empty-state" style="padding:24px;text-align:center;">
                    <div style="font-size:32px;">🛡️</div>
                    <strong>No emergency alerts recorded</strong>
                    <p>The alert centre is currently clear.</p>
                </div>
            `;
            return;
        }

        el.list.innerHTML = sorted.map(alert => {
            const severity = normalizeSeverity(alert.severity);
            const status = normalizeStatus(alert.status);

            const alertId = escapeHTML(alert.id);
            const title = alert.title || alert.alert_type || "Mission alert";
            const description =
                alert.description || alert.message || "No additional details.";

            return `
                <article class="emergency-alert-card ${severity.toLowerCase()}">
                    <div class="emergency-alert-header">
                        <strong>${escapeHTML(title)}</strong>
                        <span class="status-badge ${severity.toLowerCase()}">
                            ${severity}
                        </span>
                    </div>

                    <p>${escapeHTML(description)}</p>

                    <div class="emergency-alert-meta">
                        <span>Status: ${escapeHTML(status)}</span>
                        <span>${escapeHTML(formatDate(
                            alert.created_at || alert.timestamp
                        ))}</span>
                    </div>

                    <div class="emergency-alert-actions">
                        ${
                            status === "Active"
                            ? `<button type="button"
                                data-alert-action="acknowledged"
                                data-alert-id="${alertId}">
                                Acknowledge
                               </button>`
                            : ""
                        }

                        ${
                            status !== "Resolved"
                            ? `<button type="button"
                                data-alert-action="resolved"
                                data-alert-id="${alertId}">
                                Resolve
                               </button>`
                            : ""
                        }
                    </div>
                </article>
            `;
        }).join("");
    }

    async function loadAlerts() {
        try {
            const result = await apiRequest(API);
            alerts = getArray(result);

            updateStatistics();
            renderAlerts();

            if (el.updated) {
                el.updated.textContent =
                    `Last updated: ${new Date().toLocaleTimeString()}`;
            }

        } catch (error) {
            console.error("Alert loading error:", error);

            if (el.list) {
                el.list.innerHTML = `
                    <div class="empty-state" style="padding:20px;">
                        Unable to load alerts. Check the Flask server.
                    </div>
                `;
            }

            showFeedback(error.message, "error");
        }
    }

    async function createTestAlert() {
        if (busy) return;

        busy = true;

        if (el.create) {
            el.create.disabled = true;
            el.create.textContent = "Creating...";
        }

        try {
            await apiRequest(API, {
                method: "POST",
                body: JSON.stringify({
                    title: "Mission system test alert",
                    alert_type: "System test",
                    severity: "Medium",
                    description:
                        "Test alert created by the ASTRA HEALTH 360 operator. This is not a real emergency."
                })
            });

            showFeedback(
                "Test alert saved successfully. This is not a real emergency.",
                "success"
            );

            await loadAlerts();

        } catch (error) {
            console.error("Test alert error:", error);
            showFeedback(error.message, "error");

        } finally {
            busy = false;

            if (el.create) {
                el.create.disabled = false;
                el.create.textContent = "Create Test Alert";
            }
        }
    }

    async function updateAlertStatus(id, status) {
        try {
            await apiRequest(`${API}/${encodeURIComponent(id)}`, {
                method: "PUT",
                body: JSON.stringify({ status })
            });

            showFeedback(
                `Alert status updated to ${status}.`,
                "success"
            );

            await loadAlerts();

        } catch (error) {
            console.error("Alert update error:", error);
            showFeedback(error.message, "error");
        }
    }

    function attachEvents() {
        el.refresh?.addEventListener("click", loadAlerts);

        el.create?.addEventListener("click", createTestAlert);

        el.list?.addEventListener("click", event => {
            const button = event.target.closest("[data-alert-action]");

            if (!button) return;

            const id = button.dataset.alertId;
            const status = button.dataset.alertAction;

            if (id && status) {
                updateAlertStatus(id, status);
            }
        });
    }

    function initialize() {
        attachEvents();
        loadAlerts();

        window.setInterval(loadAlerts, 15000);
    }

    document.addEventListener("DOMContentLoaded", initialize);
})();
