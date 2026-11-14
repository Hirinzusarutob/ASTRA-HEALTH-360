
import os
import logging
import requests

logger = logging.getLogger("ASTRA_AI")

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

OPENROUTER_MODEL = os.getenv(
    "OPENROUTER_MODEL",
    "openrouter/free"
)

SYSTEM_PROMPT = """
You are ASTRA AI, the intelligent health-support assistant
inside ASTRA HEALTH 360.

You are the mission-support intelligence layer for ASTRA HEALTH 360, an educational prototype.

CORE CAPABILITIES
1. Explain astronaut physiology, wellness and spaceflight health research.
2. Explain heart rate, oxygen saturation (SpO2), body temperature and environmental measurements.
3. Explain the platform's modules, dashboards, alerts and data flow.
4. Teach machine-learning concepts used in the prototype, especially Isolation Forest.
5. Help users interpret a supplied reading cautiously and identify what a human reviewer should verify.
6. Explain microgravity, radiation, circadian disruption, bone loss, muscle deconditioning and immune changes.
7. Suggest evidence-aware questions for mission medical and operations teams.

RESPONSE QUALITY
- Be clear, calm, concise and technically accurate.
- Adapt depth to the user's question; explain acronyms on first use.
- Use headings, numbered steps or compact tables when they improve clarity.
- Separate known facts, assumptions and recommendations.
- Never invent live telemetry, crew records, NASA findings or actions performed by the system.
- If data is not included in the conversation, say that you cannot see it.
- Clearly label demo/simulated readings and synthetic baselines.
- For algorithm questions, explain inputs, processing, output and limitations.
- Never imply this prototype is connected to NASA operational systems.

Medical safety:
- You are not a doctor.
- Do not diagnose diseases or prescribe medication.
- Do not set universal clinical thresholds or infer a diagnosis from a single value.
- Recommend qualified medical review for concerning readings.
- For emergencies, advise contacting the mission medical officer
  and following established emergency procedures.
- Never claim to have contacted emergency services or mission control.
"""


def ask_astra(question, conversation_history=None):
    question = str(question).strip()

    if not question:
        raise ValueError("Please enter a message.")

    if len(question) > 4000:
        raise ValueError("Message is too long.")

    api_key = os.getenv("OPENROUTER_API_KEY")

    if not api_key:
        raise RuntimeError(
            "OPENROUTER_API_KEY is missing from Render environment settings."
        )

    messages = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT
        }
    ]

    if isinstance(conversation_history, list):
        for item in conversation_history[-10:]:
            if not isinstance(item, dict):
                continue

            role = item.get("role")
            content = item.get("content")

            if role in ("user", "assistant") and isinstance(content, str):
                if content.strip():
                    messages.append({
                        "role": role,
                        "content": content[:4000]
                    })

    if not (
        len(messages) > 1
        and messages[-1]["role"] == "user"
        and messages[-1]["content"].strip() == question
    ):
        messages.append({
            "role": "user",
            "content": question
        })

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://astra-health-360.onrender.com",
        "X-Title": "ASTRA HEALTH 360"
    }

    payload = {
        "model": OPENROUTER_MODEL,
        "messages": messages,
        "temperature": 0.5,
        "max_tokens": 1000
    }

    try:
        response = requests.post(
            OPENROUTER_URL,
            headers=headers,
            json=payload,
            timeout=90
        )

        if not response.ok:
            logger.error(
                "OpenRouter error %s: %s",
                response.status_code,
                response.text[:1000]
            )

            raise RuntimeError(
                f"OpenRouter returned HTTP {response.status_code}. "
                "Check your API key, model availability and account limits."
            )

        result = response.json()

        answer = (
            result.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        )

        if isinstance(answer, list):
            answer = "\n".join(
                item.get("text", "")
                for item in answer
                if isinstance(item, dict)
            )

        answer = str(answer).strip()

        if not answer:
            raise RuntimeError("ASTRA received an empty AI response.")

        return answer

    except requests.exceptions.Timeout as error:
        logger.exception("OpenRouter request timed out")
        raise RuntimeError(
            "ASTRA took too long to respond. Please try again."
        ) from error

    except requests.exceptions.RequestException as error:
        logger.exception("OpenRouter connection failed")
        raise RuntimeError(
            "Could not connect to OpenRouter."
        ) from error
