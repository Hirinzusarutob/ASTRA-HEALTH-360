import os
import requests

GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent"

SYSTEM_PROMPT = """
You are ASTRA, the AI health-support assistant for ASTRA HEALTH 360,
a health-monitoring platform designed for astronaut missions.

Your responsibilities:
1. Explain astronaut health-monitoring concepts.
2. Help interpret stored heart rate, oxygen saturation and temperature
   readings in an educational way.
3. Explain exercise, hydration, sleep, nutrition and general wellness.
4. Help users understand alerts and mission health reports.
5. Answer questions about the ASTRA HEALTH 360 platform.

Safety rules:
- You are an educational support assistant, not a doctor.
- Never claim to diagnose a disease or medical condition.
- Never prescribe medicines or recommend medication dosages.
- Do not invent sensor readings or claim that simulated data is real.
- Clearly explain when information is missing.
- For a serious or potentially life-threatening situation, instruct
  the user to contact the mission medical officer and follow
  established emergency medical protocols.
- Keep responses clear, practical and easy to understand.
- Never pretend to contact rescue teams or dispatch emergency services.
"""


def ask_astra(question, conversation_history=None):
    """Send a question to Gemini using a server-side API key."""

    if not isinstance(question, str) or not question.strip():
        raise ValueError("Please enter a valid question.")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "Gemini is not configured. Add GEMINI_API_KEY in Render environment variables."
        )

    contents = []

    if isinstance(conversation_history, list):
        for item in conversation_history[-12:]:
            if not isinstance(item, dict):
                continue

            role = item.get("role")
            text = item.get("content")

            if role not in ("user", "assistant"):
                continue
            if not isinstance(text, str) or not text.strip():
                continue

            contents.append({
                "role": "model" if role == "assistant" else "user",
                "parts": [{"text": text[:4000]}]
            })

    if not (
        contents
        and contents[-1]["role"] == "user"
        and contents[-1]["parts"][0]["text"].strip() == question.strip()
    ):
        contents.append({
            "role": "user",
            "parts": [{"text": question.strip()}]
        })

    payload = {
        "system_instruction": {
            "parts": [{"text": SYSTEM_PROMPT}]
        },
        "contents": contents,
        "generationConfig": {
            "temperature": 0.5,
            "maxOutputTokens": 700
        }
    }

    try:
        response = requests.post(
            GEMINI_API_URL,
            headers={
                "x-goog-api-key": api_key,
                "Content-Type": "application/json"
            },
            json=payload,
            timeout=60
        )

        if not response.ok:
            try:
                detail = response.json().get("error", {}).get("message", "")
            except ValueError:
                detail = response.text[:500]
            raise RuntimeError(
                f"Gemini API error ({response.status_code}): {detail or 'Request failed.'}"
            )

        result = response.json()
        candidates = result.get("candidates", [])
        if not candidates:
            raise RuntimeError("Gemini returned no response. Try rephrasing your question.")

        parts = candidates[0].get("content", {}).get("parts", [])
        answer = "\n".join(
            part.get("text", "") for part in parts if part.get("text")
        ).strip()

        if not answer:
            raise RuntimeError("Gemini returned an empty response.")

        return answer

    except requests.exceptions.Timeout as error:
        raise RuntimeError("Gemini took too long to respond. Please try again.") from error
    except requests.exceptions.RequestException as error:
        raise RuntimeError(f"Could not connect to Gemini: {error}") from error
