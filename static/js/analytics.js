
/* ==========================================================
   ASTRA HEALTH 360 — MISSION HEALTH ANALYTICS
   Features:
   - Fetch crew and health records
   - Calculate average health readings
   - Display health parameter indicators
   - Draw historical heart-rate chart
   - Show data source and update time

   Note: Analytics are informational, not diagnostic.
   ========================================================== */

(() => {
    "use strict";

    const HEALTH_API = "/api/health";
    const CREW_API = "/api/crew";

    const el = {
        heart: document.getElementById("analytics-heart"),
        oxygen: document.getElementById("analytics-oxygen"),
        temperature: document.getElementById("analytics-temperature"),
        crew: document.getElementById("analytics-crew"),
        chart: document.getElementById("analytics-chart"),
        heartParameter: document.getElementById("parameter-heart"),
        oxygenParameter: document.getElementById("parameter-oxygen"),
        temperatureParameter: document.getElementById("parameter-temperature"),
        heartBar: document.getElementById("bar-heart"),
        oxygenBar: document.getElementById("bar-oxygen"),
        temperatureBar: document.getElementById("bar-temperature"),
        summary: document.getElementById("analytics-summary"),
        updated: document.getElementById("analytics-updated")
    };

    let healthRecords = [];
    let crewMembers = [];

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[char]);
    }

    async function fetchJSON(url) {
        const response = await fetch(url, {
            headers: { "Accept": "application/json" }
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                data.error || data.message || `Request failed: ${url}`
            );
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

    function average(values) {
        const valid = values
            .map(Number)
            .filter(value => Number.isFinite(value));

        if (!valid.length) return null;

        return valid.reduce((sum, value) => sum + value, 0) /
            valid.length;
    }

    function displayValue(element, value, suffix = "") {
        if (!element) return;

        element.textContent = value === null
            ? "--"
            : `${value.toFixed(1)}${suffix}`;
    }

    function updateBar(element, value, maximum) {
        if (!element) return;

        const percentage = value === null
            ? 0
            : Math.max(0, Math.min(100, (value / maximum) * 100));

        element.style.width = `${percentage}%`;
        element.setAttribute("role", "progressbar");
        element.setAttribute("aria-valuenow", String(
            Math.round(percentage)
        ));
        element.setAttribute("aria-valuemin", "0");
        element.setAttribute("aria-valuemax", "100");
    }

    function latestPerCrew(records) {
        const latest = new Map();

        const sorted = [...records].sort((a, b) => {
            const dateA = new Date(
                a.recorded_at || a.timestamp || a.created_at || 0
            ).getTime();

            const dateB = new Date(
                b.recorded_at || b.timestamp || b.created_at || 0
            ).getTime();

            return dateA - dateB;
        });

        sorted.forEach(record => {
            if (record.crew_id !== undefined &&
                record.crew_id !== null) {
                latest.set(String(record.crew_id), record);
            }
        });

        return [...latest.values()];
    }

    function updateMetrics() {
        const latestRecords = latestPerCrew(healthRecords);

        const heartAverage = average(
            latestRecords.map(record => record.heart_rate)
        );

        const oxygenAverage = average(
            latestRecords.map(record => record.oxygen_level)
        );

        const temperatureAverage = average(
            latestRecords.map(record => record.temperature)
        );

        displayValue(el.heart, heartAverage, " bpm");
        displayValue(el.oxygen, oxygenAverage, "%");
        displayValue(el.temperature, temperatureAverage, " °C");

        if (el.crew) {
            el.crew.textContent = crewMembers.length;
        }

        updateBar(el.heartBar, heartAverage, 150);
        updateBar(el.oxygenBar, oxygenAverage, 100);
        updateBar(el.temperatureBar, temperatureAverage, 45);

        updateSummary(
            heartAverage,
            oxygenAverage,
            temperatureAverage,
            latestRecords.length
        );
    }

    function updateSummary(heart, oxygen, temperature, count) {
        if (!el.summary) return;

        if (!count) {
            el.summary.textContent =
                "No health records are available yet. Add or simulate readings to generate analytics.";
            return;
        }

        const observations = [];

        if (heart !== null) {
            observations.push(`Average heart rate: ${heart.toFixed(1)} bpm`);
        }

        if (oxygen !== null) {
            observations.push(`Average oxygen: ${oxygen.toFixed(1)}%`);
        }

        if (temperature !== null) {
            observations.push(
                `Average temperature: ${temperature.toFixed(1)} °C`
            );
        }

        el.summary.textContent =
            `${count} crew member(s) have available latest readings. ` +
            observations.join(". ") +
            ". These are descriptive averages, not medical diagnoses.";
    }

    function drawChart() {
        if (!el.chart) return;

        if (!window.AstraCharts?.drawLine) {
            const context = el.chart.getContext("2d");
            if (context) {
                context.clearRect(0, 0, el.chart.width, el.chart.height);
            }
            return;
        }

        const sorted = [...healthRecords]
            .filter(record => Number.isFinite(Number(record.heart_rate)))
            .sort((a, b) =>
                new Date(a.recorded_at || a.timestamp || a.created_at || 0) -
                new Date(b.recorded_at || b.timestamp || b.created_at || 0)
            )
            .slice(-20);

        if (!sorted.length) {
            window.AstraCharts.drawEmpty(
                el.chart,
                "No heart-rate readings available"
            );
            return;
        }

        const values = sorted.map(record => Number(record.heart_rate));

        const labels = sorted.map((record, index) => {
            const date = new Date(
                record.recorded_at ||
                record.timestamp ||
                record.created_at ||
                0
            );

            return Number.isNaN(date.getTime())
                ? `Reading ${index + 1}`
                : date.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit"
                });
        });

        window.AstraCharts.drawLine(el.chart, values, labels);
    }

    function updateTimestamp() {
        if (el.updated) {
            el.updated.textContent =
                `Last updated: ${new Date().toLocaleString()}`;
        }
    }

    async function refreshAnalytics() {
        try {
            const [healthResult, crewResult] = await Promise.all([
                fetchJSON(HEALTH_API),
                fetchJSON(CREW_API)
            ]);

            healthRecords = getArray(healthResult, [
                "records", "health", "readings", "data"
            ]);

            crewMembers = getArray(crewResult, [
                "crew", "members", "records", "data"
            ]);

            updateMetrics();
            drawChart();
            updateTimestamp();

        } catch (error) {
            console.error("Analytics loading error:", error);

            if (el.summary) {
                el.summary.textContent =
                    "Analytics could not be loaded. Check the Flask server and API endpoints.";
            }
        }
    }

    function initialize() {
        refreshAnalytics();

        window.setInterval(refreshAnalytics, 30000);
    }

    document.addEventListener("DOMContentLoaded", initialize);
})();
