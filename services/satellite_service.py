
"""
ASTRA HEALTH 360
Satellite Communication Simulator

Simulates spacecraft-to-ground communication.
This is NOT connected to a real satellite or radio network.
"""

from datetime import datetime, timezone
from threading import Lock
import random
import time
import uuid


_message_lock = Lock()
_message_history = []


def transmit_message(
    message,
    direction="SPACECRAFT_TO_CONTROL",
    simulate_failure=False
):
    """
    Simulate one satellite communication transmission.

    Directions:
    SPACECRAFT_TO_CONTROL
    CONTROL_TO_SPACECRAFT
    """

    if not isinstance(message, str) or not message.strip():
        return {
            "success": False,
            "error": "Message cannot be empty."
        }

    if len(message) > 2000:
        return {
            "success": False,
            "error": "Message exceeds the 2000-character limit."
        }

    allowed_directions = {
        "SPACECRAFT_TO_CONTROL",
        "CONTROL_TO_SPACECRAFT"
    }

    if direction not in allowed_directions:
        return {
            "success": False,
            "error": "Invalid communication direction."
        }

    message_id = str(uuid.uuid4())

    latency_ms = random.randint(250, 1800)
    signal_strength = random.randint(65, 100)

    # Simulated transmission delay.
    time.sleep(min(latency_ms / 1000, 0.5))

    delivered = (
        not simulate_failure
        and random.random() > 0.05
    )

    if delivered:
        status = "DELIVERED"
        acknowledgement = "ACK_RECEIVED"
    else:
        status = "FAILED"
        acknowledgement = "ACK_NOT_RECEIVED"

    result = {
        "success": delivered,
        "message_id": message_id,
        "message": message.strip(),
        "direction": direction,
        "status": status,
        "acknowledgement": acknowledgement,
        "latency_ms": latency_ms,
        "signal_strength": signal_strength,
        "signal_quality": (
            "GOOD" if signal_strength >= 80
            else "MODERATE"
        ),
        "transmission_mode": "SIMULATED",
        "created_at": datetime.now(
            timezone.utc
        ).isoformat()
    }

    with _message_lock:
        _message_history.append(result.copy())

        # Keep the most recent 200 messages.
        if len(_message_history) > 200:
            del _message_history[:-200]

    return result


def get_message_history(limit=50):
    """Return recent simulated communication messages."""

    try:
        limit = max(1, min(int(limit), 200))
    except (TypeError, ValueError):
        limit = 50

    with _message_lock:
        messages = [
            message.copy()
            for message in _message_history[-limit:]
        ]

    messages.reverse()

    return {
        "success": True,
        "mode": "SIMULATED",
        "total_messages": len(messages),
        "messages": messages
    }


def get_communication_status():
    """Return simulated satellite communication status."""

    return {
        "success": True,
        "system": "ASTRA SATELLITE COMMUNICATION",
        "mode": "SIMULATION",
        "satellite_link": "SIMULATED",
        "ground_station": "MISSION CONTROL",
        "physical_satellite_connected": False,
        "radio_transmitter_connected": False,
        "message_acknowledgement": "SIMULATED",
        "status": "SIMULATION_READY"
    }


def clear_message_history():
    """Clear the in-memory simulated message history."""

    with _message_lock:
        _message_history.clear()

    return {
        "success": True,
        "message": "Simulated communication history cleared."
    }

