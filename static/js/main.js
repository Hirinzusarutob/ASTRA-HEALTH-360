
document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    // Highlight the current page in the sidebar.
    function updateActiveNavigation() {
        const currentPath = window.location.pathname.replace(/\/$/, "") || "/";

        document.querySelectorAll(".sidebar a[href]").forEach(link => {
            const linkPath = new URL(link.href, window.location.origin)
                .pathname.replace(/\/$/, "") || "/";

            const isActive = linkPath === currentPath;

            link.classList.toggle("active", isActive);

            if (isActive) {
                link.setAttribute("aria-current", "page");
            } else {
                link.removeAttribute("aria-current");
            }
        });
    }

    // Update visible clocks, if the HTML contains a clock element.
    function updateClock() {
        const clock = document.getElementById("astra-clock");

        if (clock) {
            clock.textContent = new Date().toLocaleString();
        }
    }

    // Check whether the Flask backend is responding.
    async function checkBackend() {
        const indicators = document.querySelectorAll(
            "#system-connection, .system-connection, [data-backend-status]"
        );

        try {
            const response = await fetch("/api/status");

            if (!response.ok) {
                throw new Error("Backend unavailable");
            }

            const data = await response.json();

            indicators.forEach(indicator => {
                indicator.textContent = "SYSTEM ONLINE";
                indicator.classList.remove("offline");
                indicator.classList.add("online");
            });

            document.documentElement.dataset.backend = "online";

            return data;

        } catch (error) {
            indicators.forEach(indicator => {
                indicator.textContent = "SYSTEM OFFLINE";
                indicator.classList.remove("online");
                indicator.classList.add("offline");
            });

            document.documentElement.dataset.backend = "offline";

            console.error("ASTRA backend connection:", error);

            return null;
        }
    }

    // Prevent accidental double submission of forms.
    document.querySelectorAll("form").forEach(form => {
        form.addEventListener("submit", () => {
            const button = form.querySelector(
                'button[type="submit"], input[type="submit"]'
            );

            if (button) {
                button.dataset.originalText =
                    button.textContent || button.value || "";

                button.setAttribute("aria-busy", "true");
            }
        });
    });

    // Start global functions.
    updateActiveNavigation();
    updateClock();
    checkBackend();

    setInterval(updateClock, 1000);
    setInterval(checkBackend, 30000);

    // Expose shared helpers for other page scripts.
    window.ASTRA = window.ASTRA || {};

    window.ASTRA.checkBackend = checkBackend;
    window.ASTRA.updateActiveNavigation = updateActiveNavigation;
});
