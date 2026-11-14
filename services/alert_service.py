
import sqlite3
from config import Config


VALID_SEVERITIES = {"Low", "Medium", "High", "Critical"}
VALID_STATUSES = {"Active", "Acknowledged", "Resolved"}


def get_alert_connection():
    connection = sqlite3.connect(Config.DATABASE_PATH)
    connection.row_factory = sqlite3.Row

    # Upgrade older databases without deleting existing alerts.
    columns = [
        row["name"]
        for row in connection.execute(
            "PRAGMA table_info(alerts)"
        ).fetchall()
    ]

    if "description" not in columns:
        connection.execute(
            "ALTER TABLE alerts ADD COLUMN description TEXT DEFAULT ''"
        )
        connection.commit()

    return connection


def create_alert(title, severity, description=""):
    title = str(title or "").strip()
    description = str(description or "").strip()
    severity = str(severity or "").strip().capitalize()

    if not title:
        raise ValueError("Alert title is required.")

    if len(title) > 200:
        raise ValueError("Alert title cannot exceed 200 characters.")

    if len(description) > 2000:
        raise ValueError("Alert description cannot exceed 2000 characters.")

    if severity not in VALID_SEVERITIES:
        raise ValueError(
            "Severity must be Low, Medium, High or Critical."
        )

    connection = get_alert_connection()

    try:
        cursor = connection.execute("""
            INSERT INTO alerts (title, severity, status, description)
            VALUES (?, ?, 'Active', ?)
        """, (title, severity, description))

        connection.commit()
        alert_id = cursor.lastrowid

        row = connection.execute(
            "SELECT * FROM alerts WHERE id = ?",
            (alert_id,)
        ).fetchone()

        return dict(row)

    finally:
        connection.close()


def get_all_alerts(status=None, limit=100):
    try:
        limit = max(1, min(int(limit), 500))
    except (ValueError, TypeError):
        limit = 100

    if status is not None:
        status = str(status).strip().capitalize()

        if status not in VALID_STATUSES:
            raise ValueError("Invalid alert status.")

    connection = get_alert_connection()

    try:
        if status:
            rows = connection.execute("""
                SELECT * FROM alerts
                WHERE status = ?
                ORDER BY created_at DESC, id DESC
                LIMIT ?
            """, (status, limit)).fetchall()
        else:
            rows = connection.execute("""
                SELECT * FROM alerts
                ORDER BY created_at DESC, id DESC
                LIMIT ?
            """, (limit,)).fetchall()

        return [dict(row) for row in rows]

    finally:
        connection.close()


def get_alert_by_id(alert_id):
    connection = get_alert_connection()

    try:
        row = connection.execute(
            "SELECT * FROM alerts WHERE id = ?",
            (int(alert_id),)
        ).fetchone()

        return dict(row) if row else None

    finally:
        connection.close()


def update_alert_status(alert_id, status):
    try:
        alert_id = int(alert_id)
    except (ValueError, TypeError):
        raise ValueError("Invalid alert ID.")

    status = str(status or "").strip().capitalize()

    if status not in VALID_STATUSES:
        raise ValueError(
            "Status must be Active, Acknowledged or Resolved."
        )

    connection = get_alert_connection()

    try:
        cursor = connection.execute("""
            UPDATE alerts
            SET status = ?
            WHERE id = ?
        """, (status, alert_id))

        connection.commit()

        if cursor.rowcount == 0:
            return None

        row = connection.execute(
            "SELECT * FROM alerts WHERE id = ?",
            (alert_id,)
        ).fetchone()

        return dict(row) if row else None

    finally:
        connection.close()


def delete_alert(alert_id):
    try:
        alert_id = int(alert_id)
    except (ValueError, TypeError):
        return False

    connection = get_alert_connection()

    try:
        cursor = connection.execute(
            "DELETE FROM alerts WHERE id = ?",
            (alert_id,)
        )

        connection.commit()
        return cursor.rowcount > 0

    finally:
        connection.close()


def get_active_alert_count():
    connection = get_alert_connection()

    try:
        count = connection.execute("""
            SELECT COUNT(*)
            FROM alerts
            WHERE status IN ('Active', 'Acknowledged')
        """).fetchone()[0]

        return count

    finally:
        connection.close()


def get_critical_alert_count():
    connection = get_alert_connection()

    try:
        count = connection.execute("""
            SELECT COUNT(*)
            FROM alerts
            WHERE severity = 'Critical'
            AND status IN ('Active', 'Acknowledged')
        """).fetchone()[0]

        return count

    finally:
        connection.close()
