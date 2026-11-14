
"""
ASTRA HEALTH 360
Machine Learning Mission Intelligence Service

Purpose:
- Detect unusual astronaut health readings.
- Use Isolation Forest anomaly detection.
- Return explainable monitoring flags.

IMPORTANT:
This is an experimental demonstration.
Synthetic training data is not a clinical reference.
This service does not diagnose diseases.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from sklearn.ensemble import IsolationForest


FEATURES = ("heart_rate", "oxygen_level", "temperature")

MODEL = None


def generate_demo_baseline(
    sample_count: int = 500,
    seed: int = 42
) -> np.ndarray:

    rng = np.random.default_rng(seed)

    heart_rate = rng.normal(75, 9, sample_count)
    oxygen_level = rng.normal(97, 1.2, sample_count)
    temperature = rng.normal(36.8, 0.35, sample_count)

    return np.column_stack((
        heart_rate,
        oxygen_level,
        temperature
    ))


def get_model():

    global MODEL

    if MODEL is None:

        baseline = generate_demo_baseline()

        MODEL = IsolationForest(
            n_estimators=150,
            contamination=0.05,
            random_state=42
        )

        MODEL.fit(baseline)

    return MODEL


def validate_reading(
    record: dict[str, Any]
) -> tuple[bool, str]:

    for feature in FEATURES:

        if feature not in record:
            return False, f"Missing measurement: {feature}"

        try:
            value = float(record[feature])
        except (TypeError, ValueError):
            return False, f"Invalid measurement: {feature}"

        if not np.isfinite(value):
            return False, f"Invalid numerical value: {feature}"

    heart = float(record["heart_rate"])
    oxygen = float(record["oxygen_level"])
    temperature = float(record["temperature"])

    if not 20 <= heart <= 250:
        return False, "Heart rate input is outside the accepted range."

    if not 0 <= oxygen <= 100:
        return False, "Oxygen input must be between 0 and 100."

    if not 25 <= temperature <= 45:
        return False, "Temperature input is outside the accepted range."

    return True, "Valid measurement."


def explain_anomaly(
    record: dict[str, Any]
) -> list[str]:

    reasons = []

    heart = float(record["heart_rate"])
    oxygen = float(record["oxygen_level"])
    temperature = float(record["temperature"])

    if heart < 55 or heart > 105:
        reasons.append(
            "Heart-rate reading differs from the demonstration baseline."
        )

    if oxygen < 94:
        reasons.append(
            "Oxygen reading differs from the demonstration baseline."
        )

    if temperature < 36.0 or temperature > 37.8:
        reasons.append(
            "Temperature reading differs from the demonstration baseline."
        )

    return reasons


def analyse_health_reading(
    record: dict[str, Any]
) -> dict[str, Any]:

    valid, message = validate_reading(record)

    if not valid:
        return {
            "success": False,
            "error": message
        }

    values = np.array([[
        float(record["heart_rate"]),
        float(record["oxygen_level"]),
        float(record["temperature"])
    ]])

    model = get_model()

    prediction = int(model.predict(values)[0])
    raw_score = float(model.decision_function(values)[0])

    is_anomaly = prediction == -1
    reasons = explain_anomaly(record)

    return {
        "success": True,
        "is_anomaly": is_anomaly,
        "status": (
            "UNUSUAL_PATTERN"
            if is_anomaly
            else "WITHIN_DEMO_BASELINE"
        ),
        "anomaly_score": round(raw_score, 4),
        "reasons": reasons if is_anomaly else [],
        "measurements": {
            feature: float(record[feature])
            for feature in FEATURES
        },
        "data_source": record.get("source", "UNKNOWN"),
        "model": "IsolationForest",
        "baseline": "SYNTHETIC_DEMONSTRATION",
        "disclaimer": (
            "Experimental anomaly detection only. "
            "Not a medical diagnosis or validated clinical alert."
        )
    }


def analyse_multiple_readings(
    records: list[dict[str, Any]]
) -> dict[str, Any]:

    results = [
        analyse_health_reading(record)
        for record in records
    ]

    successful = [
        result for result in results
        if result.get("success")
    ]

    anomaly_count = sum(
        1 for result in successful
        if result["is_anomaly"]
    )

    return {
        "success": True,
        "total_records": len(records),
        "analysed_records": len(successful),
        "anomaly_count": anomaly_count,
        "results": results
    }
