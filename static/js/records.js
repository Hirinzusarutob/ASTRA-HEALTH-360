
/* ==========================================================
   ASTRA HEALTH 360 — MEDICAL RECORDS MANAGEMENT

   Features:
   - Load astronaut medical records
   - Search and filter records
   - View individual record details
   - Display health data and timestamps
   - Refresh records from Flask backend

   NOTE:
   Records are retrieved from the application database.
   They are not automatically verified medical measurements.
   ========================================================== */

(() => {
    "use strict";

    const API = "/api/records";
    const CREW_API = "/api/crew";
    const REFRESH_INTERVAL = 30000;

    const el = {
        total: document.getElementById("records-total"),
        search: document.getElementById("records-search"),
        list: document.getElementById("records-list"),
        detailPanel: document.getElementById("record-detail-panel"),
        detailId: document.getElementById("detail-id"),
        detailName: document.getElementById("detail-name"),
        detailRole: document.getElementById("detail-role"),
        details: document.getElementById("record-details"),
        close: document.getElementById("close-record-detail"),
        refresh: document.getElementById("refresh-records"),
        feedback: document.getElementById("records-feedback")
    };

    let records = [];
    let crew = [];
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

    function valueOf(object, keys, fallback = null) {
        for (const key of keys) {
            const value = object?.[key];

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

    function formatMeasurement(value, unit) {
        const number = numberValue(value);

        return number === null
            ? "--"
            : `${number} ${unit}`;
    }

    function getTimestamp(record) {
        return valueOf(record, [
            "recorded_at",
            "timestamp",
            "created_at",
            "date"
        ]);
    }

    function timestampValue(record) {
        const value = getTimestamp(record);

        if (!value) return null;

        const timestamp = new Date(value).getTime();

        return Number.isFinite(timestamp)
            ? timestamp
            : null;
    }

    function formatDate(value) {
        if (!value) return "Not available";

        const date = new Date(value);

        return Number.isNaN(date.getTime())
            ? String(value)
            : date.toLocaleString();
    }

    function sortNewestFirst(items) {
        return [...items].sort((a, b) => {
            const timeA = timestampValue(a);
            const timeB = timestampValue(b);

            if (timeA === null && timeB === null) return 0;
            if (timeA === null) return 1;
            if (timeB === null) return -1;

            return timeB - timeA;
        });
    }

    function getArray(data, keys = []) {
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

    function showFeedback(message, type = "info") {
        if (!el.feedback) return;

        el.feedback.textContent = message;
        el.feedback.className = `records-feedback ${type}`;
        el.feedback.setAttribute("role", "status");
        el.feedback.setAttribute("aria-live", "polite");
    }

    // ----------------------------------------------------------
    // CREW INFORMATION
    // ----------------------------------------------------------

    function getCrewMember(crewId) {
        if (crewId === null || crewId === undefined) {
            return null;
        }

        return crew.find(member =>
            String(member.id) === String(crewId)
        ) || null;
    }

    function getCrewName(record) {
        const crewId = valueOf(record, ["crew_id", "crewId"]);
        const member = getCrewMember(crewId);

        return (
            member?.name ||
            valueOf(record, ["crew_name", "name"]) ||
            `Crew member #${crewId ?? "Unknown"}`
        );
    }

    function getCrewRole(record) {
        const crewId = valueOf(record, ["crew_id", "crewId"]);
        const member = getCrewMember(crewId);

        return member?.role || "Crew member";
    }

    // ----------------------------------------------------------
    // STATISTICS
    // ----------------------------------------------------------

    function updateStatistics() {
        if (el.total) {
            el.total.textContent = records.length;
        }
    }

    // ----------------------------------------------------------
    // SEARCH
    // ----------------------------------------------------------

    function getFilteredRecords() {
        const term = String(el.search?.value || "")
            .trim()
            .toLowerCase();

        if (!term) return records;

        return records.filter(record => {
            const searchable = [
                getCrewName(record),
                getCrewRole(record),
                valueOf(record, ["id", "record_id"]),
                valueOf(record, ["crew_id", "crewId"]),
                valueOf(record, ["heart_rate", "heartRate", "hr"]),
                valueOf(record, ["oxygen_level", "oxygen", "spo2"]),
                valueOf(record, ["temperature", "body_temperature"]),
                valueOf(record, ["source"]),
                getTimestamp(record)
            ].join(" ").toLowerCase();

            return searchable.includes(term);
        });
    }

    // ----------------------------------------------------------
    // RENDER RECORDS
    // ----------------------------------------------------------

    function renderRecords() {
        if (!el.list) return;

        const filtered = sortNewestFirst(
            getFilteredRecords()
        );

        if (!filtered.length) {
            const hasSearch = Boolean(
                el.search?.value.trim()
            );

            el.list.innerHTML = `
                <tr>
                    <td colspan="6"
                        style="text-align:center;padding:22px;">
                        ${hasSearch
                            ? "No matching records found."
                            : "No medical records available."}
                    </td>
                </tr>
            `;

            return;
        }

        el.list.innerHTML = filtered.map(record => {
            const id = valueOf(record, ["id", "record_id"]);

            const heartRate = formatMeasurement(
                valueOf(record, ["heart_rate", "heartRate", "hr"]),
                "bpm"
            );

            const oxygen = formatMeasurement(
                valueOf(record, [
                    "oxygen_level",
                    "oxygen",
                    "spo2",
                    "spo2_level"
                ]),
                "%"
            );

            const temperature = formatMeasurement(
                valueOf(record, [
                    "temperature",
                    "body_temperature"
                ]),
                "°C"
            );

            const source = String(
                record.source || "UNKNOWN"
            ).toUpperCase();

            return `
                <tr>
                    <td>${escapeHTML(getCrewName(record))}</td>

                    <td>${escapeHTML(heartRate)}</td>

                    <td>${escapeHTML(oxygen)}</td>

                    <td>${escapeHTML(temperature)}</td>

                    <td>${escapeHTML(source)}</td>

                    <td>
                        ${id !== null ? `
                            <button
                                type="button"
                                data-record-id="${escapeHTML(id)}">
                                View details
                            </button>
                        ` : "--"}
                    </td>
                </tr>
            `;
        }).join("");
    }

    // ----------------------------------------------------------
    // RECORD DETAILS
    // ----------------------------------------------------------

    function openRecordDetails(id) {
        const record = records.find(item =>
            String(valueOf(item, ["id", "record_id"])) === String(id)
        );

        if (!record || !el.detailPanel) return;

        if (el.detailId) {
            el.detailId.textContent =
                valueOf(record, ["id", "record_id"], "--");
        }

        if (el.detailName) {
            el.detailName.textContent = getCrewName(record);
        }

        if (el.detailRole) {
            el.detailRole.textContent = getCrewRole(record);
        }

        if (el.details) {
            const fields = [
                [
                    "Record ID",
                    valueOf(record, ["id", "record_id"], "--")
                ],
                [
                    "Crew ID",
                    valueOf(record, ["crew_id", "crewId"], "--")
                ],
                [
                    "Heart Rate",
                    formatMeasurement(
                        valueOf(record, ["heart_rate", "heartRate", "hr"]),
                        "bpm"
                    )
                ],
                [
                    "Oxygen Level",
                    formatMeasurement(
                        valueOf(record, [
                            "oxygen_level",
                            "oxygen",
                            "spo2"
                        ]),
                        "%"
                    )
                ],
                [
                    "Temperature",
                    formatMeasurement(
                        valueOf(record, [
                            "temperature",
                            "body_temperature"
                        ]),
                        "°C"
                    )
                ],
                [
                    "Data Source",
                    String(record.source || "UNKNOWN").toUpperCase()
                ],
                [
                    "Recorded At",
                    formatDate(getTimestamp(record))
                ]
            ];

            el.details.innerHTML = fields.map(([label, value]) => `
                <div class="record-detail-row">
                    <strong>${escapeHTML(label)}</strong>
                    <span>${escapeHTML(value)}</span>
                </div>
            `).join("");
        }

        el.detailPanel.hidden = false;

        el.detailPanel.scrollIntoView({
            behavior: "smooth",
            block: "nearest"
        });
    }

    function closeRecordDetails() {
        if (el.detailPanel) {
            el.detailPanel.hidden = true;
        }
    }

    // ----------------------------------------------------------
    // LOAD RECORDS
    // ----------------------------------------------------------

    async function apiRequest(url) {
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
                `Unable to retrieve records (${response.status}).`
            );
        }

        return data;
    }

    async function loadRecords(options = {}) {
        if (loading) return;

        loading = true;

        const originalRefreshText = el.refresh?.textContent;

        if (el.refresh && options.manual) {
            el.refresh.disabled = true;
            el.refresh.textContent = "Refreshing...";
        }

        try {
            const [recordsResult, crewResult] = await Promise.all([
                apiRequest(API),
                apiRequest(CREW_API)
            ]);

            records = getArray(recordsResult, [
                "records",
                "health",
                "readings",
                "data"
            ]).filter(record =>
                record && typeof record === "object"
            );

            crew = getArray(crewResult, [
                "crew",
                "members",
                "records",
                "data"
            ]).filter(member =>
                member && typeof member === "object"
            );

            updateStatistics();
            renderRecords();

            if (options.manual) {
                showFeedback(
                    "Medical records refreshed successfully.",
                    "success"
                );
            } else {
                showFeedback(
                    "Medical records loaded successfully.",
                    "success"
                );
            }

        } catch (error) {
            console.error(
                "Medical records loading error:",
                error
            );

            records = [];
            crew = [];

            updateStatistics();
            renderRecords();
            closeRecordDetails();

            showFeedback(error.message, "error");

        } finally {
            loading = false;

            if (el.refresh) {
                el.refresh.disabled = false;
                el.refresh.textContent =
                    originalRefreshText || "Refresh Records";
            }
        }
    }

    // ----------------------------------------------------------
    // INITIALIZATION
    // ----------------------------------------------------------

    function initialize() {
        el.search?.addEventListener(
            "input",
            renderRecords
        );

        el.refresh?.addEventListener(
            "click",
            () => loadRecords({ manual: true })
        );

        el.close?.addEventListener(
            "click",
            closeRecordDetails
        );

        el.list?.addEventListener("click", event => {
            const button = event.target.closest(
                "[data-record-id]"
            );

            if (button && el.list.contains(button)) {
                openRecordDetails(
                    button.dataset.recordId
                );
            }
        });

        loadRecords();

        refreshTimer = window.setInterval(
            () => loadRecords(),
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
