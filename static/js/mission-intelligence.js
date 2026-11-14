
/* ============================================================
   ASTRA HEALTH 360
   MISSION INTELLIGENCE ENGINE
   Version 1.1

   Decision-support indicators only.
   Not a medical diagnostic system.

   IMPORTANT:
   This frontend performs configured threshold analysis.
   It does not execute the backend IsolationForest ML model.
   ============================================================ */

(() => {
    "use strict";

    const CONFIG = {
        healthEndpoint: "/api/health",
        crewEndpoint: "/api/crew",
        refreshInterval: 15000,

        // Illustrative engineering thresholds only.
        // These are not validated medical limits.
        limits: {
            heartRate: {
                minimum: 50,
                maximum: 120
            },
            oxygen: {
                minimum: 90
            },
            temperature: {
                minimum: 35,
                maximum: 38
            }
        }
    };

    const state = {
        healthRecords: [],
        crewMembers: [],
        lastUpdated: null,
        loading: false,
        error: null
    };

    let refreshTimer = null;

    // ----------------------------------------------------------
    // API HELPERS
    // ----------------------------------------------------------

    async function fetchJSON(url) {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                Accept: "application/json"
            },
            cache: "no-store"
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                payload.error ||
                payload.message ||
                `Request failed: ${response.status}`
            );
        }

        return payload;
    }

    function extractArray(payload, possibleKeys) {
        if (Array.isArray(payload)) {
            return payload;
        }

        if (!payload || typeof payload !== "object") {
            return [];
        }

        for (const key of possibleKeys) {
            if (Array.isArray(payload[key])) {
                return payload[key];
            }
        }

        return [];
    }

    function getNumber(record, keys) {
        for (const key of keys) {
            const raw = record?.[key];

            if (
                raw === null ||
                raw === undefined ||
                raw === ""
            ) {
                continue;
            }

            const value = Number(raw);

            if (Number.isFinite(value)) {
                return value;
            }
        }

        return null;
    }

    function getCrewId(record) {
        const id =
            record?.crew_id ??
            record?.astronaut_id ??
            record?.member_id;

        return id === null || id === undefined
            ? ""
            : String(id);
    }

    function getRecordTime(record) {
        return (
            record?.recorded_at ||
            record?.created_at ||
            record?.timestamp ||
            record?.date ||
            null
        );
    }

    function getTimestamp(record) {
        const raw = getRecordTime(record);

        if (!raw) {
            return null;
        }

        const timestamp = new Date(raw).getTime();

        return Number.isFinite(timestamp)
            ? timestamp
            : null;
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[character]);
    }

    // ----------------------------------------------------------
    // DATA NORMALIZATION
    // ----------------------------------------------------------

    function normalizeHealth(record) {
        const timestamp = getTimestamp(record);

        return {
            ...record,

            crewId: getCrewId(record),

            heartRate: getNumber(record, [
                "heart_rate",
                "heartRate",
                "hr"
            ]),

            oxygen: getNumber(record, [
                "oxygen_level",
                "oxygen",
                "spo2",
                "spo2_level"
            ]),

            temperature: getNumber(record, [
                "body_temperature",
                "temperature",
                "bodyTemperature"
            ]),

            source: String(
                record?.source || "UNKNOWN"
            ).toUpperCase(),

            timestamp
        };
    }

    function getLatestReadings(records) {
        const latestByCrew = new Map();

        records
            .map(normalizeHealth)
            .filter(record => record.crewId)
            .forEach(record => {
                const previous = latestByCrew.get(record.crewId);

                // Prefer records with valid timestamps.
                if (!previous) {
                    latestByCrew.set(record.crewId, record);
                    return;
                }

                const currentTime = record.timestamp;
                const previousTime = previous.timestamp;

                if (
                    currentTime !== null &&
                    (
                        previousTime === null ||
                        currentTime >= previousTime
                    )
                ) {
                    latestByCrew.set(record.crewId, record);
                } else if (
                    currentTime === null &&
                    previousTime === null
                ) {
                    // When timestamps are unavailable, retain the
                    // later record in the API response.
                    latestByCrew.set(record.crewId, record);
                }
            });

        return Array.from(latestByCrew.values());
    }

    function findCrewName(crewId) {
        const member = state.crewMembers.find(member =>
            String(member.id ?? member.crew_id) === String(crewId)
        );

        return member?.name || `Crew member ${crewId}`;
    }

    // ----------------------------------------------------------
    // READING ANALYSIS
    // ----------------------------------------------------------

    function analyseReading(record) {
        const flags = [];

        const hr = record.heartRate;
        const oxygen = record.oxygen;
        const temperature = record.temperature;

        if (hr !== null) {
            if (hr < CONFIG.limits.heartRate.minimum) {
                flags.push({
                    type: "heart",
                    severity: "warning",
                    title: "Heart rate below configured limit",
                    detail: `${hr} bpm`
                });
            } else if (hr > CONFIG.limits.heartRate.maximum) {
                flags.push({
                    type: "heart",
                    severity: "warning",
                    title: "Heart rate above configured limit",
                    detail: `${hr} bpm`
                });
            }
        }

        if (oxygen !== null) {
            if (oxygen < CONFIG.limits.oxygen.minimum) {
                flags.push({
                    type: "oxygen",
                    severity: "critical",
                    title: "Oxygen reading below configured limit",
                    detail: `${oxygen}%`
                });
            }
        }

        if (temperature !== null) {
            if (temperature < CONFIG.limits.temperature.minimum) {
                flags.push({
                    type: "temperature",
                    severity: "warning",
                    title: "Temperature below configured limit",
                    detail: `${temperature} °C`
                });
            } else if (
                temperature > CONFIG.limits.temperature.maximum
            ) {
                flags.push({
                    type: "temperature",
                    severity: "warning",
                    title: "Temperature above configured limit",
                    detail: `${temperature} °C`
                });
            }
        }

        const missing = [];

        if (hr === null) missing.push("heart rate");
        if (oxygen === null) missing.push("oxygen");
        if (temperature === null) missing.push("temperature");

        let status;

        if (flags.some(flag => flag.severity === "critical")) {
            status = "CRITICAL REVIEW";
        } else if (flags.length) {
            status = "ATTENTION";
        } else if (missing.length) {
            status = "INCOMPLETE DATA";
        } else {
            status = "NO CONFIGURED FLAGS";
        }

        return {
            flags,
            missing,
            status
        };
    }

    function getOverallSummary(readings) {
        const summary = {
            total: readings.length,
            critical: 0,
            attention: 0,
            incomplete: 0,
            normal: 0
        };

        readings.forEach(record => {
            const analysis = analyseReading(record);

            if (analysis.status === "CRITICAL REVIEW") {
                summary.critical++;
            } else if (analysis.status === "ATTENTION") {
                summary.attention++;
            } else if (analysis.status === "INCOMPLETE DATA") {
                summary.incomplete++;
            } else {
                summary.normal++;
            }
        });

        return summary;
    }

    // ----------------------------------------------------------
    // PANEL CREATION
    // ----------------------------------------------------------

    function ensurePanel() {
        let panel = document.getElementById(
            "astra-mission-intelligence"
        );

        if (panel) {
            return panel;
        }

        const dashboard = document.querySelector(
            ".page-content, main, .main-content"
        );

        if (!dashboard) {
            return null;
        }

        panel = document.createElement("section");

        panel.id = "astra-mission-intelligence";
        panel.className = "astra-intelligence-panel";

        panel.innerHTML = `
            <div class="astra-intelligence-heading">
                <div>
                    <div class="astra-intelligence-eyebrow">
                        ASTRA / FLIGHT OPERATIONS
                    </div>

                    <h2>Mission Intelligence</h2>

                    <p>
                        Crew health monitoring and configured
                        threshold analysis
                    </p>
                </div>

                <div
                    class="astra-intelligence-live"
                    id="astra-intel-connection">
                    <span class="astra-intelligence-dot"></span>
                    CONNECTING
                </div>
            </div>

            <div class="astra-intelligence-metrics">

                <article class="astra-intelligence-metric">
                    <span>CREW MONITORED</span>
                    <strong id="astra-intel-total">—</strong>
                </article>

                <article class="astra-intelligence-metric">
                    <span>CRITICAL REVIEW</span>
                    <strong id="astra-intel-critical">—</strong>
                </article>

                <article class="astra-intelligence-metric">
                    <span>ATTENTION FLAGS</span>
                    <strong id="astra-intel-attention">—</strong>
                </article>

                <article class="astra-intelligence-metric">
                    <span>INCOMPLETE DATA</span>
                    <strong id="astra-intel-incomplete">—</strong>
                </article>

            </div>

            <div class="astra-intelligence-content">

                <div class="astra-intelligence-subheading">
                    <h3>Crew analysis</h3>

                    <span id="astra-intel-updated">
                        Waiting for data
                    </span>
                </div>

                <div
                    id="astra-intel-crew-list"
                    class="astra-intelligence-crew-list">

                    <div class="astra-intelligence-empty">
                        Waiting for crew health records...
                    </div>

                </div>
            </div>

            <div class="astra-intelligence-disclaimer">
                <strong>Operational notice:</strong>
                These are automated flags against illustrative
                engineering thresholds, not medical diagnoses.
                Verify readings and follow mission medical protocols.
                Simulated readings are not real astronaut measurements.
            </div>
        `;

        const firstSection = dashboard.querySelector(
            ".stats-grid, .stats-container, .dashboard-grid, h1"
        );

        if (firstSection) {
            firstSection.before(panel);
        } else {
            dashboard.prepend(panel);
        }

        addPanelStyles();

        return panel;
    }

    // ----------------------------------------------------------
    // PANEL STYLES
    // ----------------------------------------------------------

    function addPanelStyles() {
        if (document.getElementById("astra-intelligence-styles")) {
            return;
        }

        const style = document.createElement("style");

        style.id = "astra-intelligence-styles";

        style.textContent = `
            .astra-intelligence-panel {
                margin: 22px 0;
                padding: 23px;
                border-radius: 18px;
                border: 1px solid rgba(57,232,244,.23);
                background:
                    radial-gradient(
                        circle at 100% 0%,
                        rgba(57,232,244,.09),
                        transparent 40%
                    ),
                    rgba(8,20,39,.94);
                box-shadow: 0 15px 40px rgba(0,0,0,.18);
                color: #edf6ff;
            }

            .astra-intelligence-heading,
            .astra-intelligence-subheading {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 15px;
            }

            .astra-intelligence-eyebrow {
                color: #39e8f4;
                font-size: 10px;
                font-weight: 800;
                letter-spacing: 2px;
                margin-bottom: 7px;
            }

            .astra-intelligence-heading h2 {
                margin: 0;
                font-size: 22px;
            }

            .astra-intelligence-heading p {
                color: #8da6c5;
                font-size: 12px;
                margin: 7px 0 0;
            }

            .astra-intelligence-live {
                color: #35e6a2;
                font-size: 10px;
                letter-spacing: 1px;
                white-space: nowrap;
            }

            .astra-intelligence-live.error {
                color: #ff5876;
            }

            .astra-intelligence-dot {
                display: inline-block;
                width: 7px;
                height: 7px;
                margin-right: 6px;
                border-radius: 50%;
                background: currentColor;
                box-shadow: 0 0 12px currentColor;
            }

            .astra-intelligence-metrics {
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 12px;
                margin: 22px 0;
            }

            .astra-intelligence-metric {
                padding: 15px;
                border: 1px solid rgba(80,166,255,.16);
                background: rgba(15,34,59,.65);
                border-radius: 12px;
            }

            .astra-intelligence-metric span {
                display: block;
                color: #8da6c5;
                font-size: 9px;
                letter-spacing: 1px;
                margin-bottom: 9px;
            }

            .astra-intelligence-metric strong {
                font-size: 25px;
                color: #39e8f4;
                font-variant-numeric: tabular-nums;
            }

            #astra-intel-critical {
                color: #ff5876;
            }

            #astra-intel-attention {
                color: #ffc65c;
            }

            .astra-intelligence-subheading {
                margin: 15px 0;
            }

            .astra-intelligence-subheading h3 {
                font-size: 15px;
                margin: 0;
            }

            .astra-intelligence-subheading span {
                color: #8da6c5;
                font-size: 10px;
            }

            .astra-intelligence-crew-list {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 11px;
            }

            .astra-intelligence-crew {
                border: 1px solid rgba(80,166,255,.16);
                border-radius: 12px;
                background: rgba(14,31,54,.72);
                padding: 14px;
                min-width: 0;
            }

            .astra-intelligence-crew-top {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 10px;
                margin-bottom: 12px;
            }

            .astra-intelligence-crew-name {
                font-weight: 700;
                font-size: 13px;
            }

            .astra-intelligence-badge {
                font-size: 9px;
                padding: 5px 8px;
                border-radius: 20px;
                white-space: nowrap;
                background: rgba(53,230,162,.1);
                color: #35e6a2;
            }

            .astra-intelligence-badge.warning {
                color: #ffc65c;
                background: rgba(255,198,92,.1);
            }

            .astra-intelligence-badge.critical {
                color: #ff5876;
                background: rgba(255,88,118,.12);
            }

            .astra-intelligence-badge.incomplete {
                color: #a98cff;
                background: rgba(169,140,255,.12);
            }

            .astra-intelligence-readings {
                display: flex;
                flex-wrap: wrap;
                gap: 7px;
                margin-bottom: 10px;
            }

            .astra-intelligence-reading {
                padding: 7px 9px;
                background: rgba(3,12,26,.65);
                border-radius: 8px;
                font-size: 10px;
                color: #b9cde4;
            }

            .astra-intelligence-reading strong {
                display: block;
                color: #edf6ff;
                font-size: 13px;
                margin-top: 3px;
            }

            .astra-intelligence-flags {
                color: #ffc65c;
                font-size: 10px;
                line-height: 1.7;
            }

            .astra-intelligence-source {
                color: #8da6c5;
                font-size: 9px;
                margin-top: 9px;
            }

            .astra-intelligence-empty {
                grid-column: 1 / -1;
                padding: 24px;
                text-align: center;
                color: #8da6c5;
                border: 1px dashed rgba(80,166,255,.2);
                border-radius: 12px;
                font-size: 12px;
            }

            .astra-intelligence-disclaimer {
                margin-top: 17px;
                padding: 12px 14px;
                border-left: 3px solid #65aaff;
                background: rgba(77,166,255,.07);
                color: #9eb4ce;
                font-size: 10px;
                line-height: 1.7;
            }

            .astra-intelligence-disclaimer strong {
                color: #65aaff;
            }

            @media (max-width: 700px) {
                .astra-intelligence-metrics {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }

                .astra-intelligence-crew-list {
                    grid-template-columns: 1fr;
                }

                .astra-intelligence-heading {
                    align-items: flex-start;
                    flex-direction: column;
                }
            }
        `;

        document.head.appendChild(style);
    }

    // ----------------------------------------------------------
    // CONNECTION STATUS
    // ----------------------------------------------------------

    function updateConnectionStatus(connected) {
        const element = document.getElementById(
            "astra-intel-connection"
        );

        if (!element) return;

        element.classList.toggle("error", !connected);

        element.innerHTML = `
            <span class="astra-intelligence-dot"></span>
            ${connected ? "DATA CONNECTED" : "CONNECTION ERROR"}
        `;
    }

    function clearSummary() {
        const ids = [
            "astra-intel-total",
            "astra-intel-critical",
            "astra-intel-attention",
            "astra-intel-incomplete"
        ];

        ids.forEach(id => {
            const element = document.getElementById(id);

            if (element) {
                element.textContent = "—";
            }
        });

        const updated = document.getElementById(
            "astra-intel-updated"
        );

        if (updated) {
            updated.textContent = "Data unavailable";
        }
    }

    // ----------------------------------------------------------
    // CREW ANALYSIS DISPLAY
    // ----------------------------------------------------------

    function renderCrewAnalysis(readings) {
        const container = document.getElementById(
            "astra-intel-crew-list"
        );

        if (!container) return;

        if (!readings.length) {
            container.innerHTML = `
                <div class="astra-intelligence-empty">
                    No health readings are available yet.
                    Add crew records or generate clearly labelled
                    simulated readings.
                </div>
            `;
            return;
        }

        const priority = record => {
            const status = analyseReading(record).status;

            if (status === "CRITICAL REVIEW") return 0;
            if (status === "ATTENTION") return 1;
            if (status === "INCOMPLETE DATA") return 2;

            return 3;
        };

        const sorted = [...readings].sort(
            (a, b) => priority(a) - priority(b)
        );

        container.innerHTML = sorted.map(record => {
            const analysis = analyseReading(record);

            const badgeClass =
                analysis.status === "CRITICAL REVIEW"
                    ? "critical"
                    : analysis.status === "ATTENTION"
                        ? "warning"
                        : analysis.status === "INCOMPLETE DATA"
                            ? "incomplete"
                            : "";

            const heart = record.heartRate === null
                ? "—"
                : `${record.heartRate} bpm`;

            const oxygen = record.oxygen === null
                ? "—"
                : `${record.oxygen}%`;

            const temperature = record.temperature === null
                ? "—"
                : `${record.temperature} °C`;

            const flags = analysis.flags.length
                ? analysis.flags.map(flag => `
                    <div>
                        • ${escapeHTML(flag.title)}
                        (${escapeHTML(flag.detail)})
                    </div>
                `).join("")
                : analysis.missing.length
                    ? `<div>Missing: ${escapeHTML(analysis.missing.join(", "))}</div>`
                    : `<div>No configured threshold flags detected.</div>`;

            const source = record.source === "SENSOR"
                ? "SENSOR-LABELLED DATA"
                : record.source === "SIMULATED"
                    ? "SIMULATED DATA"
                    : "SOURCE NOT CONFIRMED";

            const recordedTime = record.timestamp !== null
                ? new Date(record.timestamp).toLocaleString()
                : "Timestamp unavailable";

            return `
                <article class="astra-intelligence-crew">

                    <div class="astra-intelligence-crew-top">
                        <span class="astra-intelligence-crew-name">
                            ${escapeHTML(findCrewName(record.crewId))}
                        </span>

                        <span class="astra-intelligence-badge ${badgeClass}">
                            ${escapeHTML(analysis.status)}
                        </span>
                    </div>

                    <div class="astra-intelligence-readings">

                        <div class="astra-intelligence-reading">
                            HEART RATE
                            <strong>${escapeHTML(heart)}</strong>
                        </div>

                        <div class="astra-intelligence-reading">
                            OXYGEN
                            <strong>${escapeHTML(oxygen)}</strong>
                        </div>

                        <div class="astra-intelligence-reading">
                            TEMPERATURE
                            <strong>${escapeHTML(temperature)}</strong>
                        </div>

                    </div>

                    <div class="astra-intelligence-flags">
                        ${flags}
                    </div>

                    <div class="astra-intelligence-source">
                        ${escapeHTML(source)}
                        · ${escapeHTML(recordedTime)}
                    </div>

                </article>
            `;
        }).join("");
    }

    // ----------------------------------------------------------
    // SUMMARY DISPLAY
    // ----------------------------------------------------------

    function renderSummary(readings) {
        const summary = getOverallSummary(readings);

        const values = {
            "astra-intel-total": summary.total,
            "astra-intel-critical": summary.critical,
            "astra-intel-attention": summary.attention,
            "astra-intel-incomplete": summary.incomplete
        };

        Object.entries(values).forEach(([id, value]) => {
            const element = document.getElementById(id);

            if (element) {
                element.textContent = value;
            }
        });

        const updated = document.getElementById(
            "astra-intel-updated"
        );

        if (updated) {
            updated.textContent =
                `Updated ${new Date().toLocaleTimeString()}`;
        }
    }

    // ----------------------------------------------------------
    // REFRESH ENGINE
    // ----------------------------------------------------------

    async function refresh() {
        if (state.loading) return;

        state.loading = true;

        try {
            const [healthPayload, crewPayload] = await Promise.all([
                fetchJSON(CONFIG.healthEndpoint),
                fetchJSON(CONFIG.crewEndpoint)
            ]);

            let healthRecords = extractArray(
                healthPayload,
                ["records", "health", "readings", "data"]
            );

            const crewMembers = extractArray(
                crewPayload,
                ["crew", "members", "records", "data"]
            );

            // DEMO MODE: If the database has crew but no saved health
            // records, generate one clearly labelled simulated reading
            // per crew member. This runs only while the health table is
            // empty; the 15-second refresh will not keep adding records.
            if (healthRecords.length === 0 && crewMembers.length > 0) {
                const seedResponse = await fetch("/api/iot/readings", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json"
                    },
                    body: JSON.stringify({ all: true })
                });

                const seedPayload = await seedResponse.json().catch(() => ({}));

                if (!seedResponse.ok || seedPayload.success === false) {
                    throw new Error(
                        seedPayload.error ||
                        seedPayload.message ||
                        "Unable to create demo readings."
                    );
                }

                const refreshedHealth = await fetchJSON(CONFIG.healthEndpoint);
                healthRecords = extractArray(
                    refreshedHealth,
                    ["records", "health", "readings", "data"]
                );
            }

            state.healthRecords = healthRecords;
            state.crewMembers = crewMembers;

            const latestReadings = getLatestReadings(
                state.healthRecords
            );

            state.lastUpdated = new Date();
            state.error = null;

            ensurePanel();

            updateConnectionStatus(true);
            renderSummary(latestReadings);
            renderCrewAnalysis(latestReadings);

            document.dispatchEvent(
                new CustomEvent("astra:intelligence-updated", {
                    detail: {
                        crewCount: latestReadings.length,
                        summary: getOverallSummary(latestReadings)
                    }
                })
            );

        } catch (error) {
            console.error(
                "ASTRA Mission Intelligence:",
                error
            );

            state.error = error.message;

            // Clear old data so it cannot appear current.
            state.healthRecords = [];
            state.crewMembers = [];
            state.lastUpdated = null;

            ensurePanel();

            updateConnectionStatus(false);
            clearSummary();

            const list = document.getElementById(
                "astra-intel-crew-list"
            );

            if (list) {
                list.innerHTML = `
                    <div class="astra-intelligence-empty">
                        Unable to retrieve mission data.
                        Check the Flask backend and API connection.
                        <br><br>
                        ${escapeHTML(error.message)}
                    </div>
                `;
            }

        } finally {
            state.loading = false;
        }
    }

    // ----------------------------------------------------------
    // INITIALIZATION
    // ----------------------------------------------------------

    function initialize() {
        ensurePanel();

        refresh();

        if (refreshTimer) {
            window.clearInterval(refreshTimer);
        }

        refreshTimer = window.setInterval(
            refresh,
            CONFIG.refreshInterval
        );

        document.addEventListener(
            "visibilitychange",
            () => {
                if (!document.hidden) {
                    refresh();
                }
            }
        );

        console.log(
            "ASTRA Mission Intelligence initialized."
        );
    }

    // ----------------------------------------------------------
    // PUBLIC API
    // ----------------------------------------------------------

    window.AstraMissionIntelligence = {
        refresh,

        analyseReading,

        getLatestReadings,

        getOverallSummary,

        getState: () => ({
            lastUpdated: state.lastUpdated,
            error: state.error,
            crewCount: state.crewMembers.length,
            healthRecordCount: state.healthRecords.length,
            loading: state.loading
        })
    };

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
