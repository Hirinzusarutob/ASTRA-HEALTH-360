
/* ==========================================================
   ASTRA HEALTH 360 — MISSION INVENTORY MANAGEMENT
   ========================================================== */

(() => {
    "use strict";

    const API = "/api/inventory";
    const REFRESH_INTERVAL = 30000;

    const el = {
        form: document.getElementById("inventory-form"),
        name: document.getElementById("item-name"),
        category: document.getElementById("item-category"),
        quantity: document.getElementById("item-quantity"),
        minimum: document.getElementById("item-minimum"),
        unit: document.getElementById("item-unit"),
        submit: document.getElementById("add-inventory"),
        feedback: document.getElementById("inventory-form-feedback"),
        list: document.getElementById("inventory-list"),
        search: document.getElementById("inventory-search"),
        searchResult: document.getElementById("inventory-search-result"),

        total: document.getElementById("inventory-total"),
        available: document.getElementById("inventory-available"),
        low: document.getElementById("inventory-low")
    };

    let inventory = [];
    let saving = false;
    let loading = false;

    // --------------------------------------------------
    // API REQUEST
    // --------------------------------------------------

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
                data.error || data.message || "Inventory request failed."
            );
        }

        return data;
    }

    // --------------------------------------------------
    // HELPERS
    // --------------------------------------------------

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[char]);
    }

    function getName(item) {
        return item.item_name ?? item.name ?? "Unnamed item";
    }

    function getQuantity(item) {
        return Number(item.quantity ?? item.stock ?? 0);
    }

    function getMinimum(item) {
        return Number(
            item.minimum_quantity ?? item.minimum ?? 5
        );
    }

    function isLowStock(item) {
        return getQuantity(item) <= getMinimum(item);
    }

    function showFeedback(message, type = "info") {
        if (!el.feedback) return;

        el.feedback.textContent = message;
        el.feedback.className = "inventory-feedback " + type;
        el.feedback.setAttribute("role", "status");
        el.feedback.setAttribute("aria-live", "polite");
    }

    // --------------------------------------------------
    // UPDATE STATISTICS
    // --------------------------------------------------

    function updateStatistics() {

        const totalItems = inventory.length;

        const totalUnits = inventory.reduce(
            (sum, item) => sum + getQuantity(item),
            0
        );

        const lowStockItems = inventory.filter(
            isLowStock
        ).length;

        if (el.total) {
            el.total.textContent = totalItems.toLocaleString();
        }

        if (el.available) {
            el.available.textContent = totalUnits.toLocaleString();
        }

        if (el.low) {
            el.low.textContent = lowStockItems.toLocaleString();
        }
    }

    // --------------------------------------------------
    // DISPLAY INVENTORY TABLE
    // --------------------------------------------------

    function renderInventory() {

        if (!el.list) return;

        const term = (el.search?.value || "")
            .trim()
            .toLowerCase();

        const filtered = inventory.filter(item => {

            const searchable = [
                getName(item),
                item.category,
                item.unit
            ]
                .join(" ")
                .toLowerCase();

            return searchable.includes(term);
        });

        if (el.searchResult) {
            el.searchResult.textContent =
                filtered.length + " item(s) found.";
        }

        if (filtered.length === 0) {

            el.list.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center;padding:22px;">
                        No inventory items found.
                    </td>
                </tr>
            `;

            return;
        }

        el.list.innerHTML = filtered.map(item => {

            const low = isLowStock(item);

            const name = getName(item);
            const category = item.category || "General";
            const quantity = getQuantity(item);
            const minimum = getMinimum(item);
            const unit = item.unit || "units";

            return `
                <tr class="${low ? "low-stock-row" : ""}">

                    <td>
                        <strong>${escapeHTML(name)}</strong>
                    </td>

                    <td>${escapeHTML(category)}</td>

                    <td>${quantity.toLocaleString()}</td>

                    <td>${minimum.toLocaleString()}</td>

                    <td>${escapeHTML(unit)}</td>

                    <td>
                        <span class="status-badge ${low ? "warning" : "normal"}">
                            ${low ? "Low Stock" : "Available"}
                        </span>
                    </td>

                </tr>
            `;

        }).join("");
    }

    // --------------------------------------------------
    // LOAD INVENTORY FROM FLASK DATABASE
    // --------------------------------------------------

    async function loadInventory() {

        if (loading) return;

        loading = true;

        try {

            const result = await apiRequest(API);

            inventory = Array.isArray(result)
                ? result
                : result.inventory || result.items || [];

            updateStatistics();
            renderInventory();

        } catch (error) {

            console.error("Inventory loading error:", error);

            if (el.list) {
                el.list.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align:center;padding:20px;">
                            Unable to load inventory. Check Flask server.
                        </td>
                    </tr>
                `;
            }

            showFeedback(error.message, "error");

        } finally {
            loading = false;
        }
    }

    // --------------------------------------------------
    // ADD NEW SUPPLY
    // --------------------------------------------------

    async function addInventoryItem(event) {

        event.preventDefault();

        if (saving) return;

        const name = el.name.value.trim();

        const category =
            el.category.value.trim() || "General";

        const quantityText = el.quantity.value;
        const minimumText = el.minimum.value;

        const quantity = Number(quantityText);
        const minimum = Number(minimumText);

        const unit =
            el.unit.value.trim() || "units";

        if (!name || name.length > 100) {
            showFeedback(
                "Enter a valid item name (maximum 100 characters).",
                "error"
            );
            el.name.focus();
            return;
        }

        if (category.length > 80) {
            showFeedback("Category is too long.", "error");
            el.category.focus();
            return;
        }

        if (
            quantityText === "" ||
            !Number.isSafeInteger(quantity) ||
            quantity < 0
        ) {
            showFeedback(
                "Enter a valid whole-number quantity.",
                "error"
            );
            el.quantity.focus();
            return;
        }

        if (
            minimumText === "" ||
            !Number.isSafeInteger(minimum) ||
            minimum < 0
        ) {
            showFeedback(
                "Enter a valid minimum quantity.",
                "error"
            );
            el.minimum.focus();
            return;
        }

        if (!unit || unit.length > 30) {
            showFeedback("Enter a valid unit.", "error");
            el.unit.focus();
            return;
        }

        saving = true;

        const originalText = el.submit.textContent;

        el.submit.disabled = true;
        el.submit.textContent = "ADDING...";

        try {

            // IMPORTANT:
            // Flask expects item_name, not name.

            await apiRequest(API, {
                method: "POST",

                body: JSON.stringify({
                    item_name: name,
                    category: category,
                    quantity: quantity,
                    minimum_quantity: minimum,
                    unit: unit
                })
            });

            el.form.reset();

            showFeedback(
                "Supply added successfully!",
                "success"
            );

            await loadInventory();

        } catch (error) {

            console.error("Inventory save error:", error);

            showFeedback(
                error.message || "Unable to add supply.",
                "error"
            );

        } finally {

            saving = false;

            el.submit.disabled = false;
            el.submit.textContent = originalText || "Add Supply";
        }
    }

    // --------------------------------------------------
    // INITIALIZE INVENTORY
    // --------------------------------------------------

    function initialize() {

        if (!el.form) {
            console.error("Inventory form not found.");
            return;
        }

        el.form.addEventListener(
            "submit",
            addInventoryItem
        );

        if (el.search) {
            el.search.addEventListener(
                "input",
                renderInventory
            );
        }

        loadInventory();

        window.setInterval(
            loadInventory,
            REFRESH_INTERVAL
        );

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
