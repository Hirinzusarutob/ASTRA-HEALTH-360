
"""
ASTRA HEALTH 360
Simulated IoT Sensor Service

Generates clearly labelled simulated astronaut sensor readings.
No physical sensor is connected by this module.
"""

from datetime import datetime, timezone
import random
import uuid


SENSOR_DEVICES = {
    "heart_rate": "ASTRA-HR-001",
    "oxygen_level": "ASTRA-SPO2-001",
    "temperature": "ASTRA-TEMP-001"
}


def generate_sensor_reading(crew_id=None):
    """Generate one simulated astronaut health reading."""

    reading = {
        "crew_id": crew_id,
        "heart_rate": round(random.gauss(75, 9), 1),
        "oxygen_level": round(random.gauss(97, 1.2), 1),
        "temperature": round(random.gauss(36.8, 0.35), 2),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "SIMULATED",
        "device_id": str(uuid.uuid4())[:8].upper()
    }

    reading["sensors"] = {
        name: {
            "device_id": device_id,
            "status": "SIMULATED_ONLINE"
        }
        for name, device_id in SENSOR_DEVICES.items()
    }

    return reading


def generate_sensor_network(crew_members):
    """Generate a simulated reading for each crew member."""

    readings = []

    for crew in crew_members:
        reading = generate_sensor_reading(
            crew_id=crew.get("id")
        )

        reading["crew_name"] = crew.get(
            "name",
            "Unknown Crew Member"
        )

        readings.append(reading)

    return {
        "success": True,
        "network_status": "SIMULATION_ACTIVE",
        "data_source": "SIMULATED",
        "connected_devices": len(SENSOR_DEVICES) * len(readings),
        "crew_count": len(readings),
        "readings": readings,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }


def get_sensor_status():
    """Return the current simulated sensor network status."""

    return {
        "success": True,
        "network": "ASTRA IOT SENSOR NETWORK",
        "mode": "SIMULATION",
        "physical_hardware_connected": False,
        "sensors": [
            {
                "name": "Heart Rate Sensor",
                "device_id": SENSOR_DEVICES["heart_rate"],
                "status": "SIMULATED_ONLINE"
            },
            {
                "name": "Blood Oxygen Sensor",
                "device_id": SENSOR_DEVICES["oxygen_level"],
                "status": "SIMULATED_ONLINE"
            },
            {
                "name": "Temperature Sensor",
                "device_id": SENSOR_DEVICES["temperature"],
                "status": "SIMULATED_ONLINE"
            }
        ]
    }
