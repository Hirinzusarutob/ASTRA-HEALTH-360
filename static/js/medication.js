
(() => {
    "use strict";

    const API = "/api/medication";

    const el = {
        count: document.getElementById("medicine-count"),
        reminders: document.getElementById("reminder-count"),
        list: document.getElementById("medication-list"),
        form: document.getElementById("medication-form"),
        name: document.getElementById("medicine-name"),
        quantity: document.getElementById("medicine-quantity"),
        minimum: document.getElementById("medicine-minimum"),
        notes: document.getElementById("medicine-notes"),
        feedback: document.getElementById("medication-feedback"),
        search: document.getElementById("medication-search"),
        testReminder: document.getElementById("test-reminder")
    };

    let medicines = [];
    let loading = false;

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;",
            '"': "&quot;", "'": "&#039;"
        })[char]);
    }

    function quantityOf(item) {
        return Number(item.quantity ?? 0);
    }

    function minimumOf(item) {
        return Number(item.minimum_quantity ?? 5);
    }

    function isLowStock(item) {
        return quantityOf(item) <= minimumOf(item);
    }

    function showFeedback(message, type = "info") {
        if (!el.feedback) return;
        el.feedback.textContent = message;
        el.feedback.className = `form-feedback ${type}`;
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
            throw new Error(data.error || data.message ||
                "Medication request failed.");
        }

        return data;
    }

    function updateStatistics() {
        if (el.count) el.count.textContent = medicines.length;

        if (el.reminders) {
            el.reminders.textContent =
                medicines.filter(isLowStock).length;
        }
    }

    function renderMedicines() {
        if (!el.list) return;

        const term = (el.search?.value || "").trim().toLowerCase();

        const filtered = medicines.filter(item =>
            String(item.item_name || "").toLowerCase().includes(term)
        );

        if (!filtered.length) {
            el.list.innerHTML = `
                <tr><td colspan="5">
                    ${medicines.length
                        ? "No matching medicines found."
                        : "No medication records found. Add supplies using the form above."}
                </td></tr>`;
            return;
        }

        el.list.innerHTML = filtered.map(item => {
            const low = isLowStock(item);

            return `
                <tr>
                    <td>${escapeHTML(item.item_name)}</td>
                    <td>${quantityOf(item)}</td>
                    <td>${minimumOf(item)}</td>
                    <td>
                        <span class="status-badge ${low ? "warning" : "normal"}">
                            ${low ? "Low Stock" : "Available"}
                        </span>
                    </td>
                    <td>${escapeHTML(item.notes || "—")}</td>
                </tr>`;
        }).join("");
    }

    async function loadMedicines() {
        if (loading) return;
        loading = true;

        try {
            const result = await apiRequest(API);
            medicines = Array.isArray(result) ? result : [];
            updateStatistics();
            renderMedicines();
        } catch (error) {
            console.error("Medication loading error:", error);
            showFeedback(error.message, "error");
            if (el.list) {
                el.list.innerHTML =
                    '<tr><td colspan="5">Unable to load inventory.</td></tr>';
            }
        } finally {
            loading = false;
        }
    }

    async function addMedicine(event) {
        event.preventDefault();

        const payload = {
            item_name: el.name.value.trim(),
            quantity: Number(el.quantity.value),
            minimum_quantity: Number(el.minimum.value),
            notes: el.notes.value.trim()
        };

        if (!payload.item_name ||
            !Number.isInteger(payload.quantity) ||
            !Number.isInteger(payload.minimum_quantity) ||
            payload.quantity < 0 ||
            payload.minimum_quantity < 0) {
            showFeedback("Enter valid medicine details.", "error");
            return;
        }

        const button = el.form.querySelector('button[type="submit"]');
        button.disabled = true;

        try {
            await apiRequest(API, {
                method: "POST",
                body: JSON.stringify(payload)
            });

            el.form.reset();
            el.minimum.value = 5;

            showFeedback("Medicine added successfully!", "success");
            await loadMedicines();

        } catch (error) {
            console.error("Medication save error:", error);
            showFeedback(error.message, "error");
        } finally {
            button.disabled = false;
        }
    }

    function showLowStockReminder() {
        const lowItems = medicines.filter(isLowStock);

        if (!lowItems.length) {
            showFeedback("No low-stock items found.", "success");
            return;
        }

        window.alert(
            "LOW STOCK ITEMS\n\n" +
            lowItems.map(item =>
                `${item.item_name}: ${quantityOf(item)} remaining`
            ).join("\n")
        );
    }

    function initialize() {
        el.form?.addEventListener("submit", addMedicine);
        el.search?.addEventListener("input", renderMedicines);
        el.testReminder?.addEventListener("click", showLowStockReminder);

        loadMedicines();
        window.setInterval(loadMedicines, 30000);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
