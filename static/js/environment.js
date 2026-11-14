
(() => {
    "use strict";

    const API = "/api/environment";

    const el = {
        form: document.getElementById("environment-form"),
        temperature: document.getElementById("cabin-temperature"),
        pressure: document.getElementById("cabin-pressure"),
        oxygen: document.getElementById("cabin-oxygen"),
        humidity: document.getElementById("cabin-humidity"),
        temperatureStatus: document.getElementById("temperature-status"),
        pressureStatus: document.getElementById("pressure-status"),
        oxygenStatus: document.getElementById("oxygen-status"),
        humidityStatus: document.getElementById("humidity-status"),
        alert: document.getElementById("environment-alert"),
        source: document.getElementById("environment-source"),
        updated: document.getElementById("environment-updated"),
        history: document.getElementById("environment-history"),
        refresh: document.getElementById("refresh-environment"),
        feedback: document.getElementById("environment-form-feedback"),
        save: document.getElementById("save-environment")
    };

    let loading = false;

    function showFeedback(message, success = false) {
        if (!el.feedback) return;
        el.feedback.textContent = message;
        el.feedback.style.color = success ? "#72e4bd" : "#ff8585";
    }

    function formatDate(value) {
        if (!value) return "Time unavailable";
        const date = new Date(value);
        return Number.isNaN(date.getTime())
            ? "Time unavailable"
            : date.toLocaleString();
    }

    function number(value) {
        const result = Number(value);
        return Number.isFinite(result) ? result : null;
    }

    function display(element, value, unit) {
        if (!element) return;
        const n = number(value);
        element.textContent = n === null ? "--" : `${n.toFixed(1)} ${unit}`;
    }

    function render(records) {
        const latest = records[0];

        if (!latest) {
            display(el.temperature, null, "°C");
            display(el.pressure, null, "kPa");
            display(el.oxygen, null, "%");
            display(el.humidity, null, "%");

            el.source.textContent = "UNAVAILABLE";
            el.updated.textContent = "Reading time unavailable";
            el.alert.textContent = "No environmental readings available.";
            el.history.innerHTML =
                '<tr><td colspan="6">No environmental history available.</td></tr>';
            return;
        }

        display(el.temperature, latest.cabin_temperature, "°C");
        display(el.pressure, latest.cabin_pressure, "kPa");
        display(el.oxygen, latest.cabin_oxygen, "%");
        display(el.humidity, latest.cabin_humidity, "%");

        el.temperatureStatus.textContent = "Recorded reading";
        el.pressureStatus.textContent = "Recorded reading";
        el.oxygenStatus.textContent = "Recorded reading";
        el.humidityStatus.textContent = "Recorded reading";

        el.source.textContent = latest.source || "UNKNOWN";
        el.updated.textContent = formatDate(latest.recorded_at);

        el.alert.textContent =
            "Latest environment reading loaded. Review values against authorized mission procedures.";

        el.history.innerHTML = records.slice(0, 30).map(record => `
            <tr>
                <td>${formatDate(record.recorded_at)}</td>
                <td>${number(record.cabin_temperature)?.toFixed(1) ?? "--"} °C</td>
                <td>${number(record.cabin_pressure)?.toFixed(1) ?? "--"} kPa</td>
                <td>${number(record.cabin_oxygen)?.toFixed(1) ?? "--"} %</td>
                <td>${number(record.cabin_humidity)?.toFixed(1) ?? "--"} %</td>
                <td>${record.source || "UNKNOWN"}</td>
            </tr>
        `).join("");
    }

    async function loadEnvironment() {
        if (loading) return;
        loading = true;

        if (el.refresh) el.refresh.disabled = true;

        try {
            const response = await fetch(API, { cache: "no-store" });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Could not load readings.");
            }

            const records = Array.isArray(data.readings)
                ? data.readings
                : [];

            records.sort((a, b) =>
                new Date(b.recorded_at) - new Date(a.recorded_at)
            );

            render(records);

        } catch (error) {
            console.error(error);
            el.alert.textContent = error.message;
        } finally {
            loading = false;
            if (el.refresh) el.refresh.disabled = false;
        }
    }

    async function saveEnvironment(event) {
        event.preventDefault();

        const formData = new FormData(el.form);
        const payload = Object.fromEntries(formData.entries());

        for (const key of [
            "cabin_temperature",
            "cabin_pressure",
            "cabin_oxygen",
            "cabin_humidity"
        ]) {
            payload[key] = Number(payload[key]);
        }

        if (el.save) {
            el.save.disabled = true;
            el.save.textContent = "Saving...";
        }

        try {
            const response = await fetch(API, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "Unable to save reading.");
            }

            showFeedback("Environment reading saved successfully!", true);
            el.form.reset();
            await loadEnvironment();

        } catch (error) {
            console.error("Save environment error:", error);
            showFeedback(error.message);
        } finally {
            if (el.save) {
                el.save.disabled = false;
                el.save.textContent = "Save Environment Reading";
            }
        }
    }

    function initialize() {
        el.form?.addEventListener("submit", saveEnvironment);
        el.refresh?.addEventListener("click", loadEnvironment);

        loadEnvironment();
        window.setInterval(loadEnvironment, 15000);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
