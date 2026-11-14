
"""
ASTRA HEALTH 360
Spacecraft Tracking Service

Retrieves the current International Space Station position
from a public tracking API.

If the API is unavailable, returns an unavailable status.
It never invents a live position.
"""

from datetime import datetime, timezone
import requests


ISS_API_URL = (
    "https://api.wheretheiss.at/v1/satellites/25544"
)

REQUEST_TIMEOUT = 12


def get_iss_position():
    """Fetch the current ISS position."""

    try:
        response = requests.get(
            ISS_API_URL,
            params={"units": "kilometers"},
            timeout=REQUEST_TIMEOUT
        )

        response.raise_for_status()
        data = response.json()

        latitude = float(data["latitude"])
        longitude = float(data["longitude"])
        altitude = float(data["altitude"])
        velocity = float(data["velocity"])

        if not (
            -90 <= latitude <= 90
            and -180 <= longitude <= 180
            and altitude > 0
            and velocity > 0
        ):
            raise ValueError("Invalid ISS position received.")

        return {
            "success": True,
            "tracking_status": "LIVE",
            "data_source": "PUBLIC_ISS_API",
            "spacecraft": "International Space Station",
            "norad_id": 25544,
            "latitude": round(latitude, 5),
            "longitude": round(longitude, 5),
            "altitude_km": round(altitude, 2),
            "velocity_kmh": round(velocity, 2),
            "visibility": data.get("visibility", "Unknown"),
            "position_timestamp": data.get("timestamp"),
            "map_url": (
                "https://www.google.com/maps?q="
                f"{latitude},{longitude}"
            ),
            "retrieved_at": datetime.now(
                timezone.utc
            ).isoformat()
        }

    except requests.RequestException as error:
        return {
            "success": False,
            "tracking_status": "UNAVAILABLE",
            "data_source": "NONE",
            "spacecraft": "International Space Station",
            "error": "Unable to contact the public tracking service.",
            "details": str(error)
        }

    except (KeyError, TypeError, ValueError) as error:
        return {
            "success": False,
            "tracking_status": "INVALID_RESPONSE",
            "data_source": "NONE",
            "error": "The tracking service returned invalid data.",
            "details": str(error)
        }


def get_tracking_status():
    """Return tracking service information."""

    return {
        "success": True,
        "service": "ASTRA SPACE TRACKING",
        "tracking_target": "ISS",
        "tracking_mode": "PUBLIC_API",
        "api_url": ISS_API_URL,
        "authentication_required": False,
        "physical_spacecraft_tracking": (
            "ISS position only; not a private mission spacecraft"
        )
    }
