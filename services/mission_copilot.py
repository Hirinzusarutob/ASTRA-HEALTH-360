import sqlite3
from config import Config


def build_mission_context():
    """Build a bounded snapshot of ASTRA's saved prototype data for the AI."""
    connection = sqlite3.connect(Config.DATABASE_PATH)
    connection.row_factory = sqlite3.Row

    try:
        crew_rows = connection.execute("""
            SELECT c.id, c.name, c.role, c.mission_status,
                   h.heart_rate, h.oxygen_level, h.body_temperature,
                   h.recorded_at, h.source
            FROM crew c
            LEFT JOIN health_records h ON h.id = (
                SELECT h2.id FROM health_records h2
                WHERE h2.crew_id = c.id
                ORDER BY h2.recorded_at DESC, h2.id DESC LIMIT 1
            )
            ORDER BY c.id
        """).fetchall()

        health_rows = connection.execute("""
            SELECT h.id, h.crew_id, c.name AS crew_name, h.heart_rate,
                   h.oxygen_level, h.body_temperature, h.recorded_at, h.source
            FROM health_records h
            LEFT JOIN crew c ON c.id = h.crew_id
            ORDER BY h.recorded_at DESC, h.id DESC LIMIT 20
        """).fetchall()

        alert_rows = connection.execute("""
            SELECT title, description, severity, status, created_at
            FROM alerts
            WHERE status IN ('Active', 'Acknowledged')
            ORDER BY created_at DESC LIMIT 15
        """).fetchall()

        environment_rows = connection.execute("""
            SELECT cabin_temperature, cabin_pressure, cabin_oxygen,
                   cabin_humidity, source, recorded_at
            FROM environment_records
            ORDER BY recorded_at DESC, id DESC LIMIT 5
        """).fetchall()

        inventory_rows = connection.execute("""
            SELECT item_name, category, quantity, minimum_quantity, unit
            FROM inventory ORDER BY item_name LIMIT 30
        """).fetchall()

        medication_rows = connection.execute("""
            SELECT item_name, quantity, minimum_quantity, notes, updated_at
            FROM medication_inventory ORDER BY item_name LIMIT 30
        """).fetchall()

        wellness_rows = connection.execute("""
            SELECT w.crew_id, c.name AS crew_name, w.mood, w.recorded_at
            FROM wellness_checkins w
            LEFT JOIN crew c ON c.id = w.crew_id
            ORDER BY w.recorded_at DESC, w.id DESC LIMIT 10
        """).fetchall()

        fitness_rows = connection.execute("""
            SELECT f.crew_id, c.name AS crew_name, f.duration_minutes,
                   f.calories_burned, f.recorded_at
            FROM fitness_sessions f
            LEFT JOIN crew c ON c.id = f.crew_id
            ORDER BY f.recorded_at DESC, f.id DESC LIMIT 10
        """).fetchall()

        crew = [dict(row) for row in crew_rows]
        health = [dict(row) for row in health_rows]
        alerts = [dict(row) for row in alert_rows]
        inventory = [dict(row) for row in inventory_rows]
        medication = [dict(row) for row in medication_rows]

        return {
            "application": "ASTRA HEALTH 360",
            "data_type": "Saved prototype database snapshot",
            "summary": {
                "crew_count": len(crew),
                "health_records_in_snapshot": len(health),
                "unresolved_alert_count": len(alerts),
                "low_general_inventory_items": sum(
                    1 for item in inventory
                    if item["quantity"] <= item["minimum_quantity"]
                ),
                "low_medication_inventory_items": sum(
                    1 for item in medication
                    if item["quantity"] <= item["minimum_quantity"]
                )
            },
            "crew_latest_readings": crew,
            "recent_health_records": health,
            "unresolved_alerts": alerts,
            "recent_environment_readings": [dict(row) for row in environment_rows],
            "general_inventory": inventory,
            "medication_inventory": medication,
            "recent_wellness_checkins": [dict(row) for row in wellness_rows],
            "recent_fitness_sessions": [dict(row) for row in fitness_rows],
            "important_disclaimer": (
                "Prototype data only. Some health readings may be simulated "
                "and are not verified live astronaut telemetry. AI output is "
                "informational, not a medical diagnosis. Do not claim actions "
                "were performed."
            )
        }
    finally:
        connection.close()
