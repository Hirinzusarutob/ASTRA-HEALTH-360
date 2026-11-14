
/* ASTRA HEALTH 360 — HEALTH MONITORING */

(() => {
    "use strict";

    const API = {
        health: "/api/health",
        crew: "/api/crew",
        simulate: "/api/simulation/all"
    };

    const el = {
        heart: document.getElementById("health-heart-rate"),
        oxygen: document.getElementById("health-oxygen"),
        temperature: document.getElementById("health-temperature"),
        simulate: document.getElementById("generate-health-data"),
        refresh: document.getElementById("refresh-health"),
        feedback: document.getElementById("health-feedback"),
        updated: document.getElementById("health-last-updated"),
        chart: document.getElementById("health-chart"),
        chartStatus: document.getElementById("health-chart-status"),
        table: document.getElementById("health-record-list")
    };

    let records = [];
    let crew = [];
    let busy = false;
    let loading = false;

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
            throw new Error(data.error || data.message || "Server request failed.");
        }

        return data;
    }

    function getArray(data, keys = []) {
        if (Array.isArray(data)) return data;

        for (const key of keys) {
            if (Array.isArray(data?.[key])) return data[key];
        }

        return [];
    }

    function showFeedback(message, type = "info") {
        if (!el.feedback) return;
        el.feedback.textContent = message;
        el.feedback.className = `health-feedback ${type}`;
    }

    function getCrewName(id) {
        const member = crew.find(person =>
            String(person.id) === String(id)
        );

        return member?.name || `Crew member #${id ?? "Unknown"}`;
    }

    function getDate(record) {
        return record.recorded_at ||
            record.timestamp ||
            record.created_at ||
            record.date ||
            null;
    }

    function getTime(record) {
        const value = getDate(record);
        if (!value) return "Time unavailable";

        const date = new Date(value);

        return Number.isNaN(date.getTime())
            ? String(value)
            : date.toLocaleString();
    }

    // Missing values remain null, never become zero.
    function numberValue(value) {
        if (value === null || value === undefined || value === "") {
            return null;
        }

        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }

    function latestPerCrew() {
        const latest = new Map();

        [...records]
            .sort((a, b) =>
                new Date(getDate(a) || 0) - new Date(getDate(b) || 0)
            )
            .forEach(record => {
                latest.set(String(record.crew_id), record);
            });

        return [...latest.values()];
    }

    function calculateAverage(list, field) {
        const values = list
            .map(record => numberValue(record[field]))
            .filter(value => value !== null);

        if (!values.length) return "--";

        return (
            values.reduce((sum, value) => sum + value, 0) /
            values.length
        ).toFixed(1);
    }

    function updateMetrics() {
        const latest = latestPerCrew();

        if (el.heart) {
            el.heart.textContent = calculateAverage(latest, "heart_rate");
        }

        if (el.oxygen) {
            el.oxygen.textContent = calculateAverage(latest, "oxygen_level");
        }

        if (el.temperature) {
            el.temperature.textContent = calculateAverage(latest, "temperature");
        }
    }

    // Uses the same illustrative warning thresholds as health_service.py.
    function getReviewLabel(record) {
        const heart = numberValue(record.heart_rate);
        const oxygen = numberValue(record.oxygen_level);
        const temperature = numberValue(record.temperature);

        const warning =
            (heart !== null && (heart < 50 || heart > 120)) ||
            (oxygen !== null && oxygen < 90) ||
            (temperature !== null && (temperature < 35 || temperature > 38));

        return warning
            ? { label: "Review required", css: "warning" }
            : { label: "No rule triggered", css: "normal" };
    }

    function renderRecords() {
        if (!el.table) return;

        const sorted = [...records].sort((a, b) =>
            new Date(getDate(b) || 0) - new Date(getDate(a) || 0)
        );

        if (!sorted.length) {
            el.table.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center;padding:22px;">
                        No health records available yet.
                    </td>
                </tr>
            `;
            return;
        }

        el.table.innerHTML = sorted.slice(0, 100).map(record => {
            const review = getReviewLabel(record);
            const source = String(record.source || "UNKNOWN").toUpperCase();

            return `
                <tr>
                    <td>${escapeHTML(getCrewName(record.crew_id))}</td>
                    <td>${escapeHTML(record.heart_rate ?? "--")} bpm</td>
                    <td>${escapeHTML(record.oxygen_level ?? "--")}%</td>
                    <td>${escapeHTML(record.temperature ?? "--")} °C</td>
                    <td>
                        <span class="status-badge ${review.css}">
                            ${review.label}
                        </span>
                    </td>
                    <td>
                        <span class="source-badge">${escapeHTML(source)}</span>
                    </td>
                    <td>${escapeHTML(getTime(record))}</td>
                </tr>
            `;
        }).join("");
    }

    function renderChart() {
        if (!el.chart) return;

        const sorted = [...records]
            .filter(record => numberValue(record.heart_rate) !== null)
            .sort((a, b) =>
                new Date(getDate(a) || 0) - new Date(getDate(b) || 0)
            )
            .slice(-12);

        if (!sorted.length) {
            window.AstraCharts?.drawEmpty?.(
                el.chart,
                "No heart-rate readings available"
            );

            if (el.chartStatus) {
                el.chartStatus.textContent = "Waiting for health records.";
            }
            return;
        }

        const values = sorted.map(record => numberValue(record.heart_rate));

        const labels = sorted.map((record, index) => {
            const date = new Date(getDate(record) || "");

            return Number.isNaN(date.getTime())
                ? `Reading ${index + 1}`
                : date.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit"
                });
        });

        if (window.AstraCharts?.drawLine) {
            // charts.js expects an options object, not a labels array.
            window.AstraCharts.drawLine(
                el.chart,
                values,
                { labels }
            );
        }

        if (el.chartStatus) {
            el.chartStatus.textContent =
                `${sorted.length} recent readings displayed.`;
        }
    }

    async function loadData() {
        if (loading) return false;
        loading = true;

        try {
            const [healthResult, crewResult] = await Promise.all([
                apiRequest(API.health),
                apiRequest(API.crew)
            ]);

            records = getArray(healthResult, [
                "records", "health", "readings", "data"
            ]);

            crew = getArray(crewResult, [
                "crew", "members", "records", "data"
            ]);

            updateMetrics();
            renderRecords();
            renderChart();

            if (el.updated) {
                el.updated.textContent =
                    `Last updated: ${new Date().toLocaleTimeString()}`;
            }

            return true;

        } catch (error) {
            console.error("Health monitoring error:", error);
            showFeedback(error.message, "error");
            return false;

        } finally {
            loading = false;
        }
    }

    async function generateSimulatedData() {
        if (busy) return;

        busy = true;

        if (el.simulate) {
            el.simulate.disabled = true;
            el.simulate.textContent = "Generating...";
        }

        try {
            await apiRequest(API.simulate, {
                method: "POST",
                body: JSON.stringify({})
            });

            showFeedback(
                "Simulated readings generated. These are not live sensor measurements.",
                "success"
            );

            await loadData();

        } catch (error) {
            console.error("Simulation error:", error);
            showFeedback(error.message, "error");

        } finally {
            busy = false;

            if (el.simulate) {
                el.simulate.disabled = false;
                el.simulate.textContent = "Generate Simulated Readings";
            }
        }
    }

    function initialize() {
        el.refresh?.addEventListener("click", loadData);
        el.simulate?.addEventListener("click", generateSimulatedData);

        loadData();
        window.setInterval(loadData, 15000);
    }

    document.addEventListener("DOMContentLoaded", initialize);
})();
