
/* ==========================================================
   ASTRA HEALTH 360 — MISSION REPORT GENERATOR

   Features:
   - Mission overview reports
   - Crew reports
   - Health reports
   - Emergency alert reports
   - Print / Save as PDF

   NOTE:
   Reports reflect records stored in the Flask backend.
   They are informational and are not medical diagnoses.
   ========================================================== */

(() => {
    "use strict";

    const el = {
        type: document.getElementById("report-type"),
        generate: document.getElementById("generate-report"),
        print: document.getElementById("print-report"),
        status: document.getElementById("report-status"),
        output: document.getElementById("report-output"),
        generatedTime: document.getElementById("report-generated-time")
    };

    const endpoints = {
        crew: "/api/crew",
        health: "/api/health",
        alerts: "/api/alerts"
    };

    let currentReport = null;
    let generating = false;

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

    function valueOf(record, keys, fallback = "--") {
        for (const key of keys) {
            const value = record?.[key];

            if (
                value !== null &&
                value !== undefined &&
                value !== ""
            ) {
                return value;
            }
        }

        return fallback;
    }

    function numberValue(value) {
        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {
            return null;
        }

        const number = Number(value);

        return Number.isFinite(number) ? number : null;
    }

    function dateValue(record) {
        return valueOf(record, [
            "recorded_at",
            "created_at",
            "timestamp",
            "date"
        ], null);
    }

    function dateText(value) {
        if (!value) return "Not available";

        const date = new Date(value);

        return Number.isNaN(date.getTime())
            ? String(value)
            : date.toLocaleString();
    }

    function timestampOf(record) {
        const value = dateValue(record);

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

    function setStatus(message, type = "info") {
        if (!el.status) return;

        el.status.textContent = message;
        el.status.className = `report-status ${type}`;
        el.status.setAttribute("role", "status");
        el.status.setAttribute("aria-live", "polite");
    }

    function getArray(data, keys) {
        if (Array.isArray(data)) return data;

        if (!data || typeof data !== "object") {
            return [];
        }

        for (const key of keys) {
            if (Array.isArray(data[key])) {
                return data[key];
            }
        }

        return [];
    }

    function getHealthValue(record, keys, unit) {
        const value = numberValue(valueOf(record, keys, null));

        return value === null
            ? "--"
            : `${value} ${unit}`;
    }

    function getAlertStatus(alert) {
        return String(alert.status || "active")
            .trim()
            .toLowerCase();
    }

    function isUnresolved(alert) {
        const status = getAlertStatus(alert);

        return ![
            "resolved",
            "closed",
            "complete",
            "completed"
        ].includes(status);
    }

    // ----------------------------------------------------------
    // API
    // ----------------------------------------------------------

    async function fetchJSON(url) {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                Accept: "application/json"
            },
            cache: "no-store"
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                data.error ||
                data.message ||
                `Could not load ${url}`
            );
        }

        return data;
    }

    async function loadData() {
        const [crewResult, healthResult, alertResult] =
            await Promise.all([
                fetchJSON(endpoints.crew),
                fetchJSON(endpoints.health),
                fetchJSON(endpoints.alerts)
            ]);

        return {
            crew: getArray(crewResult, [
                "crew",
                "members",
                "records",
                "data"
            ]),

            health: getArray(healthResult, [
                "records",
                "health",
                "readings",
                "data"
            ]),

            alerts: getArray(alertResult, [
                "alerts",
                "records",
                "data"
            ])
        };
    }

    // ----------------------------------------------------------
    // TABLE GENERATOR
    // ----------------------------------------------------------

    function table(headers, rows) {
        if (!rows.length) {
            return `
                <p class="report-empty">
                    No records available for this section.
                </p>
            `;
        }

        return `
            <div class="report-table-wrapper">
                <table class="report-table">

                    <thead>
                        <tr>
                            ${headers.map(header =>
                                `<th>${escapeHTML(header)}</th>`
                            ).join("")}
                        </tr>
                    </thead>

                    <tbody>
                        ${rows.map(row => `
                            <tr>
                                ${row.map(cell =>
                                    `<td>${escapeHTML(cell ?? "--")}</td>`
                                ).join("")}
                            </tr>
                        `).join("")}
                    </tbody>

                </table>
            </div>
        `;
    }

    // ----------------------------------------------------------
    // CREW REPORT
    // ----------------------------------------------------------

    function crewReport(data) {
        const rows = data.crew.map(member => [
            valueOf(member, ["id", "crew_id"]),
            valueOf(member, ["name", "full_name"]),
            valueOf(member, ["role", "designation"]),
            valueOf(member, ["status"], "Not specified")
        ]);

        const active = data.crew.filter(member =>
            String(member.status || "")
                .trim()
                .toLowerCase() === "active"
        ).length;

        const standby = data.crew.filter(member =>
            String(member.status || "")
                .trim()
                .toLowerCase() === "standby"
        ).length;

        return `
            <h2>Crew Report</h2>

            <div class="report-summary-grid">
                <div>
                    <strong>${data.crew.length}</strong>
                    <span>Registered Crew</span>
                </div>

                <div>
                    <strong>${active}</strong>
                    <span>Active Crew</span>
                </div>

                <div>
                    <strong>${standby}</strong>
                    <span>Standby Crew</span>
                </div>
            </div>

            <h3>Crew Registry</h3>

            ${table(
                ["ID", "Name", "Role", "Status"],
                rows
            )}
        `;
    }

    // ----------------------------------------------------------
    // HEALTH REPORT
    // ----------------------------------------------------------

    function healthReport(data) {
        const records = sortNewestFirst(data.health);

        const rows = records.map(record => [
            valueOf(record, ["id", "record_id"]),
            valueOf(record, ["crew_name", "crew_id"]),
            getHealthValue(
                record,
                ["heart_rate", "heartRate", "hr"],
                "bpm"
            ),
            getHealthValue(
                record,
                ["oxygen_level", "oxygen", "spo2", "spo2_level"],
                "%"
            ),
            getHealthValue(
                record,
                ["body_temperature", "temperature", "bodyTemperature"],
                "°C"
            ),
            String(record.source || "UNKNOWN").toUpperCase(),
            dateText(dateValue(record))
        ]);

        const simulated = data.health.filter(record =>
            String(record.source || "").toUpperCase() === "SIMULATED"
        ).length;

        const sensorLabelled = data.health.filter(record =>
            String(record.source || "").toUpperCase() === "SENSOR"
        ).length;

        const other = data.health.length -
            simulated -
            sensorLabelled;

        return `
            <h2>Health Monitoring Report</h2>

            <div class="report-summary-grid">
                <div>
                    <strong>${data.health.length}</strong>
                    <span>Total Health Records</span>
                </div>

                <div>
                    <strong>${simulated}</strong>
                    <span>Simulated Records</span>
                </div>

                <div>
                    <strong>${sensorLabelled}</strong>
                    <span>Sensor-Labelled Records</span>
                </div>

                <div>
                    <strong>${other}</strong>
                    <span>Other / Unknown Source</span>
                </div>
            </div>

            ${table(
                [
                    "Record ID",
                    "Crew ID / Name",
                    "Heart Rate",
                    "Oxygen",
                    "Temperature",
                    "Source Label",
                    "Recorded At"
                ],
                rows
            )}

            <p class="report-note">
                Source labels reflect the values stored in the database.
                A SENSOR label does not independently confirm that
                physical sensor hardware supplied the reading.
            </p>

            <p class="report-note">
                This report presents recorded data for information only.
                It is not a medical diagnosis or a substitute for
                mission medical protocols.
            </p>
        `;
    }

    // ----------------------------------------------------------
    // ALERT REPORT
    // ----------------------------------------------------------

    function alertReport(data) {
        const records = sortNewestFirst(data.alerts);

        const rows = records.map(alert => [
            valueOf(alert, ["id", "alert_id"]),
            valueOf(
                alert,
                ["title", "description", "message"]
            ),
            valueOf(alert, ["severity"], "Not specified"),
            valueOf(alert, ["status"], "Not specified"),
            dateText(dateValue(alert))
        ]);

        const unresolved = data.alerts.filter(isUnresolved);

        const criticalUnresolved = unresolved.filter(alert =>
            String(alert.severity || "")
                .trim()
                .toLowerCase() === "critical"
        ).length;

        const resolved = data.alerts.filter(alert =>
            !isUnresolved(alert)
        ).length;

        return `
            <h2>Emergency & Alert Report</h2>

            <div class="report-summary-grid">
                <div>
                    <strong>${data.alerts.length}</strong>
                    <span>Total Alerts</span>
                </div>

                <div>
                    <strong>${unresolved.length}</strong>
                    <span>Unresolved Alerts</span>
                </div>

                <div>
                    <strong>${criticalUnresolved}</strong>
                    <span>Unresolved Critical</span>
                </div>

                <div>
                    <strong>${resolved}</strong>
                    <span>Resolved Alerts</span>
                </div>
            </div>

            ${table(
                [
                    "Alert ID",
                    "Description",
                    "Severity",
                    "Status",
                    "Created"
                ],
                rows
            )}

            <p class="report-note">
                Unresolved alerts include both Active and
                Acknowledged records.
            </p>
        `;
    }

    // ----------------------------------------------------------
    // MISSION OVERVIEW
    // ----------------------------------------------------------

    function missionReport(data) {
        const activeCrew = data.crew.filter(member =>
            String(member.status || "")
                .trim()
                .toLowerCase() === "active"
        ).length;

        const unresolvedAlerts = data.alerts.filter(isUnresolved);

        const criticalAlerts = unresolvedAlerts.filter(alert =>
            String(alert.severity || "")
                .trim()
                .toLowerCase() === "critical"
        ).length;

        const recentHealth = sortNewestFirst(data.health)
            .slice(0, 10);

        const recentAlerts = sortNewestFirst(data.alerts)
            .slice(0, 10);

        return `
            <h2>Mission Overview</h2>

            <div class="report-summary-grid">

                <div>
                    <strong>${data.crew.length}</strong>
                    <span>Registered Crew</span>
                </div>

                <div>
                    <strong>${activeCrew}</strong>
                    <span>Active Crew</span>
                </div>

                <div>
                    <strong>${data.health.length}</strong>
                    <span>Health Records</span>
                </div>

                <div>
                    <strong>${unresolvedAlerts.length}</strong>
                    <span>Unresolved Alerts</span>
                </div>

                <div>
                    <strong>${criticalAlerts}</strong>
                    <span>Critical Unresolved</span>
                </div>

            </div>

            <h3>Crew Overview</h3>

            ${table(
                ["Name", "Role", "Status"],
                data.crew.map(member => [
                    valueOf(member, ["name", "full_name"]),
                    valueOf(member, ["role", "designation"]),
                    valueOf(member, ["status"], "Not specified")
                ])
            )}

            <h3>Recent Health Records</h3>

            ${table(
                [
                    "Crew ID / Name",
                    "Heart Rate",
                    "Oxygen",
                    "Temperature",
                    "Source",
                    "Recorded At"
                ],
                recentHealth.map(record => [
                    valueOf(record, ["crew_name", "crew_id"]),
                    getHealthValue(
                        record,
                        ["heart_rate", "heartRate", "hr"],
                        "bpm"
                    ),
                    getHealthValue(
                        record,
                        ["oxygen_level", "oxygen", "spo2"],
                        "%"
                    ),
                    getHealthValue(
                        record,
                        ["body_temperature", "temperature"],
                        "°C"
                    ),
                    String(record.source || "UNKNOWN").toUpperCase(),
                    dateText(dateValue(record))
                ])
            )}

            <h3>Emergency Alerts</h3>

            ${table(
                ["Description", "Severity", "Status", "Created"],
                recentAlerts.map(alert => [
                    valueOf(
                        alert,
                        ["title", "description", "message"]
                    ),
                    valueOf(alert, ["severity"]),
                    valueOf(alert, ["status"]),
                    dateText(dateValue(alert))
                ])
            )}

            <p class="report-note">
                This overview is generated from stored Flask database
                records. It does not represent live spacecraft telemetry.
            </p>
        `;
    }

    // ----------------------------------------------------------
    // RENDER REPORT
    // ----------------------------------------------------------

    function renderReport(title, body) {
        const generated = new Date();

        const reportHTML = `
            <div class="generated-report">

                <header class="report-heading">
                    <h1>ASTRA HEALTH 360</h1>

                    <p>
                        ASTRONAUT HEALTH & MISSION MONITORING
                    </p>

                    <h2>${escapeHTML(title)}</h2>

                    <p>
                        Generated:
                        ${escapeHTML(generated.toLocaleString())}
                    </p>
                </header>

                ${body}

                <footer class="report-footer">
                    <p>ASTRA HEALTH 360 — Mission Report</p>
                    <p>For mission information and review.</p>
                </footer>

            </div>
        `;

        currentReport = {
            title,
            html: reportHTML,
            generated
        };

        if (el.output) {
            el.output.innerHTML = reportHTML;
        }

        if (el.generatedTime) {
            el.generatedTime.textContent =
                generated.toLocaleString();
        }
    }

    // ----------------------------------------------------------
    // GENERATE REPORT
    // ----------------------------------------------------------

    async function generateReport() {
        if (generating) return;

        if (!el.type) {
            setStatus(
                "Report type selector was not found.",
                "error"
            );
            return;
        }

        generating = true;

        const selected = el.type.value;
        const originalButtonText = el.generate?.textContent;

        if (el.generate) {
            el.generate.disabled = true;
            el.generate.textContent = "Generating...";
        }

        setStatus("Collecting mission records...", "info");

        try {
            const data = await loadData();

            let title;
            let body;

            switch (selected) {
                case "crew":
                    title = "Crew Report";
                    body = crewReport(data);
                    break;

                case "health":
                    title = "Health Monitoring Report";
                    body = healthReport(data);
                    break;

                case "alerts":
                    title = "Emergency & Alert Report";
                    body = alertReport(data);
                    break;

                case "mission":
                default:
                    title = "Mission Overview Report";
                    body = missionReport(data);
                    break;
            }

            renderReport(title, body);

            setStatus(
                "Report generated successfully.",
                "success"
            );

        } catch (error) {
            console.error(
                "Report generation error:",
                error
            );

            // Do not leave an old report looking like a new one.
            currentReport = null;

            if (el.output) {
                el.output.innerHTML = `
                    <div class="report-empty">
                        Unable to generate report.
                        Please check the Flask server and try again.
                    </div>
                `;
            }

            setStatus(error.message, "error");

        } finally {
            generating = false;

            if (el.generate) {
                el.generate.disabled = false;
                el.generate.textContent =
                    originalButtonText || "Generate Report";
            }
        }
    }

    // ----------------------------------------------------------
    // PRINT / SAVE AS PDF
    // ----------------------------------------------------------

    function printReport() {
        if (!currentReport) {
            setStatus(
                "Generate a report before printing.",
                "error"
            );
            return;
        }

        const printWindow = window.open(
            "",
            "_blank",
            "width=1000,height=800"
        );

        if (!printWindow) {
            setStatus(
                "Allow pop-ups in your browser to print the report.",
                "error"
            );
            return;
        }

        const title = escapeHTML(currentReport.title);
        const reportHTML = currentReport.html;

        printWindow.document.open();

        printWindow.document.write(`
            <!DOCTYPE html>
            <html lang="en">

            <head>
                <meta charset="UTF-8">

                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1.0">

                <title>${title}</title>

                <style>
                    body {
                        font-family: Arial, sans-serif;
                        color: #172033;
                        padding: 28px;
                        line-height: 1.5;
                    }

                    h1, h2, h3 {
                        color: #12345a;
                    }

                    .report-heading {
                        text-align: center;
                        border-bottom: 2px solid #12345a;
                        padding-bottom: 18px;
                        margin-bottom: 24px;
                    }

                    .report-table-wrapper {
                        overflow: visible;
                    }

                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin: 16px 0;
                        font-size: 12px;
                    }

                    th, td {
                        border: 1px solid #bbb;
                        padding: 8px;
                        text-align: left;
                        overflow-wrap: anywhere;
                    }

                    th {
                        background: #e8eef5;
                    }

                    .report-summary-grid {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 16px;
                    }

                    .report-summary-grid div {
                        border: 1px solid #ccc;
                        padding: 14px;
                        min-width: 110px;
                    }

                    .report-summary-grid strong,
                    .report-summary-grid span {
                        display: block;
                    }

                    .report-footer {
                        border-top: 1px solid #ccc;
                        margin-top: 30px;
                        padding-top: 12px;
                    }

                    .report-note,
                    .report-empty {
                        font-size: 12px;
                        color: #555;
                    }

                    @page {
                        margin: 15mm;
                    }

                    @media print {
                        body {
                            padding: 0;
                        }

                        tr {
                            page-break-inside: avoid;
                        }

                        h2, h3 {
                            page-break-after: avoid;
                        }
                    }
                </style>
            </head>

            <body>
                ${reportHTML}

                <script>
                    window.onload = function () {
                        window.print();
                    };
                <\/script>
            </body>

            </html>
        `);

        printWindow.document.close();

        setStatus(
            "Print window opened. Choose Save as PDF to export.",
            "success"
        );
    }

    // ----------------------------------------------------------
    // INITIALIZATION
    // ----------------------------------------------------------

    function initialize() {
        el.generate?.addEventListener(
            "click",
            generateReport
        );

        el.print?.addEventListener(
            "click",
            printReport
        );
    }

    document.addEventListener(
        "DOMContentLoaded",
        initialize,
        { once: true }
    );

})();
