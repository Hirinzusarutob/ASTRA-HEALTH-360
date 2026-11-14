
import requests

OLLAMA_URL = "http://localhost:11434/api/chat"
OLLAMA_MODEL = "llama3.2:3b"

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
    """
    Send a question and recent conversation history to local Ollama.
    No paid API key is required.
    """

    if not isinstance(question, str) or not question.strip():
        raise ValueError("Please enter a valid question.")

    messages = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT
        }
    ]

    if isinstance(conversation_history, list):
        for item in conversation_history[-12:]:
            if not isinstance(item, dict):
                continue

            role = item.get("role")
            content = item.get("content")

            if role not in ("user", "assistant"):
                continue

            if not isinstance(content, str) or not content.strip():
                continue

            messages.append({
                "role": role,
                "content": content[:4000]
            })

    # Avoid adding the current question twice when the browser
    # already included it in conversation_history.
    if not (
        messages and
        messages[-1]["role"] == "user" and
        messages[-1]["content"].strip() == question.strip()
    ):
        messages.append({
            "role": "user",
            "content": question.strip()
        })

    payload = {
        "model": OLLAMA_MODEL,
        "messages": messages,
        "stream": False,
        "options": {
            "temperature": 0.5,
            "num_predict": 700
        }
    }

    try:
        response = requests.post(
            OLLAMA_URL,
            json=payload,
            timeout=120
        )

        response.raise_for_status()
        result = response.json()

        answer = (
            result.get("message", {}).get("content", "")
        ).strip()

        if not answer:
            raise RuntimeError("Ollama returned an empty response.")

        return answer

    except requests.exceptions.ConnectionError as error:
        raise RuntimeError(
            "Cannot connect to Ollama. Make sure Ollama is running "
            "and the llama3.2:3b model is installed."
        ) from error

    except requests.exceptions.Timeout as error:
        raise RuntimeError(
            "The AI model took too long to respond. Please try again."
        ) from error

    except requests.exceptions.HTTPError as error:
        raise RuntimeError(
            "Ollama returned an HTTP error. Check that the model "
            "llama3.2:3b is available."
        ) from error

    except requests.exceptions.RequestException as error:
        raise RuntimeError(
            f"AI connection error: {error}"
        ) from error
