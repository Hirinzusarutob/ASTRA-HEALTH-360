
import sqlite3
from config import Config


# Engineering warning thresholds for this project.
# These are illustrative monitoring limits, NOT medical diagnostic criteria.
HEALTH_THRESHOLDS = {
    "heart_rate_low": 50,
    "heart_rate_high": 120,
    "oxygen_low": 90,
    "temperature_low": 35,
    "temperature_high": 38
}


def get_health_connection():
    connection = sqlite3.connect(Config.DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def validate_health_data(heart_rate, oxygen_level, body_temperature):
    try:
        heart_rate = float(heart_rate)
        oxygen_level = float(oxygen_level)
        body_temperature = float(body_temperature)
    except (ValueError, TypeError):
        raise ValueError("Health readings must be numeric.")

    if not 20 <= heart_rate <= 250:
        raise ValueError("Heart rate must be between 20 and 250 BPM.")

    if not 0 <= oxygen_level <= 100:
        raise ValueError("Oxygen level must be between 0 and 100%.")

    if not 25 <= body_temperature <= 45:
        raise ValueError("Temperature must be between 25 and 45°C.")

    return heart_rate, oxygen_level, body_temperature


def check_health_status(heart_rate, oxygen_level, body_temperature):
    heart_rate, oxygen_level, body_temperature = validate_health_data(
        heart_rate, oxygen_level, body_temperature
    )

    warnings = []

    if heart_rate < HEALTH_THRESHOLDS["heart_rate_low"]:
        warnings.append("Heart rate below configured monitoring limit.")

    if heart_rate > HEALTH_THRESHOLDS["heart_rate_high"]:
        warnings.append("Heart rate above configured monitoring limit.")

    if oxygen_level < HEALTH_THRESHOLDS["oxygen_low"]:
        warnings.append("Oxygen saturation below configured monitoring limit.")

    if body_temperature < HEALTH_THRESHOLDS["temperature_low"]:
        warnings.append("Body temperature below configured monitoring limit.")

    if body_temperature > HEALTH_THRESHOLDS["temperature_high"]:
        warnings.append("Body temperature above configured monitoring limit.")

    return {
        "status": "Warning" if warnings else "Normal",
        "warnings": warnings
    }


def save_health_record(
    crew_id,
    heart_rate,
    oxygen_level,
    body_temperature,
    source="SENSOR"
):
    try:
        crew_id = int(crew_id)
    except (ValueError, TypeError):
        raise ValueError("A valid crew ID is required.")

    if crew_id < 1:
        raise ValueError("Invalid crew ID.")

    heart_rate, oxygen_level, body_temperature = validate_health_data(
        heart_rate, oxygen_level, body_temperature
    )

    source = str(source).strip().upper()

    if source not in ("SENSOR", "SIMULATED"):
        raise ValueError("Source must be SENSOR or SIMULATED.")

    connection = get_health_connection()

    try:
        crew = connection.execute(
            "SELECT id FROM crew WHERE id = ?",
            (crew_id,)
        ).fetchone()

        if not crew:
            raise ValueError("Crew member not found.")

        # Safe migration: add source column without deleting old records.
        columns = [
            row["name"]
            for row in connection.execute(
                "PRAGMA table_info(health_records)"
            ).fetchall()
        ]

        if "source" not in columns:
            connection.execute(
                "ALTER TABLE health_records ADD COLUMN source TEXT DEFAULT 'UNKNOWN'"
            )

        connection.execute("""
            INSERT INTO health_records (
                crew_id,
                heart_rate,
                oxygen_level,
                body_temperature,
                source
            )
            VALUES (?, ?, ?, ?, ?)
        """, (
            crew_id,
            heart_rate,
            oxygen_level,
            body_temperature,
            source
        ))

        connection.commit()

        record_id = connection.execute(
            "SELECT last_insert_rowid()"
        ).fetchone()[0]

        result = check_health_status(
            heart_rate,
            oxygen_level,
            body_temperature
        )

        return {
            "id": record_id,
            "crew_id": crew_id,
            "heart_rate": heart_rate,
            "oxygen_level": oxygen_level,
            "body_temperature": body_temperature,
            "source": source,
            **result
        }

    finally:
        connection.close()


def get_all_health_records(crew_id=None, limit=100):
    try:
        limit = max(1, min(int(limit), 500))
    except (ValueError, TypeError):
        limit = 100

    connection = get_health_connection()

    try:
        columns = [
            row["name"]
            for row in connection.execute(
                "PRAGMA table_info(health_records)"
            ).fetchall()
        ]

        source_column = (
            "h.source" if "source" in columns
            else "'UNKNOWN' AS source"
        )

        query = f"""
            SELECT
                h.id,
                h.crew_id,
                c.name AS crew_name,
                h.heart_rate,
                h.oxygen_level,
                h.body_temperature,
                h.recorded_at,
                {source_column}
            FROM health_records h
            LEFT JOIN crew c ON c.id = h.crew_id
        """

        parameters = []

        if crew_id is not None:
            query += " WHERE h.crew_id = ?"
            parameters.append(int(crew_id))

        query += " ORDER BY h.recorded_at DESC LIMIT ?"
        parameters.append(limit)

        rows = connection.execute(query, parameters).fetchall()

        results = []

        for row in rows:
            item = dict(row)
            item.update(check_health_status(
                item["heart_rate"],
                item["oxygen_level"],
                item["body_temperature"]
            ))
            results.append(item)

        return results

    finally:
        connection.close()


def get_latest_health_record(crew_id):
    try:
        crew_id = int(crew_id)
    except (ValueError, TypeError):
        raise ValueError("Invalid crew ID.")

    connection = get_health_connection()

    try:
        columns = [
            row["name"]
            for row in connection.execute(
                "PRAGMA table_info(health_records)"
            ).fetchall()
        ]

        source_column = (
            "source" if "source" in columns
            else "'UNKNOWN' AS source"
        )

        row = connection.execute(f"""
            SELECT
                id,
                crew_id,
                heart_rate,
                oxygen_level,
                body_temperature,
                recorded_at,
                {source_column}
            FROM health_records
            WHERE crew_id = ?
            ORDER BY recorded_at DESC, id DESC
            LIMIT 1
        """, (crew_id,)).fetchone()

        if not row:
            return None

        result = dict(row)
        result.update(check_health_status(
            result["heart_rate"],
            result["oxygen_level"],
            result["body_temperature"]
        ))

        return result

    finally:
        connection.close()
