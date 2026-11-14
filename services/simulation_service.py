
import random
import sqlite3

from config import Config
from services.health_service import save_health_record


def get_simulation_connection():
    connection = sqlite3.connect(Config.DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def generate_health_reading():
    """
    Generate illustrative astronaut health readings.
    These are simulated values, not real sensor measurements.
    """

    return {
        "heart_rate": round(random.uniform(60, 105), 1),
        "oxygen_level": round(random.uniform(94, 100), 1),
        "body_temperature": round(random.uniform(36.1, 37.5), 1)
    }


def simulate_crew_health(crew_id):
    try:
        crew_id = int(crew_id)
    except (ValueError, TypeError):
        raise ValueError("A valid crew ID is required.")

    if crew_id < 1:
        raise ValueError("Invalid crew ID.")

    connection = get_simulation_connection()

    try:
        crew = connection.execute("""
            SELECT id, name, role, mission_status
            FROM crew
            WHERE id = ?
        """, (crew_id,)).fetchone()
    finally:
        connection.close()

    if not crew:
        raise ValueError("Crew member not found.")

    if crew["mission_status"] != "Active":
        raise ValueError("Cannot simulate readings for inactive crew.")

    reading = generate_health_reading()

    result = save_health_record(
        crew_id=crew_id,
        heart_rate=reading["heart_rate"],
        oxygen_level=reading["oxygen_level"],
        body_temperature=reading["body_temperature"],
        source="SIMULATED"
    )

    return {
        "crew_id": crew_id,
        "crew_name": crew["name"],
        "role": crew["role"],
        "source": "SIMULATED",
        "reading": reading,
        "health_status": result["status"],
        "warnings": result["warnings"],
        "record_id": result["id"],
        "message": "Simulated health reading saved successfully."
    }


def simulate_all_crew_health():
    connection = get_simulation_connection()

    try:
        crew_members = connection.execute("""
            SELECT id, name
            FROM crew
            WHERE mission_status = 'Active'
            ORDER BY id
        """).fetchall()
    finally:
        connection.close()

    results = []

    for member in crew_members:
        try:
            result = simulate_crew_health(member["id"])
            results.append(result)
        except (ValueError, TypeError) as error:
            results.append({
                "crew_id": member["id"],
                "crew_name": member["name"],
                "error": str(error)
            })

    return {
        "source": "SIMULATED",
        "total_crew": len(crew_members),
        "successful_readings": sum(
            1 for item in results if "reading" in item
        ),
        "results": results
    }


def get_simulation_summary():
    connection = get_simulation_connection()

    try:
        columns = [
            row["name"]
            for row in connection.execute(
                "PRAGMA table_info(health_records)"
            ).fetchall()
        ]

        if "source" not in columns:
            connection.execute("""
                ALTER TABLE health_records
                ADD COLUMN source TEXT DEFAULT 'UNKNOWN'
            """)
            connection.commit()

        rows = connection.execute("""
            SELECT
                c.id AS crew_id,
                c.name AS crew_name,
                c.role,
                c.mission_status,
                h.heart_rate,
                h.oxygen_level,
                h.body_temperature,
                h.recorded_at,
                h.source
            FROM crew c
            LEFT JOIN health_records h
                ON h.id = (
                    SELECT h2.id
                    FROM health_records h2
                    WHERE h2.crew_id = c.id
                    ORDER BY h2.recorded_at DESC, h2.id DESC
                    LIMIT 1
                )
            ORDER BY c.id
        """).fetchall()

        results = []

        for row in rows:
            item = dict(row)

            if item["heart_rate"] is None:
                item["health_status"] = "No Data"
                item["warnings"] = []
            else:
                from services.health_service import check_health_status

                status = check_health_status(
                    item["heart_rate"],
                    item["oxygen_level"],
                    item["body_temperature"]
                )

                item["health_status"] = status["status"]
                item["warnings"] = status["warnings"]

            results.append(item)

        return {
            "total_crew": len(results),
            "readings_available": sum(
                1 for item in results
                if item["heart_rate"] is not None
            ),
            "simulated_readings": sum(
                1 for item in results
                if item["source"] == "SIMULATED"
            ),
            "sensor_readings": sum(
                1 for item in results
                if item["source"] == "SENSOR"
            ),
            "crew": results
        }

    finally:
        connection.close()
