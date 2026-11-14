
/* ==========================================================
   ASTRA HEALTH 360 — MEDICATION INVENTORY

   Features:
   - Load medication inventory
   - Search medicines
   - Identify low-stock supplies
   - Increase and decrease stock
   - Delete inventory records
   - Display stock statistics
   - Low-stock reminders
   - Automatic refresh

   NOTE:
   This module manages inventory records only.
   It does not schedule or administer medication.
   ========================================================== */

(() => {
    "use strict";

    const API = "/api/medication";
    const REFRESH_INTERVAL = 30000;

    const el = {
        count: document.getElementById("medicine-count"),
        reminders: document.getElementById("reminder-count"),
        list: document.getElementById("medication-list"),
        testReminder: document.getElementById("test-reminder"),
        feedback: document.getElementById("reminder-feedback"),
        search: document.getElementById("medication-search")
    };

    let medicines = [];
    let loading = false;
    let refreshTimer = null;

    // Prevent multiple simultaneous actions on the same item.
    const busyItems = new Set();

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

    function numberValue(value, fallback = 0) {
        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {
            return fallback;
        }

        const number = Number(value);

        return Number.isFinite(number) ? number : fallback;
    }

    function quantityOf(item) {
        return numberValue(
            item?.quantity ?? item?.stock,
            0
        );
    }

    function minimumOf(item) {
        return numberValue(
            item?.minimum_quantity ?? item?.minimum,
            5
        );
    }

    function isLowStock(item) {
        return quantityOf(item) <= minimumOf(item);
    }

    function getItemId(item) {
        return item?.id ?? item?.medication_id ?? null;
    }

    function getItemById(id) {
        return medicines.find(item =>
            String(getItemId(item)) === String(id)
        );
    }

    function formatNumber(value) {
        return Number(value).toLocaleString();
    }

    function getArray(data) {
        if (Array.isArray(data)) {
            return data;
        }

        if (!data || typeof data !== "object") {
            return [];
        }

        const records =
            data.medications ??
            data.medicines ??
            data.inventory ??
            data.records ??
            data.data;

        return Array.isArray(records) ? records : [];
    }

    function showFeedback(message, type = "info") {
        if (!el.feedback) return;

        el.feedback.textContent = message;
        el.feedback.className = `medication-feedback ${type}`;
        el.feedback.setAttribute("role", "status");
        el.feedback.setAttribute("aria-live", "polite");
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
            throw new Error(
                data.error ||
                data.message ||
                "Medication inventory request failed."
            );
        }

        return data;
    }

    // ----------------------------------------------------------
    // STATISTICS
    // ----------------------------------------------------------

    function updateStatistics() {
        const lowStock = medicines.filter(isLowStock).length;

        if (el.count) {
            el.count.textContent = formatNumber(medicines.length);
        }

        if (el.reminders) {
            el.reminders.textContent = formatNumber(lowStock);
        }
    }

    // ----------------------------------------------------------
    // SEARCH
    // ----------------------------------------------------------

    function getFilteredMedicines() {
        const term = (el.search?.value || "")
            .trim()
            .toLowerCase();

        if (!term) {
            return medicines;
        }

        return medicines.filter(item => {
            const searchable = [
                item.name,
                item.category,
                item.unit,
                item.notes
            ]
                .map(value => String(value ?? ""))
                .join(" ")
                .toLowerCase();

            return searchable.includes(term);
        });
    }

    // ----------------------------------------------------------
    // RENDER MEDICATION CARDS
    // ----------------------------------------------------------

    function renderMedicines() {
        if (!el.list) return;

        const filtered = getFilteredMedicines();

        if (!filtered.length) {
            el.list.innerHTML = `
                <div class="empty-state" style="padding:24px;text-align:center;">
                    <div style="font-size:32px;">💊</div>
                    <strong>
                        ${medicines.length
                            ? "No matching medicines found"
                            : "No medication records found"}
                    </strong>
                    <p>
                        ${medicines.length
                            ? "Try another search term."
                            : "Add medical supplies to begin tracking inventory."}
                    </p>
                </div>
            `;
            return;
        }

        el.list.innerHTML = filtered.map(item => {
            const low = isLowStock(item);

            const id = getItemId(item);
            const hasId = id !== null && id !== undefined;

            const idAttribute = hasId
                ? escapeHTML(id)
                : "";

            const busy = hasId && busyItems.has(String(id));

            const quantity = quantityOf(item);
            const minimum = minimumOf(item);

            return `
                <article class="medication-card">

                    <div class="medication-card-header">
                        <strong>
                            ${escapeHTML(item.name || "Unnamed item")}
                        </strong>

                        <span class="status-badge ${low ? "warning" : "normal"}">
                            ${low ? "Low stock" : "Stock available"}
                        </span>
                    </div>

                    <p>
                        Category:
                        ${escapeHTML(item.category || "Medical supply")}
                    </p>

                    <p>
                        Quantity:
                        <strong>${escapeHTML(formatNumber(quantity))}</strong>
                        ${escapeHTML(item.unit || "units")}
                    </p>

                    <p>
                        Minimum stock:
                        ${escapeHTML(formatNumber(minimum))}
                    </p>

                    ${item.notes
                        ? `<p>${escapeHTML(item.notes)}</p>`
                        : ""}

                    <div class="medication-actions">

                        <button
                            type="button"
                            data-action="add"
                            data-id="${idAttribute}"
                            ${!hasId || busy ? "disabled" : ""}>
                            ${busy ? "Please wait..." : "Add 1"}
                        </button>

                        <button
                            type="button"
                            data-action="remove"
                            data-id="${idAttribute}"
                            ${!hasId || busy || quantity <= 0 ? "disabled" : ""}>
                            Remove 1
                        </button>

                        <button
                            type="button"
                            data-action="delete"
                            data-id="${idAttribute}"
                            ${!hasId || busy ? "disabled" : ""}>
                            Delete
                        </button>

                    </div>
                </article>
            `;
        }).join("");
    }

    function renderLoadError() {
        if (!el.list) return;

        el.list.innerHTML = `
            <div class="empty-state" style="padding:24px;text-align:center;">
                <strong>Unable to load medication inventory.</strong>
                <p>Please check the Flask server and try again.</p>
            </div>
        `;
    }

    // ----------------------------------------------------------
    // LOAD MEDICATIONS
    // ----------------------------------------------------------

    async function loadMedicines() {
        if (loading) return;

        loading = true;

        try {
            const result = await apiRequest(API);

            medicines = getArray(result);

            updateStatistics();
            renderMedicines();

        } catch (error) {
            console.error("Medication loading error:", error);

            medicines = [];

            updateStatistics();
            renderLoadError();

            showFeedback(error.message, "error");

        } finally {
            loading = false;
        }
    }

    // ----------------------------------------------------------
    // UPDATE MEDICATION QUANTITY
    // ----------------------------------------------------------

    async function updateQuantity(id, change) {
        const item = getItemById(id);

        if (!item) {
            showFeedback("Medication item not found.", "error");
            return;
        }

        const key = String(id);

        if (busyItems.has(key)) return;

        const currentQuantity = quantityOf(item);
        const newQuantity = currentQuantity + change;

        if (newQuantity < 0) {
            showFeedback(
                "Stock quantity cannot be negative.",
                "error"
            );
            return;
        }

        busyItems.add(key);
        renderMedicines();

        try {
            await apiRequest(
                `${API}/${encodeURIComponent(id)}`,
                {
                    method: "PUT",
                    body: JSON.stringify({
                        quantity: newQuantity
                    })
                }
            );

            showFeedback(
                "Medication stock updated successfully.",
                "success"
            );

            await loadMedicines();

        } catch (error) {
            console.error("Medication update error:", error);

            showFeedback(error.message, "error");

        } finally {
            busyItems.delete(key);
            renderMedicines();
        }
    }

    // ----------------------------------------------------------
    // DELETE MEDICATION
    // ----------------------------------------------------------

    async function deleteMedicine(id) {
        const item = getItemById(id);

        if (!item) {
            showFeedback("Medication item not found.", "error");
            return;
        }

        const key = String(id);

        if (busyItems.has(key)) return;

        const confirmed = window.confirm(
            `Delete ${item.name || "this item"} from medication inventory?`
        );

        if (!confirmed) return;

        busyItems.add(key);
        renderMedicines();

        try {
            await apiRequest(
                `${API}/${encodeURIComponent(id)}`,
                {
                    method: "DELETE"
                }
            );

            showFeedback(
                "Medication item deleted successfully.",
                "success"
            );

            await loadMedicines();

        } catch (error) {
            console.error("Medication delete error:", error);

            showFeedback(error.message, "error");

        } finally {
            busyItems.delete(key);
            renderMedicines();
        }
    }

    // ----------------------------------------------------------
    // HANDLE INVENTORY ACTIONS
    // ----------------------------------------------------------

    function handleInventoryAction(event) {
        const button = event.target.closest("[data-action]");

        if (!button || !el.list?.contains(button)) {
            return;
        }

        const id = button.dataset.id;
        const action = button.dataset.action;

        if (!id) return;

        if (action === "add") {
            updateQuantity(id, 1);

        } else if (action === "remove") {
            updateQuantity(id, -1);

        } else if (action === "delete") {
            deleteMedicine(id);
        }
    }

    // ----------------------------------------------------------
    // LOW-STOCK REMINDER
    // ----------------------------------------------------------

    function showLowStockReminder() {
        const lowItems = medicines.filter(isLowStock);

        if (!lowItems.length) {
            showFeedback(
                "All tracked items are above their minimum stock levels.",
                "success"
            );
            return;
        }

        const reminderText = lowItems
            .map(item =>
                `${item.name || "Unnamed item"}: ${quantityOf(item)} ${item.unit || "units"} remaining`
            )
            .join("\n");

        window.alert(
            `LOW STOCK INVENTORY REMINDER\n\n${reminderText}\n\nPlease review these supplies with the mission medical officer.`
        );
    }

    // ----------------------------------------------------------
    // EVENT LISTENERS
    // ----------------------------------------------------------

    function attachEvents() {
        el.list?.addEventListener(
            "click",
            handleInventoryAction
        );

        el.testReminder?.addEventListener(
            "click",
            showLowStockReminder
        );

        el.search?.addEventListener(
            "input",
            renderMedicines
        );
    }

    // ----------------------------------------------------------
    // INITIALIZATION
    // ----------------------------------------------------------

    function initialize() {
        attachEvents();

        loadMedicines();

        if (refreshTimer) {
            window.clearInterval(refreshTimer);
        }

        refreshTimer = window.setInterval(
            loadMedicines,
            REFRESH_INTERVAL
        );
    }

    document.addEventListener(
        "DOMContentLoaded",
        initialize,
        { once: true }
    );

})();
