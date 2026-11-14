
/* ============================================================
   ASTRA HEALTH 360 — MISSION DASHBOARD
   File: static/js/dashboard.js
   ============================================================ */

(() => {
    "use strict";

    const API = {
        status: "/api/status",
        crew: "/api/crew",
        health: "/api/health",
        alerts: "/api/alerts"
    };

    const REFRESH_INTERVAL = 15000;

    let refreshTimer = null;
    let refreshInProgress = false;

    let lastHealthRecords = [];
    let lastCrewRecords = [];
    let lastAlertRecords = [];

    const $ = id => document.getElementById(id);

    /* ================= GENERAL HELPERS ================= */

    function setText(id, value) {
        const element = $(id);
        if (element) element.textContent = value;
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

    function formatNumber(value, digits = 1) {
        const number = validNumber(value);
        return number === null ? "--" : number.toFixed(digits);
    }

    function validNumber(value) {
        if (value === null || value === undefined || value === "") {
            return null;
        }

        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }

    function getArray(data, keys = []) {
        if (Array.isArray(data)) return data;

        for (const key of keys) {
            if (Array.isArray(data?.[key])) {
                return data[key];
            }
        }

        return [];
    }

    function getCrewId(record) {
        return record?.crew_id ?? record?.id ?? "";
    }

    function getCrewName(record) {
        return record?.name ??
            record?.crew_name ??
            `Crew member ${getCrewId(record) || ""}`;
    }

    function getHealthCrewName(record) {
        return record?.crew_name ??
            record?.name ??
            `Crew ID ${record?.crew_id ?? "--"}`;
    }

    function getRecordDate(record) {
        return record?.recorded_at ??
            record?.created_at ??
            record?.timestamp ??
            record?.date ??
            null;
    }

    function formatDate(value) {
        if (!value) return "Time unavailable";

        const date = new Date(value);

        return Number.isNaN(date.getTime())
            ? String(value)
            : date.toLocaleString();
    }

    function latestFirst(records) {
        return [...records].sort((a, b) => {
            const dateA = new Date(getRecordDate(a) || 0).getTime();
            const dateB = new Date(getRecordDate(b) || 0).getTime();

            return dateB - dateA;
        });
    }

    async function apiGet(url) {
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
                data.error || data.message || `${url} returned HTTP ${response.status}`
            );
        }

        return data;
    }

    /* ================= CONNECTION STATUS ================= */

    async function updateConnectionStatus() {
        const statusElement = $("mission-system-status");
        const tagElement = $("mission-status-tag");
        const sharedStatus = $("system-connection");

        try {
            const result = await apiGet(API.status);

            if (
                result.success === false ||
                result.status === "offline"
            ) {
                throw new Error("Backend unavailable");
            }

            setText("mission-system-status", "MISSION BACKEND CONNECTED");
            setText("mission-backend", "ONLINE");

            if (tagElement) {
                tagElement.textContent = "ONLINE";
                tagElement.className = "oc-tag";
            }

            if (sharedStatus) {
                sharedStatus.textContent = "SYSTEM ONLINE";
                sharedStatus.dataset.backendStatus = "online";
            }

            if (statusElement) {
                statusElement.style.color = "var(--oc-green)";
            }

            return true;

        } catch (error) {
            console.error("Connection error:", error);

            setText("mission-system-status", "BACKEND CONNECTION LOST");
            setText("mission-backend", "OFFLINE");

            if (tagElement) {
                tagElement.textContent = "OFFLINE";
                tagElement.className = "oc-tag danger";
            }

            if (sharedStatus) {
                sharedStatus.textContent = "SYSTEM OFFLINE";
                sharedStatus.dataset.backendStatus = "offline";
            }

            if (statusElement) {
                statusElement.style.color = "var(--oc-red)";
            }

            return false;
        }
    }

    /* ================= CREW DATA ================= */

    function updateCrewStatistics(crew) {
        setText("total-crew", crew.length);

        const active = crew.filter(person =>
            String(person.status ?? "").toLowerCase() === "active"
        ).length;

        const standby = crew.filter(person =>
            String(person.status ?? "").toLowerCase() === "standby"
        ).length;

        setText("mission-active-crew", active);
        setText("mission-standby-crew", standby);
    }

    function renderCrewList(crew) {
        const container = $("dashboard-crew-list");
        if (!container) return;

        if (!crew.length) {
            container.innerHTML =
                '<div class="oc-empty">No crew records are available.</div>';
            return;
        }

        container.innerHTML = crew.slice(0, 7).map(person => {
            const name = escapeHTML(getCrewName(person));
            const role = escapeHTML(person.role ?? "Mission crew");
            const status = String(person.status ?? "Unknown");
            const normalized = status.toLowerCase();

            let tagClass = "";

            if (normalized === "inactive") tagClass = "danger";
            else if (normalized === "standby") tagClass = "warning";

            return `
                <div class="oc-list-item">
                    <strong>${name}</strong>
                    <small>${role}</small>
                    <div style="margin-top:8px">
                        <span class="oc-tag ${tagClass}">
                            ${escapeHTML(status.toUpperCase())}
                        </span>
                    </div>
                </div>
            `;
        }).join("");
    }

    /* ================= HEALTH DATA ================= */

    function getHeartRate(record) {
        return validNumber(
            record.heart_rate ?? record.heartRate
        );
    }

    function getOxygen(record) {
        return validNumber(
            record.oxygen_level ??
            record.oxygen_saturation ??
            record.spo2 ??
            record.oxygen
        );
    }

    function getTemperature(record) {
        return validNumber(
            record.temperature ??
            record.body_temperature
        );
    }

    function latestPerCrew(records) {
        const map = new Map();

        latestFirst(records).reverse().forEach(record => {
            const id = String(record.crew_id ?? "unknown");
            map.set(id, record);
        });

        return Array.from(map.values());
    }

    function calculateAverage(records, getter) {
        const values = records
            .map(getter)
            .filter(value => value !== null);

        if (!values.length) return null;

        return values.reduce((sum, value) => sum + value, 0)
            / values.length;
    }

    function updateHealthStatistics(records) {
        const latest = latestPerCrew(records);

        const averageHeart = calculateAverage(latest, getHeartRate);
        const averageOxygen = calculateAverage(latest, getOxygen);

        setText(
            "average-heart-rate",
            averageHeart === null
                ? "--"
                : formatNumber(averageHeart, 0)
        );

        setText(
            "average-oxygen",
            averageOxygen === null
                ? "--"
                : `${formatNumber(averageOxygen, 1)}%`
        );

        setText("mission-health-record-count", records.length);

        const sources = new Set(
            records.map(record =>
                String(record.source ?? "UNKNOWN").toUpperCase()
            )
        );

        const sourceText = sources.size === 0
            ? "UNKNOWN"
            : sources.size === 1
                ? [...sources][0]
                : "MIXED";

        setText("mission-data-source", sourceText);
    }

    function renderHealthList(records) {
        const container = $("dashboard-health-list");
        if (!container) return;

        const sorted = latestFirst(records);

        if (!sorted.length) {
            container.innerHTML =
                '<div class="oc-empty">No health records available.</div>';
            return;
        }

        container.innerHTML = sorted.slice(0, 6).map(record => {
            const name = escapeHTML(getHealthCrewName(record));
            const heart = getHeartRate(record);
            const oxygen = getOxygen(record);
            const temperature = getTemperature(record);

            const source = String(
                record.source ?? "UNKNOWN"
            ).toUpperCase();

            const sourceClass = source === "SIMULATED"
                ? "warning"
                : source === "SENSOR"
                    ? ""
                    : "warning";

            return `
                <div class="oc-list-item">
                    <strong>${name}</strong>
                    <small>
                        HR: ${heart ?? "--"} BPM
                        &nbsp; | &nbsp;
                        SpO₂: ${oxygen ?? "--"}%
                        &nbsp; | &nbsp;
                        Temp: ${temperature ?? "--"} °C
                    </small>
                    <div style="margin-top:8px">
                        <span class="oc-tag ${sourceClass}">
                            ${escapeHTML(source)}
                        </span>
                    </div>
                </div>
            `;
        }).join("");
    }

    /* ================= ALERT DATA ================= */

    function getSeverity(alert) {
        return String(alert.severity ?? alert.priority ?? "Unknown");
    }

    function getAlertStatus(alert) {
        return String(alert.status ?? "Active");
    }

    function renderAlerts(alerts) {
        const container = $("dashboard-alert-list");
        if (!container) return;

        const sorted = latestFirst(alerts);

        if (!sorted.length) {
            container.innerHTML =
                '<div class="oc-empty">No alerts recorded.</div>';
            return;
        }

        container.innerHTML = sorted.slice(0, 6).map(alert => {
            const severity = getSeverity(alert);
            const status = getAlertStatus(alert);

            const description = escapeHTML(
                alert.description ??
                alert.message ??
                alert.title ??
                "Mission alert"
            );

            const normalized = severity.toLowerCase();

            const severityClass =
                normalized === "critical" || normalized === "high"
                    ? "danger"
                    : normalized === "medium"
                        ? "warning"
                        : "";

            return `
                <div class="oc-list-item">
                    <strong>${description}</strong>
                    <small>
                        ${escapeHTML(formatDate(getRecordDate(alert)))}
                    </small>
                    <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:8px">
                        <span class="oc-tag ${severityClass}">
                            ${escapeHTML(severity.toUpperCase())}
                        </span>
                        <span class="oc-tag">
                            ${escapeHTML(status.toUpperCase())}
                        </span>
                    </div>
                </div>
            `;
        }).join("");
    }

    function updateAlertStatistics(alerts) {
        const active = alerts.filter(alert =>
            getAlertStatus(alert).toLowerCase() === "active"
        );

        setText("total-alerts", active.length);
        setText("mission-alert-total", alerts.length);
    }

    /* ================= CHARTS ================= */

    function drawTelemetryCharts(records) {
        if (!window.AstraCharts) {
            console.warn("AstraCharts is not available.");
            return;
        }

        const sorted = latestFirst(records).reverse();

        const heartCanvas = $("dashboard-heart-chart");
        const oxygenCanvas = $("dashboard-oxygen-chart");

        function draw(canvas, getter, emptyMessage) {
            if (!canvas) return;

            const points = sorted.map((record, index) => {
                const date = new Date(getRecordDate(record) || "");

                return {
                    value: getter(record),
                    label: Number.isNaN(date.getTime())
                        ? `R${index + 1}`
                        : date.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit"
                        })
                };
            }).filter(point => point.value !== null);

            if (!points.length) {
                window.AstraCharts.drawEmpty(canvas, emptyMessage);
                return;
            }

            window.AstraCharts.drawLine(
                canvas,
                points.map(point => point.value),
                { labels: points.map(point => point.label) }
            );
        }

        draw(heartCanvas, getHeartRate, "No heart-rate records");
        draw(oxygenCanvas, getOxygen, "No oxygen records");
    }

    /* ================= TIMESTAMP AND FEEDBACK ================= */

    function updateTimestamp() {
        setText("dashboard-updated", new Date().toLocaleTimeString());
    }

    function showDashboardError(message) {
        console.error("Dashboard:", message);

        const feedback = $("dashboard-feedback");
        if (feedback) feedback.textContent = message;
    }

    function setRefreshButtonState(loading) {
        const button = $("refresh-dashboard");
        if (!button) return;

        button.disabled = loading;
        button.textContent = loading
            ? "REFRESHING..."
            : "↻ REFRESH TELEMETRY";
    }

    function showServiceError(containerId, message) {
        const container = $(containerId);

        if (container) {
            container.innerHTML =
                `<div class="oc-empty">${escapeHTML(message)}</div>`;
        }
    }

    /* ================= MAIN DASHBOARD REFRESH ================= */

    async function refreshDashboard() {
        if (refreshInProgress) return;

        refreshInProgress = true;
        setRefreshButtonState(true);

        try {
            const connected = await updateConnectionStatus();

            if (!connected) {
                throw new Error(
                    "Flask backend unavailable. Start the application and try again."
                );
            }

            const results = await Promise.allSettled([
                apiGet(API.crew),
                apiGet(API.health),
                apiGet(API.alerts)
            ]);

            const [crewResult, healthResult, alertResult] = results;

            /* CREW */

            if (crewResult.status === "fulfilled") {
                lastCrewRecords = getArray(
                    crewResult.value,
                    ["crew", "members", "records", "data"]
                );

                updateCrewStatistics(lastCrewRecords);
                renderCrewList(lastCrewRecords);

            } else {
                lastCrewRecords = [];
                setText("total-crew", "--");
                setText("mission-active-crew", "--");
                setText("mission-standby-crew", "--");

                showServiceError(
                    "dashboard-crew-list",
                    "Crew service unavailable."
                );
            }

            /* HEALTH */

            if (healthResult.status === "fulfilled") {
                lastHealthRecords = getArray(
                    healthResult.value,
                    ["records", "health", "readings", "data"]
                );

                updateHealthStatistics(lastHealthRecords);
                renderHealthList(lastHealthRecords);
                drawTelemetryCharts(lastHealthRecords);

            } else {
                lastHealthRecords = [];

                setText("average-heart-rate", "--");
                setText("average-oxygen", "--");
                setText("mission-health-record-count", "--");
                setText("mission-data-source", "UNAVAILABLE");

                showServiceError(
                    "dashboard-health-list",
                    "Health service unavailable."
                );

                drawTelemetryCharts([]);
            }

            /* ALERTS */

            if (alertResult.status === "fulfilled") {
                lastAlertRecords = getArray(
                    alertResult.value,
                    ["alerts", "records", "data"]
                );

                renderAlerts(lastAlertRecords);
                updateAlertStatistics(lastAlertRecords);

            } else {
                lastAlertRecords = [];

                setText("total-alerts", "--");
                setText("mission-alert-total", "--");

                showServiceError(
                    "dashboard-alert-list",
                    "Alert service unavailable."
                );
            }

            /* OVERALL STATUS */

            const failedServices = results.filter(
                result => result.status === "rejected"
            ).length;

            if (failedServices > 0) {
                showDashboardError(
                    `${failedServices} dashboard service(s) could not be loaded.`
                );
            } else {
                showDashboardError("All dashboard data loaded successfully.");
            }

            updateTimestamp();

            document.dispatchEvent(
                new CustomEvent("astra:dashboard-updated", {
                    detail: {
                        crewCount: lastCrewRecords.length,
                        healthCount: lastHealthRecords.length,
                        alertCount: lastAlertRecords.length
                    }
                })
            );

        } catch (error) {
            showDashboardError(error.message);
            console.error("Dashboard refresh failed:", error);

        } finally {
            refreshInProgress = false;
            setRefreshButtonState(false);
        }
    }

    /* ================= INITIALIZATION ================= */

    function initializeDashboard() {
        const refreshButton = $("refresh-dashboard");

        if (refreshButton) {
            refreshButton.addEventListener(
                "click",
                refreshDashboard
            );
        }

        refreshDashboard();

        if (refreshTimer) {
            clearInterval(refreshTimer);
        }

        refreshTimer = setInterval(
            refreshDashboard,
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
            initializeDashboard,
            { once: true }
        );
    } else {
        initializeDashboard();
    }

})();
