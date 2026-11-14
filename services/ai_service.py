
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

Your responsibilities:
1. Explain astronaut health and wellness.
2. Explain heart rate, oxygen saturation and temperature readings.
3. Help users understand health reports and alerts.
4. Explain the effects of microgravity on the human body.
5. Help users understand the ASTRA HEALTH 360 dashboard.

Response style:
- Be friendly, intelligent and professional.
- Respond naturally to greetings.
- Explain technical concepts in simple language.
- Use clear structured answers when useful.
- Never invent sensor readings or mission information.
- Clearly identify simulated data as simulated.

Medical safety:
- You are not a doctor.
- Do not diagnose diseases or prescribe medication.
- Recommend professional medical review for concerning readings.
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
        "max_tokens": 700
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
