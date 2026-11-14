
/* ==========================================================
   ASTRA HEALTH 360 — SPACE ENVIRONMENT MONITORING
   File: static/js/environment.js

   Features:
   - Load spacecraft environmental records
   - Display temperature, humidity and pressure
   - Display oxygen and CO2 separately where supported
   - Identify readings requiring review
   - Display historical readings
   - Identify simulated and sensor data
   ========================================================== */

(() => {
    "use strict";

    const API = "/api/environment";
    const REFRESH_INTERVAL = 15000;

    const el = {
        temperature: document.getElementById("environment-temperature"),
        humidity: document.getElementById("environment-humidity"),
        pressure: document.getElementById("environment-pressure"),
        airQuality: document.getElementById("environment-air-quality"),
        alert: document.getElementById("environment-alert"),
        source: document.getElementById("environment-source"),
        updated: document.getElementById("environment-updated"),
        history: document.getElementById("environment-history"),
        refresh: document.getElementById("refresh-environment")
    };

    let readings = [];
    let loading = false;
    let refreshTimer = null;

    /* ================= GENERAL HELPERS ================= */

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[char]);
    }

    function numeric(value) {
        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {
            return null;
        }

        const result = Number(value);
        return Number.isFinite(result) ? result : null;
    }

    function getArray(data) {
        if (Array.isArray(data)) return data;

        if (!data || typeof data !== "object") return [];

        for (const key of [
            "readings",
            "records",
            "environment",
            "data"
        ]) {
            if (Array.isArray(data[key])) {
                return data[key];
            }
        }

        return [];
    }

    async function apiRequest(url) {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Accept": "application/json"
            },
            cache: "no-store"
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                data.error ||
                data.message ||
                `Request failed with HTTP ${response.status}`
            );
        }

        return data;
    }

    function getTimestamp(record) {
        return (
            record.recorded_at ??
            record.timestamp ??
            record.created_at ??
            null
        );
    }

    function getTimestampValue(record) {
        const value = getTimestamp(record);

        if (!value) return 0;

        const timestamp = new Date(value).getTime();

        return Number.isFinite(timestamp) ? timestamp : 0;
    }

    function latestFirst(records) {
        return [...records].sort(
            (a, b) => getTimestampValue(b) - getTimestampValue(a)
        );
    }

    function displayValue(element, value, unit) {
        if (!element) return;

        const number = numeric(value);

        element.textContent = number === null
            ? "--"
            : `${number.toFixed(1)} ${unit}`;
    }

    function formatDate(value) {
        if (!value) return "Time unavailable";

        const date = new Date(value);

        return Number.isNaN(date.getTime())
            ? "Time unavailable"
            : date.toLocaleString();
    }

    function showFeedback(message, type = "warning") {
        if (!el.alert) return;

        el.alert.textContent = message;
        el.alert.className = `environment-alert ${type}`;
    }

    /* ================= ENVIRONMENT THRESHOLDS ================= */

    function evaluateEnvironment(record) {
        const warnings = [];

        const temperature = numeric(record.temperature);
        const humidity = numeric(record.humidity);
        const pressure = numeric(record.pressure);
        const oxygen = numeric(record.oxygen_level);
        const co2 = numeric(record.co2_level);

        /*
         * Illustrative software review thresholds only.
         * They are not certified spacecraft safety limits.
         */

        if (
            temperature !== null &&
            (temperature < 18 || temperature > 30)
        ) {
            warnings.push("Cabin temperature needs review");
        }

        if (
            humidity !== null &&
            (humidity < 20 || humidity > 70)
        ) {
            warnings.push("Cabin humidity needs review");
        }

        if (oxygen !== null && oxygen < 19.5) {
            warnings.push("Oxygen reading needs immediate review");
        }

        if (co2 !== null && co2 > 5000) {
            warnings.push("CO2 reading needs immediate review");
        }

        if (
            pressure !== null &&
            (pressure < 70 || pressure > 110)
        ) {
            warnings.push("Cabin pressure needs review");
        }

        return warnings;
    }

    /* ================= CLEAR DISPLAY ================= */

    function clearLatestDisplay() {
        displayValue(el.temperature, null, "°C");
        displayValue(el.humidity, null, "%");
        displayValue(el.pressure, null, "kPa");
        displayValue(el.airQuality, null, "ppm");

        if (el.source) {
            el.source.textContent = "Data source: UNAVAILABLE";
        }

        if (el.updated) {
            el.updated.textContent = "Reading time unavailable";
        }
    }

    /* ================= LATEST READING ================= */

    function renderLatest() {
        const latest = latestFirst(readings)[0];

        if (!latest) {
            clearLatestDisplay();

            showFeedback(
                "No environmental readings available.",
                "warning"
            );

            return;
        }

        displayValue(
            el.temperature,
            latest.temperature,
            "°C"
        );

        displayValue(
            el.humidity,
            latest.humidity,
            "%"
        );

        displayValue(
            el.pressure,
            latest.pressure,
            "kPa"
        );

        /*
         * The existing HTML has one air-quality display.
         * Show CO2 if present; otherwise show oxygen.
         * Keep the unit explicit so the two are not confused.
         */

        if (numeric(latest.co2_level) !== null) {
            displayValue(
                el.airQuality,
                latest.co2_level,
                "ppm CO2"
            );
        } else if (numeric(latest.oxygen_level) !== null) {
            displayValue(
                el.airQuality,
                latest.oxygen_level,
                "% O2"
            );
        } else {
            displayValue(
                el.airQuality,
                null,
                "ppm"
            );
        }

        const warnings = evaluateEnvironment(latest);

        if (warnings.length) {
            showFeedback(
                warnings.join(" • "),
                "warning"
            );
        } else {
            showFeedback(
                "No configured review threshold was triggered.",
                "normal"
            );
        }

        if (el.source) {
            const source = String(
                latest.source ?? "UNKNOWN"
            ).toUpperCase();

            el.source.textContent = `Data source: ${source}`;
        }

        if (el.updated) {
            el.updated.textContent =
                `Reading time: ${formatDate(getTimestamp(latest))}`;
        }
    }

    /* ================= HISTORY ================= */

    function renderHistory() {
        if (!el.history) return;

        const sorted = latestFirst(readings);

        if (!sorted.length) {
            el.history.innerHTML = `
                <div class="empty-state" style="padding:22px;text-align:center;">
                    <div style="font-size:30px;">🌎</div>
                    <strong>No environmental history available</strong>
                    <p>Load environmental records to view history.</p>
                </div>
            `;

            return;
        }

        el.history.innerHTML = sorted.slice(0, 30).map(record => {
            const warnings = evaluateEnvironment(record);

            const source = String(
                record.source ?? "UNKNOWN"
            ).toUpperCase();

            const date = getTimestamp(record);

            const temperature = numeric(record.temperature);
            const humidity = numeric(record.humidity);
            const pressure = numeric(record.pressure);
            const oxygen = numeric(record.oxygen_level);
            const co2 = numeric(record.co2_level);

            return `
                <article class="environment-history-card">

                    <div class="environment-history-header">
                        <strong>
                            ${escapeHTML(formatDate(date))}
                        </strong>

                        <span class="source-badge">
                            ${escapeHTML(source)}
                        </span>
                    </div>

                    <p>
                        Temperature:
                        ${temperature === null
                            ? "--"
                            : escapeHTML(temperature.toFixed(1))} °C
                    </p>

                    <p>
                        Humidity:
                        ${humidity === null
                            ? "--"
                            : escapeHTML(humidity.toFixed(1))} %
                    </p>

                    <p>
                        Pressure:
                        ${pressure === null
                            ? "--"
                            : escapeHTML(pressure.toFixed(1))} kPa
                    </p>

                    <p>
                        Oxygen:
                        ${oxygen === null
                            ? "--"
                            : escapeHTML(oxygen.toFixed(1))} %
                    </p>

                    <p>
                        CO2:
                        ${co2 === null
                            ? "--"
                            : escapeHTML(co2.toFixed(1))} ppm
                    </p>

                    <small>
                        ${warnings.length
                            ? escapeHTML(warnings.join(" • "))
                            : "No configured review threshold triggered"}
                    </small>

                </article>
            `;
        }).join("");
    }

    /* ================= LOAD ENVIRONMENT DATA ================= */

    async function loadEnvironment() {
        if (loading) return;

        loading = true;

        if (el.refresh) {
            el.refresh.disabled = true;
        }

        try {
            const result = await apiRequest(API);

            readings = getArray(result);

            renderLatest();
            renderHistory();

            console.info(
                `Environment module loaded ${readings.length} record(s).`
            );

        } catch (error) {
            console.error(
                "Environment monitoring error:",
                error
            );

            readings = [];

            clearLatestDisplay();

            showFeedback(
                `Environmental data unavailable: ${error.message}`,
                "warning"
            );

            renderHistory();

        } finally {
            loading = false;

            if (el.refresh) {
                el.refresh.disabled = false;
            }
        }
    }

    /* ================= INITIALIZATION ================= */

    function initialize() {
        el.refresh?.addEventListener(
            "click",
            loadEnvironment
        );

        loadEnvironment();

        if (refreshTimer) {
            clearInterval(refreshTimer);
        }

        refreshTimer = window.setInterval(
            loadEnvironment,
            REFRESH_INTERVAL
        );

        window.addEventListener("beforeunload", () => {
            if (refreshTimer) {
                clearInterval(refreshTimer);
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            initialize,
            { once: true }
        );
    } else {
        initialize();
    }

})();
