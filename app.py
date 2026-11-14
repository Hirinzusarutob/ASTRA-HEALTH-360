
import os
import sqlite3
from functools import wraps

from flask import Flask, jsonify, render_template, request

from config import Config

from services.ai_service import ask_astra
from services.mission_copilot import build_mission_context

from services.health_service import (
    save_health_record,
    get_all_health_records,
    get_latest_health_record
)

from services.alert_service import (
    create_alert,
    get_all_alerts,
    get_active_alert_count,
    update_alert_status,
    delete_alert
)

from services.simulation_service import (
    simulate_crew_health,
    simulate_all_crew_health,
    get_simulation_summary
)

from services.mission_intelligence import (
    analyse_health_reading,
    analyse_multiple_readings
)

from services.iot_service import (
    generate_sensor_network,
    get_sensor_status
)

from services.space_tracking_service import (
    get_iss_position,
    get_tracking_status
)

from services.satellite_service import (
    transmit_message,
    get_message_history,
    get_communication_status
)

from services.dataset_service import (
    get_dataset_summary,
    get_dataset_records
)


# ==================================================
# FLASK APPLICATION CONFIGURATION
# ==================================================

app = Flask(__name__)
app.config.from_object(Config)

database_folder = os.path.dirname(Config.DATABASE_PATH)

if database_folder:
    os.makedirs(database_folder, exist_ok=True)


# ==================================================
# DATABASE CONNECTION
# ==================================================

def get_db_connection():
    connection = sqlite3.connect(Config.DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def add_column_if_missing(connection, table, column, definition):
    columns = [
        row["name"]
        for row in connection.execute(
            f"PRAGMA table_info({table})"
        ).fetchall()
    ]

    if column not in columns:
        connection.execute(
            f"ALTER TABLE {table} ADD COLUMN {column} {definition}"
        )


def crew_exists(connection, crew_id):
    if crew_id is None:
        return False

    return connection.execute(
        "SELECT 1 FROM crew WHERE id = ?", (crew_id,)
    ).fetchone() is not None


# ==================================================
# DATABASE INITIALIZATION AND MIGRATIONS
# ==================================================

def initialize_database():
    connection = get_db_connection()

    try:
        connection.executescript("""
            CREATE TABLE IF NOT EXISTS crew (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                role TEXT,
                mission_status TEXT DEFAULT 'Active',
                notes TEXT DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS health_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                crew_id INTEGER,
                heart_rate REAL,
                oxygen_level REAL,
                body_temperature REAL,
                recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (crew_id) REFERENCES crew(id)
            );

            CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                severity TEXT,
                status TEXT DEFAULT 'Active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS wellness_checkins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                crew_id INTEGER,
                mood TEXT NOT NULL,
                recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS fitness_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                crew_id INTEGER,
                duration_minutes INTEGER,
                calories_burned INTEGER,
                recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS inventory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_name TEXT NOT NULL,
                quantity INTEGER DEFAULT 0,
                minimum_quantity INTEGER DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                channel TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS environment_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cabin_temperature REAL,
                cabin_pressure REAL,
                cabin_oxygen REAL,
                cabin_humidity REAL,
                source TEXT DEFAULT 'SENSOR',
                recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS medication_inventory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_name TEXT NOT NULL,
                quantity INTEGER DEFAULT 0,
                minimum_quantity INTEGER DEFAULT 1,
                notes TEXT DEFAULT '',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # Safely extend older database tables.
        add_column_if_missing(
            connection, "crew", "notes", "TEXT DEFAULT ''"
        )

        add_column_if_missing(
            connection, "inventory", "category",
            "TEXT DEFAULT 'General'"
        )

        add_column_if_missing(
            connection, "inventory", "unit",
            "TEXT DEFAULT 'units'"
        )

        add_column_if_missing(
            connection, "messages", "sender",
            "TEXT DEFAULT 'Crew Member'"
        )

        add_column_if_missing(
            connection, "alerts", "description",
            "TEXT DEFAULT ''"
        )

        add_column_if_missing(
            connection, "health_records", "source",
            "TEXT DEFAULT 'UNKNOWN'"
        )

        add_column_if_missing(
            connection, "wellness_checkins", "notes",
            "TEXT DEFAULT ''"
        )

        crew_count = connection.execute(
            "SELECT COUNT(*) FROM crew"
        ).fetchone()[0]

        if crew_count == 0:
            crew_members = [
                ("Alex Morgan", "Mission Commander", "Active"),
                ("Sarah Chen", "Flight Engineer", "Active"),
                ("David Wilson", "Medical Officer", "Active"),
                ("Maya Patel", "Scientist", "Active"),
                ("Ryan Cooper", "Pilot", "Active"),
                ("Elena Rodriguez", "Mission Specialist", "Active")
            ]

            connection.executemany("""
                INSERT INTO crew (name, role, mission_status)
                VALUES (?, ?, ?)
            """, crew_members)

        connection.commit()

    except Exception:
        connection.rollback()
        app.logger.exception("Database initialization failed")
        raise

    finally:
        connection.close()


# IMPORTANT:
# This runs when Render/Gunicorn imports this module.
# Do not move this inside the __main__ block.

initialize_database()


# ==================================================
# PAGE ROUTES
# ==================================================

@app.route("/")
def dashboard():
    return render_template("dashboard.html")


@app.route("/<page>")
def page(page):
    allowed_pages = [
        "dashboard",
        "crew",
        "health",
        "assistant",
        "emergency",
        "wellness",
        "fitness",
        "medication",
        "environment",
        "inventory",
        "communications",
        "records",
        "analytics",
        "reports"
    ]

    if page not in allowed_pages:
        return "Page not found", 404

    return render_template(f"{page}.html")


# ==================================================
# SYSTEM STATUS
# ==================================================

@app.route("/api/status")
def api_status():
    try:
        connection = get_db_connection()
        connection.execute("SELECT 1")
        connection.close()

        return jsonify({
            "status": "online",
            "application": "ASTRA HEALTH 360",
            "ai": "OpenRouter Hosted AI",
            "database": "SQLite"
        })

    except Exception:
        app.logger.exception("System status check failed")
        return jsonify({"status": "error"}), 503


@app.route("/api/health-check")
def health_check():
    return jsonify({"status": "healthy"})


# ==================================================
# CREW MANAGEMENT
# ==================================================

@app.route("/api/crew", methods=["GET", "POST"])
def api_crew():
    connection = get_db_connection()

    if request.method == "POST":
        data = request.get_json(silent=True) or {}

        name = str(data.get("name", "")).strip()
        role = str(data.get("role", "")).strip()

        if not name or not role:
            connection.close()
            return jsonify({
                "error": "Name and role are required"
            }), 400

        if len(name) > 100 or len(role) > 100:
            connection.close()
            return jsonify({
                "error": "Name or role is too long"
            }), 400

        cursor = connection.execute("""
            INSERT INTO crew (name, role)
            VALUES (?, ?)
        """, (name, role))

        crew_id = cursor.lastrowid

        connection.commit()
        connection.close()

        return jsonify({
            "message": "Crew member added successfully",
            "id": crew_id
        }), 201

    crew = connection.execute(
        "SELECT * FROM crew ORDER BY id"
    ).fetchall()

    connection.close()

    return jsonify([dict(member) for member in crew])


@app.route("/api/crew/<int:crew_id>", methods=["PUT", "DELETE"])
def manage_crew_member(crew_id):
    connection = get_db_connection()

    member = connection.execute(
        "SELECT * FROM crew WHERE id = ?", (crew_id,)
    ).fetchone()

    if not member:
        connection.close()
        return jsonify({"error": "Crew member not found"}), 404

    if request.method == "DELETE":
        has_records = connection.execute("""
            SELECT
                (SELECT COUNT(*) FROM health_records WHERE crew_id = ?) +
                (SELECT COUNT(*) FROM wellness_checkins WHERE crew_id = ?) +
                (SELECT COUNT(*) FROM fitness_sessions WHERE crew_id = ?)
        """, (crew_id, crew_id, crew_id)).fetchone()[0]

        if has_records:
            connection.close()
            return jsonify({
                "error": "This crew member has historical records. Change mission status instead."
            }), 409

        connection.execute(
            "DELETE FROM crew WHERE id = ?", (crew_id,)
        )

        connection.commit()
        connection.close()

        return jsonify({"message": "Crew member deleted"})

    data = request.get_json(silent=True) or {}

    name = str(data.get("name", member["name"])).strip()
    role = str(data.get("role", member["role"] or "")).strip()

    status = str(
        data.get("mission_status", member["mission_status"])
    ).strip()

    valid_statuses = ["Active", "Inactive", "Standby", "Medical"]

    if not name or len(name) > 100 or len(role) > 100:
        connection.close()
        return jsonify({"error": "Invalid name or role"}), 400

    if status not in valid_statuses:
        connection.close()
        return jsonify({"error": "Invalid mission status"}), 400

    connection.execute("""
        UPDATE crew
        SET name = ?, role = ?, mission_status = ?
        WHERE id = ?
    """, (name, role, status, crew_id))

    connection.commit()
    connection.close()

    return jsonify({"message": "Crew member updated"})

# ==================================================
# CREW WELLNESS API
# ==================================================

@app.route("/api/wellness", methods=["GET", "POST"])
def api_wellness():
    connection = get_db_connection()

    try:
        if request.method == "POST":
            data = request.get_json(silent=True) or {}

            try:
                crew_id = int(data.get("crew_id"))
            except (TypeError, ValueError):
                return jsonify({"error": "Please select a valid crew member."}), 400

            mood = str(data.get("mood", "")).strip()
            notes = str(data.get("notes", "")).strip()

            if mood not in ["Positive", "Neutral", "Low"]:
                return jsonify({"error": "Please select a valid mood."}), 400

            if len(notes) > 1000:
                return jsonify({"error": "Notes are too long."}), 400

            if not crew_exists(connection, crew_id):
                return jsonify({"error": "Crew member not found."}), 404

            connection.execute("""
                INSERT INTO wellness_checkins (crew_id, mood, notes)
                VALUES (?, ?, ?)
            """, (crew_id, mood, notes))

            connection.commit()

            return jsonify({
                "success": True,
                "message": "Wellness check-in saved successfully."
            }), 201

        records = connection.execute("""
            SELECT
                w.id,
                w.crew_id,
                w.mood,
                w.notes,
                w.recorded_at AS created_at,
                c.name AS crew_name
            FROM wellness_checkins w
            LEFT JOIN crew c ON c.id = w.crew_id
            ORDER BY w.recorded_at DESC
        """).fetchall()

        return jsonify([dict(row) for row in records])

    except Exception:
        app.logger.exception("Wellness API error")
        return jsonify({"error": "Unable to process wellness request."}), 500

    finally:
        connection.close()



# ==================================================
# HEALTH MONITORING
# ==================================================

@app.route("/api/health", methods=["GET", "POST"])
def api_health():
    if request.method == "POST":
        data = request.get_json(silent=True) or {}

        required = [
            "crew_id",
            "heart_rate",
            "oxygen_level",
            "body_temperature"
        ]

        if any(key not in data for key in required):
            return jsonify({"error": "Missing health values"}), 400

        try:
            result = save_health_record(
                data["crew_id"],
                data["heart_rate"],
                data["oxygen_level"],
                data["body_temperature"],
                source="SENSOR"
            )

            return jsonify(result), 201

        except (ValueError, TypeError) as error:
            return jsonify({"error": str(error)}), 400

        except Exception:
            app.logger.exception("Health record could not be saved")
            return jsonify({
                "error": "Unable to save health record"
            }), 500

    crew_id = request.args.get("crew_id", type=int)

    try:
        records = get_all_health_records(crew_id=crew_id)
        return jsonify(records)

    except Exception:
        app.logger.exception("Health records could not be retrieved")
        return jsonify({
            "error": "Unable to retrieve health records"
        }), 500


@app.route("/api/health/latest/<int:crew_id>")
def latest_health(crew_id):
    record = get_latest_health_record(crew_id)

    if not record:
        return jsonify({"error": "No health record found"}), 404

    return jsonify(record)


# ==================================================
# SIMULATED HEALTH READINGS
# ==================================================

@app.route("/api/simulation/crew/<int:crew_id>", methods=["POST"])
def simulate_one_crew(crew_id):
    try:
        result = simulate_crew_health(crew_id)
        return jsonify(result)

    except (ValueError, TypeError) as error:
        return jsonify({"error": str(error)}), 400

    except Exception:
        app.logger.exception("Crew simulation failed")
        return jsonify({"error": "Simulation failed"}), 500


@app.route("/api/simulation/all", methods=["POST"])
def simulate_all():
    try:
        result = simulate_all_crew_health()
        return jsonify(result)

    except Exception:
        app.logger.exception("Health simulation failed")
        return jsonify({"error": "Simulation failed"}), 500


@app.route("/api/simulation/summary")
def simulation_summary():
    return jsonify(get_simulation_summary())


# ==================================================
# EMERGENCY ALERTS
# ==================================================

@app.route("/api/alerts", methods=["GET", "POST"])
def api_alerts():
    if request.method == "POST":
        data = request.get_json(silent=True) or {}

        try:
            result = create_alert(
                data.get("title", ""),
                data.get("severity", "Medium"),
                data.get("description", "")
            )

            return jsonify(result), 201

        except (ValueError, TypeError) as error:
            return jsonify({"error": str(error)}), 400

        except Exception:
            app.logger.exception("Alert creation failed")
            return jsonify({"error": "Unable to create alert"}), 500

    status = request.args.get("status")

    try:
        return jsonify(get_all_alerts(status=status))

    except Exception:
        app.logger.exception("Alert retrieval failed")
        return jsonify({"error": "Unable to retrieve alerts"}), 500


@app.route("/api/alerts/count")
def alert_count():
    return jsonify({"active": get_active_alert_count()})


@app.route("/api/alerts/<int:alert_id>", methods=["PUT", "DELETE"])
def manage_alert(alert_id):
    if request.method == "DELETE":
        if delete_alert(alert_id):
            return jsonify({"message": "Alert deleted"})

        return jsonify({"error": "Alert not found"}), 404

    data = request.get_json(silent=True) or {}

    try:
        result = update_alert_status(
            alert_id,
            data.get("status", "")
        )

        if not result:
            return jsonify({"error": "Alert not found"}), 404

        return jsonify(result)

    except ValueError as error:
        return jsonify({"error": str(error)}), 400


# ==================================================
# ASTRA AI - HOSTED OPENROUTER API
# ==================================================

@app.route("/api/assistant", methods=["POST"])
def api_assistant():
    data = request.get_json(silent=True) or {}
    question = str(data.get("question", "")).strip()

    if not question:
        return jsonify({"success": False, "error": "Please enter a message."}), 400
    if len(question) > 4000:
        return jsonify({"success": False, "error": "Message is too long."}), 400

    raw_history = data.get("conversation_history", [])
    safe_history = []
    if isinstance(raw_history, list):
        for item in raw_history[-10:]:
            if not isinstance(item, dict):
                continue
            role = item.get("role")
            content = item.get("content")
            if role not in ("user", "assistant") or not isinstance(content, str):
                continue
            content = content.strip()
            if content:
                safe_history.append({"role": role, "content": content[:4000]})

    try:
        mission_context = build_mission_context()
        answer = ask_astra(
            question,
            conversation_history=safe_history,
            mission_context=mission_context
        )
        return jsonify({
            "success": True,
            "answer": answer,
            "copilot": {
                "enabled": True,
                "database_connected": True,
                "data_source": "ASTRA HEALTH 360 SQLite database"
            }
        }), 200
    except Exception:
        app.logger.exception("ASTRA Mission Copilot error")
        return jsonify({
            "success": False,
            "error": (
                "ASTRA Mission Copilot is temporarily unavailable. "
                "Please check the application logs."
            )
        }), 503


# ==================================================
# FITNESS SESSIONS
# ==================================================

@app.route("/api/fitness", methods=["GET", "POST"])
def api_fitness():
    connection = get_db_connection()

    if request.method == "POST":
        data = request.get_json(silent=True) or {}

        try:
            duration = int(data.get("duration_minutes", 0))
            calories = int(data.get("calories_burned", 0))
            crew_id = int(data.get("crew_id", 1))

            if not 1 <= duration <= 1440:
                raise ValueError()

            if not 0 <= calories <= 5000:
                raise ValueError()

            if not crew_exists(connection, crew_id):
                connection.close()
                return jsonify({
                    "error": "Crew member not found"
                }), 404

        except (ValueError, TypeError):
            connection.close()
            return jsonify({
                "error": "Invalid workout details"
            }), 400

        connection.execute("""
            INSERT INTO fitness_sessions
            (crew_id, duration_minutes, calories_burned)
            VALUES (?, ?, ?)
        """, (crew_id, duration, calories))

        connection.commit()
        connection.close()

        return jsonify({"message": "Workout saved"}), 201

    records = connection.execute("""
        SELECT fitness_sessions.*, crew.name AS crew_name
        FROM fitness_sessions
        LEFT JOIN crew ON crew.id = fitness_sessions.crew_id
        ORDER BY fitness_sessions.recorded_at DESC
        LIMIT 100
    """).fetchall()

    connection.close()

    return jsonify([dict(row) for row in records])


# ==================================================
# INVENTORY MANAGEMENT
# ==================================================

@app.route("/api/inventory", methods=["GET", "POST"])
def api_inventory():
    connection = get_db_connection()

    if request.method == "POST":
        data = request.get_json(silent=True) or {}

        name = str(data.get("item_name", "")).strip()
        category = str(data.get("category", "General")).strip()
        unit = str(data.get("unit", "units")).strip()

        try:
            quantity = int(data.get("quantity", 0))
            minimum = int(data.get("minimum_quantity", 1))

            if (
                not name or len(name) > 100
                or quantity < 0 or minimum < 0
            ):
                raise ValueError()

        except (ValueError, TypeError):
            connection.close()
            return jsonify({
                "error": "Invalid inventory details"
            }), 400

        connection.execute("""
            INSERT INTO inventory
            (item_name, category, quantity, minimum_quantity, unit)
            VALUES (?, ?, ?, ?, ?)
        """, (name, category, quantity, minimum, unit))

        connection.commit()
        connection.close()

        return jsonify({
            "message": "Inventory item added"
        }), 201

    items = connection.execute(
        "SELECT * FROM inventory ORDER BY item_name"
    ).fetchall()

    connection.close()

    return jsonify([dict(item) for item in items])


@app.route("/api/inventory/<int:item_id>", methods=["PUT", "DELETE"])
def manage_inventory_item(item_id):
    connection = get_db_connection()

    item = connection.execute(
        "SELECT * FROM inventory WHERE id = ?", (item_id,)
    ).fetchone()

    if not item:
        connection.close()
        return jsonify({
            "error": "Inventory item not found"
        }), 404

    if request.method == "DELETE":
        connection.execute(
            "DELETE FROM inventory WHERE id = ?", (item_id,)
        )

        connection.commit()
        connection.close()

        return jsonify({
            "message": "Inventory item deleted"
        })

    data = request.get_json(silent=True) or {}

    try:
        quantity = int(data.get("quantity", item["quantity"]))

        minimum = int(
            data.get("minimum_quantity", item["minimum_quantity"])
        )

        if quantity < 0 or minimum < 0:
            raise ValueError()

    except (ValueError, TypeError):
        connection.close()
        return jsonify({
            "error": "Invalid stock quantity"
        }), 400

    connection.execute("""
        UPDATE inventory
        SET quantity = ?, minimum_quantity = ?, category = ?, unit = ?
        WHERE id = ?
    """, (
        quantity,
        minimum,
        data.get("category", item["category"]),
        data.get("unit", item["unit"]),
        item_id
    ))

    connection.commit()
    connection.close()

    return jsonify({"message": "Inventory updated"})


# ==================================================
# MEDICATION INVENTORY
# ==================================================

@app.route("/api/medication", methods=["GET", "POST"])
def api_medication():
    connection = get_db_connection()

    if request.method == "POST":
        data = request.get_json(silent=True) or {}

        name = str(data.get("item_name", "")).strip()

        try:
            quantity = int(data.get("quantity", 0))
            minimum = int(data.get("minimum_quantity", 1))

            if not name or quantity < 0 or minimum < 0:
                raise ValueError()

        except (ValueError, TypeError):
            connection.close()
            return jsonify({
                "error": "Invalid medication inventory details"
            }), 400

        notes = str(data.get("notes", "")).strip()

        connection.execute("""
            INSERT INTO medication_inventory
            (item_name, quantity, minimum_quantity, notes)
            VALUES (?, ?, ?, ?)
        """, (name, quantity, minimum, notes))

        connection.commit()
        connection.close()

        return jsonify({
            "message": "Medication inventory item saved"
        }), 201

    records = connection.execute("""
        SELECT * FROM medication_inventory
        ORDER BY item_name
    """).fetchall()

    connection.close()

    return jsonify([dict(row) for row in records])


# ==================================================
# ENVIRONMENT MONITORING
# ==================================================

@app.route("/api/environment", methods=["GET", "POST"])
def api_environment():
    connection = get_db_connection()

    if request.method == "POST":
        data = request.get_json(silent=True) or {}

        fields = [
            "cabin_temperature",
            "cabin_pressure",
            "cabin_oxygen",
            "cabin_humidity"
        ]

        try:
            values = [float(data[field]) for field in fields]

            temperature, pressure, oxygen, humidity = values

            if not 0 <= temperature <= 100:
                raise ValueError(
                    "Temperature outside accepted range"
                )

            if not 0 <= pressure <= 200:
                raise ValueError(
                    "Pressure outside accepted range"
                )

            if not 0 <= oxygen <= 100:
                raise ValueError(
                    "Oxygen outside accepted range"
                )

            if not 0 <= humidity <= 100:
                raise ValueError(
                    "Humidity outside accepted range"
                )

        except (KeyError, ValueError, TypeError) as error:
            connection.close()

            return jsonify({
                "error": str(error) or "Invalid environment readings"
            }), 400

        source = str(data.get("source", "SENSOR")).upper()

        if source not in ["SENSOR", "SIMULATED"]:
            connection.close()
            return jsonify({
                "error": "Invalid data source"
            }), 400

        connection.execute("""
            INSERT INTO environment_records (
                cabin_temperature,
                cabin_pressure,
                cabin_oxygen,
                cabin_humidity,
                source
            )
            VALUES (?, ?, ?, ?, ?)
        """, (
            temperature,
            pressure,
            oxygen,
            humidity,
            source
        ))

        connection.commit()
        connection.close()

        return jsonify({
            "message": "Environment reading saved",
            "source": source
        }), 201

    records = connection.execute("""
        SELECT * FROM environment_records
        ORDER BY recorded_at DESC
        LIMIT 100
    """).fetchall()

    connection.close()

    return jsonify({
        "readings": [dict(row) for row in records]
    })


# ==================================================
# COMMUNICATIONS
# ==================================================

@app.route("/api/messages", methods=["GET", "POST"])
def api_messages():
    connection = get_db_connection()

    if request.method == "POST":
        data = request.get_json(silent=True) or {}

        channel = str(data.get("channel", "")).strip()
        message = str(data.get("message", "")).strip()
        sender = str(data.get("sender", "Crew Member")).strip()

        if (
            not channel or not message
            or len(message) > 2000
            or len(sender) > 100
        ):
            connection.close()
            return jsonify({"error": "Invalid message"}), 400

        connection.execute("""
            INSERT INTO messages (sender, channel, message)
            VALUES (?, ?, ?)
        """, (sender, channel, message))

        connection.commit()
        connection.close()

        return jsonify({
            "message": "Local message saved"
        }), 201

    messages = connection.execute("""
        SELECT * FROM messages
        ORDER BY created_at DESC
        LIMIT 100
    """).fetchall()

    connection.close()

    return jsonify([dict(message) for message in messages])


# ==================================================
# ASTRA MISSION INTELLIGENCE - MACHINE LEARNING
# ==================================================

@app.route("/api/mission/analyse", methods=["POST"])
def api_mission_analyse():
    """Analyse one health reading with the experimental ML model."""

    data = request.get_json(silent=True) or {}

    reading = {
        "heart_rate": data.get("heart_rate"),
        "oxygen_level": data.get("oxygen_level"),
        "temperature": data.get(
            "temperature",
            data.get("body_temperature")
        ),
        "source": data.get("source", "UNKNOWN")
    }

    result = analyse_health_reading(reading)

    return jsonify(result), (
        200 if result.get("success") else 400
    )


@app.route("/api/mission/intelligence", methods=["GET"])
def api_mission_intelligence():
    """Analyse recent saved health records for anomaly patterns."""

    try:
        crew_id = request.args.get("crew_id", type=int)

        limit = request.args.get(
            "limit", default=100, type=int
        )

        limit = max(1, min(limit, 500))

        records = get_all_health_records(crew_id=crew_id)
        records = records[:limit]

        prepared = []

        for record in records:
            prepared.append({
                "heart_rate": record.get("heart_rate"),
                "oxygen_level": record.get("oxygen_level"),
                "temperature": record.get(
                    "body_temperature",
                    record.get("temperature")
                ),
                "source": record.get("source", "UNKNOWN"),
                "crew_id": record.get("crew_id"),
                "recorded_at": record.get("recorded_at")
            })

        result = analyse_multiple_readings(prepared)

        return jsonify(result)

    except Exception:
        app.logger.exception(
            "Mission intelligence analysis failed"
        )

        return jsonify({
            "success": False,
            "error": "Unable to analyse saved health records."
        }), 500


# ==================================================
# SIMULATED IOT SENSOR NETWORK
# ==================================================

@app.route("/api/iot/status", methods=["GET"])
def api_iot_status():
    """Return simulated IoT sensor status."""

    return jsonify(get_sensor_status())


@app.route("/api/iot/readings", methods=["GET", "POST"])
def api_iot_readings():
    """
    GET: generate simulated readings for all crew.

    POST: generate and save a simulated reading for one crew member,
    or all crew members when all=true.
    """

    try:
        if request.method == "GET":
            connection = get_db_connection()

            crew_rows = connection.execute(
                "SELECT id, name FROM crew ORDER BY id"
            ).fetchall()

            connection.close()

            crew_members = [
                dict(row) for row in crew_rows
            ]

            return jsonify(
                generate_sensor_network(crew_members)
            )

        data = request.get_json(silent=True) or {}

        save_all = data.get("all") is True

        connection = get_db_connection()

        if save_all:
            crew_rows = connection.execute(
                "SELECT id, name FROM crew ORDER BY id"
            ).fetchall()

            crew_members = [
                dict(row) for row in crew_rows
            ]

        else:
            crew_id = data.get("crew_id")

            try:
                crew_id = int(crew_id)

            except (TypeError, ValueError):
                connection.close()

                return jsonify({
                    "success": False,
                    "error": "A valid crew_id is required."
                }), 400

            crew_row = connection.execute(
                "SELECT id, name FROM crew WHERE id = ?",
                (crew_id,)
            ).fetchone()

            if not crew_row:
                connection.close()

                return jsonify({
                    "success": False,
                    "error": "Crew member not found."
                }), 404

            crew_members = [dict(crew_row)]

        connection.close()

        network = generate_sensor_network(crew_members)

        saved = []

        for reading in network["readings"]:
            result = save_health_record(
                reading["crew_id"],
                reading["heart_rate"],
                reading["oxygen_level"],
                reading["temperature"],
                source="SIMULATED"
            )

            saved.append({
                "crew_id": reading["crew_id"],
                "crew_name": reading.get("crew_name"),
                "reading": reading,
                "saved_record": result
            })

        return jsonify({
            "success": True,
            "data_source": "SIMULATED",
            "message": "Simulated sensor readings generated and saved.",
            "saved_count": len(saved),
            "readings": saved
        }), 201

    except (ValueError, TypeError) as error:
        return jsonify({
            "success": False,
            "error": str(error)
        }), 400

    except Exception:
        app.logger.exception(
            "Simulated IoT reading generation failed"
        )

        return jsonify({
            "success": False,
            "error": "Unable to generate simulated sensor readings."
        }), 500


# ==================================================
# SPACECRAFT TRACKING - PUBLIC ISS POSITION
# ==================================================

@app.route("/api/tracking/iss", methods=["GET"])
def api_tracking_iss():
    """Return the current ISS position from the public tracking API."""

    result = get_iss_position()

    return jsonify(result), (
        200 if result.get("success") else 503
    )


@app.route("/api/tracking/status", methods=["GET"])
def api_tracking_status():
    return jsonify(get_tracking_status())


# ==================================================
# SATELLITE COMMUNICATION SIMULATOR
# ==================================================

@app.route("/api/satellite/status", methods=["GET"])
def api_satellite_status():
    return jsonify(get_communication_status())


@app.route("/api/satellite/messages", methods=["GET", "POST"])
def api_satellite_messages():
    """Read message history or simulate a spacecraft communication."""

    if request.method == "GET":
        limit = request.args.get(
            "limit", default=50, type=int
        )

        return jsonify(get_message_history(limit))

    data = request.get_json(silent=True) or {}

    message = data.get("message", "")

    direction = data.get(
        "direction",
        "SPACECRAFT_TO_CONTROL"
    )

    result = transmit_message(
        message=message,
        direction=direction,
        simulate_failure=(
            data.get("simulate_failure") is True
        )
    )

    if not result.get("success"):
        status_code = 400 if "error" in result else 503
        return jsonify(result), status_code

    return jsonify(result), 201


# ==================================================
# CSV DATASET API ROUTES
# ==================================================

@app.route("/api/datasets", methods=["GET"])
def api_datasets():
    """Return summary of all four CSV datasets."""

    try:
        summary = get_dataset_summary()

        return jsonify({
            "success": True,
            "application": "ASTRA HEALTH 360",
            "datasets": summary
        }), 200

    except FileNotFoundError:
        app.logger.exception("CSV dataset file not found")

        return jsonify({
            "success": False,
            "error": "One or more CSV files are missing."
        }), 404

    except Exception:
        app.logger.exception("Dataset summary failed")

        return jsonify({
            "success": False,
            "error": "Unable to load dataset summary."
        }), 500


@app.route("/api/datasets/<dataset_name>", methods=["GET"])
def api_dataset_records(dataset_name):
    """Return records from a selected CSV dataset."""

    try:
        limit = request.args.get(
            "limit", default=50, type=int
        )

        limit = max(1, min(limit, 100))

        records = get_dataset_records(
            dataset_name, limit
        )

        return jsonify({
            "success": True,
            "dataset": dataset_name,
            "count": len(records),
            "records": records
        }), 200

    except ValueError:
        return jsonify({
            "success": False,
            "error": "Invalid dataset name."
        }), 404

    except FileNotFoundError:
        app.logger.exception("CSV file not found")

        return jsonify({
            "success": False,
            "error": "Dataset file not found."
        }), 404

    except Exception:
        app.logger.exception(
            "Dataset records could not be loaded"
        )

        return jsonify({
            "success": False,
            "error": "Unable to load dataset records."
        }), 500


# ==================================================
# MEDICAL RECORDS API
# ==================================================

@app.route("/api/records", methods=["GET"])
def get_medical_records():
    """Return saved astronaut health records."""

    try:
        records = get_all_health_records()

        return jsonify({
            "success": True,
            "records": records
        }), 200

    except Exception:
        app.logger.exception(
            "Medical records API failed"
        )

        return jsonify({
            "success": False,
            "error": "Unable to retrieve medical records."
        }), 500


# ==================================================
# START APPLICATION
# ==================================================

if __name__ == "__main__":
    print("--------------------------------------")
    print(" ASTRA HEALTH 360")
    print(" Astronaut Health Monitoring System")
    print("--------------------------------------")
    print("Database initialized.")
    print("Starting Flask server...")

    app.run(debug=True)
