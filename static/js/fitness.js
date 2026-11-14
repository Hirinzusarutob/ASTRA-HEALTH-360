
/* ==========================================================
   ASTRA HEALTH 360 — ASTRONAUT FITNESS MODULE
   File: static/js/fitness.js

   Features:
   - Select astronaut
   - Start and stop workout timer
   - Estimate calories burned
   - Save workout sessions to Flask
   - Display workout history and statistics
   - Prevent invalid workout submissions
   ========================================================== */

(() => {
    "use strict";

    const API = {
        crew: "/api/crew",
        fitness: "/api/fitness",
        health: "/api/health"
    };

    const el = {
        crew: document.getElementById("fitness-crew"),
        timer: document.getElementById("fitness-timer"),
        calories: document.getElementById("fitness-calories"),
        start: document.getElementById("start-workout"),
        stop: document.getElementById("stop-workout"),
        feedback: document.getElementById("fitness-feedback"),
        sessions: document.getElementById("fitness-session-count"),
        duration: document.getElementById("fitness-total-duration"),
        totalCalories: document.getElementById("fitness-total-calories"),
        heartRate: document.getElementById("fitness-heart-rate"),
        history: document.getElementById("fitness-history")
    };

    let crewMembers = [];
    let sessions = [];

    let startTime = null;
    let timerInterval = null;
    let refreshInterval = null;

    let elapsedSeconds = 0;
    let selectedCrewId = null;

    let saving = false;
    let loading = false;
    let workoutRunning = false;

    // Illustrative estimate, not a measured calorie value.
    const ESTIMATED_CALORIES_PER_MINUTE = 5;

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

    async function apiRequest(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: {
                Accept: "application/json",
                ...(options.body ? {
                    "Content-Type": "application/json"
                } : {}),
                ...(options.headers || {})
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

    function showFeedback(message, type = "info") {
        if (!el.feedback) return;

        el.feedback.textContent = message;
        el.feedback.className = `fitness-feedback ${type}`;
        el.feedback.setAttribute("role", "status");
        el.feedback.setAttribute("aria-live", "polite");
    }

    function formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remaining = seconds % 60;

        return [
            String(hours).padStart(2, "0"),
            String(minutes).padStart(2, "0"),
            String(remaining).padStart(2, "0")
        ].join(":");
    }

    function formatDate(value) {
        if (!value) return "Date unavailable";

        const date = new Date(value);

        return Number.isNaN(date.getTime())
            ? String(value)
            : date.toLocaleString();
    }

    /* ================= TIMER ================= */

    function updateTimer() {
        if (!startTime) return;

        elapsedSeconds = Math.max(
            0,
            Math.floor((Date.now() - startTime) / 1000)
        );

        if (el.timer) {
            el.timer.textContent = formatTime(elapsedSeconds);
        }

        const estimatedCalories = Math.round(
            (elapsedSeconds / 60) *
            ESTIMATED_CALORIES_PER_MINUTE
        );

        if (el.calories) {
            el.calories.textContent = estimatedCalories;
        }
    }

    function resetTimer() {
        elapsedSeconds = 0;
        startTime = null;

        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }

        if (el.timer) {
            el.timer.textContent = "00:00:00";
        }

        if (el.calories) {
            el.calories.textContent = "0";
        }
    }

    function setWorkoutControls(running) {
        workoutRunning = running;

        if (el.start) {
            el.start.disabled = running || saving;
        }

        if (el.stop) {
            el.stop.disabled = !running || saving;
        }

        if (el.crew) {
            el.crew.disabled = running || saving;
        }
    }

    /* ================= CREW ================= */

    function loadCrewOptions() {
        if (!el.crew) return;

        const previousValue = workoutRunning
            ? selectedCrewId
            : el.crew.value;

        el.crew.innerHTML = `
            <option value="">Select astronaut</option>
            ${crewMembers.map(member => `
                <option value="${escapeHTML(member.id)}">
                    ${escapeHTML(member.name || "Unnamed astronaut")}
                </option>
            `).join("")}
        `;

        if (
            previousValue !== null &&
            previousValue !== undefined &&
            crewMembers.some(member =>
                String(member.id) === String(previousValue)
            )
        ) {
            el.crew.value = previousValue;
        }
    }

    /* ================= STATISTICS ================= */

    function updateStatistics() {
        const totalSessions = sessions.length;

        const totalMinutes = sessions.reduce((sum, session) => {
            return sum +
                (validNumber(session.duration_minutes) ?? 0);
        }, 0);

        const totalCalories = sessions.reduce((sum, session) => {
            return sum + (
                validNumber(
                    session.estimated_calories ??
                    session.calories_burned
                ) ?? 0
            );
        }, 0);

        if (el.sessions) {
            el.sessions.textContent = totalSessions;
        }

        if (el.duration) {
            el.duration.textContent = totalMinutes.toFixed(1);
        }

        if (el.totalCalories) {
            el.totalCalories.textContent = Math.round(totalCalories);
        }
    }

    /* ================= WORKOUT HISTORY ================= */

    function renderHistory() {
        if (!el.history) return;

        if (!sessions.length) {
            el.history.innerHTML = `
                <div class="empty-state" style="padding:22px;text-align:center;">
                    <div style="font-size:30px;">🏃</div>
                    <strong>No workout sessions recorded</strong>
                    <p>Start a workout to create the first record.</p>
                </div>
            `;
            return;
        }

        const sorted = [...sessions].sort((a, b) => {
            const dateA = new Date(
                a.created_at || a.timestamp || 0
            ).getTime();

            const dateB = new Date(
                b.created_at || b.timestamp || 0
            ).getTime();

            return dateB - dateA;
        });

        el.history.innerHTML = sorted.map(session => {
            const member = crewMembers.find(person =>
                String(person.id) === String(session.crew_id)
            );

            const name = member?.name ||
                `Crew member #${session.crew_id ?? "Unknown"}`;

            const calories = validNumber(
                session.estimated_calories ??
                session.calories_burned
            ) ?? 0;

            const duration = validNumber(
                session.duration_minutes
            ) ?? 0;

            return `
                <article class="fitness-history-card">
                    <div class="fitness-history-icon">🚀</div>

                    <div class="fitness-history-content">
                        <strong>${escapeHTML(name)}</strong>

                        <p>
                            Duration:
                            ${escapeHTML(duration)} minutes
                        </p>

                        <p>
                            Estimated calories:
                            ${escapeHTML(Math.round(calories))} kcal
                        </p>

                        <small>
                            ${escapeHTML(formatDate(
                                session.created_at || session.timestamp
                            ))}
                        </small>
                    </div>
                </article>
            `;
        }).join("");
    }

    /* ================= HEALTH INFORMATION ================= */

    function updateLatestHeartRate(records) {
        if (!el.heartRate) return;

        const validRecords = records
            .map(record => ({
                value: validNumber(
                    record.heart_rate ?? record.heartRate
                ),
                date: new Date(
                    record.recorded_at ??
                    record.created_at ??
                    record.timestamp ??
                    0
                ).getTime()
            }))
            .filter(record =>
                record.value !== null &&
                Number.isFinite(record.date)
            )
            .sort((a, b) => b.date - a.date);

        el.heartRate.textContent = validRecords.length
            ? `${validRecords[0].value} bpm`
            : "--";
    }

    /* ================= LOAD DATA ================= */

    async function loadData() {
        if (loading) return;

        loading = true;

        try {
            const results = await Promise.allSettled([
                apiRequest(API.crew),
                apiRequest(API.fitness),
                apiRequest(API.health)
            ]);

            const [crewResult, fitnessResult, healthResult] = results;

            if (crewResult.status === "fulfilled") {
                crewMembers = getArray(crewResult.value, [
                    "crew",
                    "members",
                    "records",
                    "data"
                ]);

                loadCrewOptions();
            } else {
                console.error("Crew loading error:", crewResult.reason);
            }

            if (fitnessResult.status === "fulfilled") {
                sessions = getArray(fitnessResult.value, [
                    "sessions",
                    "fitness",
                    "records",
                    "data"
                ]);

                updateStatistics();
                renderHistory();
            } else {
                console.error(
                    "Fitness loading error:",
                    fitnessResult.reason
                );

                showFeedback(
                    "Could not load workout history.",
                    "error"
                );
            }

            if (healthResult.status === "fulfilled") {
                const healthRecords = getArray(
                    healthResult.value,
                    ["records", "health", "readings", "data"]
                );

                updateLatestHeartRate(healthRecords);
            } else {
                if (el.heartRate) {
                    el.heartRate.textContent = "--";
                }

                console.error(
                    "Health loading error:",
                    healthResult.reason
                );
            }

        } catch (error) {
            console.error("Fitness loading error:", error);
            showFeedback(error.message, "error");

        } finally {
            loading = false;
        }
    }

    /* ================= START WORKOUT ================= */

    function startWorkout() {
        if (saving) return;

        if (workoutRunning) {
            showFeedback(
                "A workout is already running.",
                "warning"
            );
            return;
        }

        if (!el.crew?.value) {
            showFeedback(
                "Please select an astronaut first.",
                "error"
            );
            return;
        }

        selectedCrewId = el.crew.value;

        startTime = Date.now() - (elapsedSeconds * 1000);

        setWorkoutControls(true);

        timerInterval = window.setInterval(updateTimer, 1000);

        updateTimer();

        showFeedback(
            "Workout started. Timer is running.",
            "success"
        );
    }

    /* ================= STOP AND SAVE WORKOUT ================= */

    async function stopWorkout() {
        if (!workoutRunning || !startTime || saving) return;

        updateTimer();

        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }

        startTime = null;
        workoutRunning = false;

        if (elapsedSeconds < 1) {
            setWorkoutControls(false);

            showFeedback(
                "Workout was too short to save.",
                "warning"
            );

            return;
        }

        const crewId = selectedCrewId;

        /*
         * Backend accepts integer duration_minutes.
         * Round up so even a short completed workout
         * is not submitted as zero minutes.
         */
        const durationMinutes = Math.ceil(elapsedSeconds / 60);

        if (durationMinutes < 1 || durationMinutes > 1440) {
            setWorkoutControls(false);

            showFeedback(
                "Workout duration must be between 1 minute and 24 hours.",
                "error"
            );

            return;
        }

        const estimatedCalories = Math.round(
            (elapsedSeconds / 60) *
            ESTIMATED_CALORIES_PER_MINUTE
        );

        if (
            !Number.isFinite(estimatedCalories) ||
            estimatedCalories < 0 ||
            estimatedCalories > 5000
        ) {
            setWorkoutControls(false);

            showFeedback(
                "Estimated calorie value is outside the allowed range.",
                "error"
            );

            return;
        }

        saving = true;
        setWorkoutControls(false);

        if (el.start) el.start.disabled = true;
        if (el.stop) el.stop.disabled = true;

        showFeedback("Saving workout session...", "info");

        try {
            await apiRequest(API.fitness, {
                method: "POST",
                body: JSON.stringify({
                    crew_id: Number(crewId),
                    duration_minutes: durationMinutes,
                    estimated_calories: estimatedCalories
                })
            });

            showFeedback(
                "Workout saved successfully. Calorie value is an estimate.",
                "success"
            );

            resetTimer();
            selectedCrewId = null;

            if (el.crew) {
                el.crew.disabled = false;
                el.crew.value = "";
            }

            await loadData();

        } catch (error) {
            console.error("Workout save error:", error);

            /*
             * Keep elapsedSeconds and the selected crew.
             * The user can restart the timer and retry.
             */
            showFeedback(
                `Workout could not be saved: ${error.message}. Your timer value has been retained. Press Start to retry.`,
                "error"
            );

            selectedCrewId = crewId;

        } finally {
            saving = false;
            setWorkoutControls(false);
        }
    }

    /* ================= INITIALIZATION ================= */

    function initialize() {
        el.start?.addEventListener("click", startWorkout);
        el.stop?.addEventListener("click", stopWorkout);

        if (el.stop) {
            el.stop.disabled = true;
        }

        if (el.start) {
            el.start.disabled = false;
        }

        loadData();

        refreshInterval = window.setInterval(
            loadData,
            30000
        );

        window.addEventListener("beforeunload", () => {
            if (timerInterval) {
                clearInterval(timerInterval);
            }

            if (refreshInterval) {
                clearInterval(refreshInterval);
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
