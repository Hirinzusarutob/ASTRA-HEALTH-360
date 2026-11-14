
document.addEventListener("DOMContentLoaded", () => {
    const voiceButton = document.getElementById("voice-button");
    const messageInput = document.getElementById("user-message");
    const assistantStatus = document.getElementById("assistant-status");
    const assistantForm = document.getElementById("assistant-form");

    if (!voiceButton || !messageInput) {
        console.warn("ASTRA voice controls are unavailable.");
        return;
    }

    const SpeechRecognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;

    let recognition = null;
    let isListening = false;

    function setStatus(message) {
        if (assistantStatus) {
            assistantStatus.textContent = message;
        }
    }

    function setButtonState(listening) {
        isListening = listening;

        voiceButton.textContent = listening
            ? "⏹ Stop Voice Input"
            : "🎙 Start Voice Input";

        voiceButton.setAttribute(
            "aria-pressed",
            String(listening)
        );
    }

    if (!SpeechRecognition) {
        voiceButton.disabled = true;
        voiceButton.title =
            "Speech recognition is not supported in this browser.";

        setStatus(
            "Voice input is not supported here. Try a recent version of Chrome or Edge."
        );

        return;
    }

    recognition = new SpeechRecognition();

    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let finalTranscript = "";

    recognition.onstart = () => {
        setButtonState(true);
        finalTranscript = "";
        setStatus("Listening... Speak your question clearly.");
    };

    recognition.onresult = event => {
        let interimTranscript = "";

        for (
            let i = event.resultIndex;
            i < event.results.length;
            i++
        ) {
            const transcript = event.results[i][0].transcript;

            if (event.results[i].isFinal) {
                finalTranscript += transcript;
            } else {
                interimTranscript += transcript;
            }
        }

        const recognizedText =
            (finalTranscript + " " + interimTranscript).trim();

        if (recognizedText) {
            messageInput.value = recognizedText;
        }

        if (finalTranscript.trim()) {
            setStatus("Voice captured. Review your question and press Send.");
        }
    };

    recognition.onerror = event => {
        console.error("Speech recognition error:", event.error);

        const messages = {
            "not-allowed": "Microphone permission was denied. Allow microphone access in your browser.",
            "no-speech": "No speech detected. Please try again.",
            "audio-capture": "No microphone was detected.",
            "network": "Speech recognition network error. Check your connection.",
            "aborted": "Voice input was stopped."
        };

        setStatus(
            messages[event.error] ||
            `Voice input error: ${event.error}`
        );

        setButtonState(false);
    };

    recognition.onend = () => {
        setButtonState(false);

        if (messageInput.value.trim()) {
            messageInput.focus();
        }
    };

    voiceButton.addEventListener("click", () => {
        if (isListening) {
            recognition.stop();
            setButtonState(false);
            setStatus("Voice input stopped.");
            return;
        }

        try {
            messageInput.value = "";
            recognition.start();
        } catch (error) {
            console.error("Could not start microphone:", error);
            setStatus("Could not start voice input. Please try again.");
            setButtonState(false);
        }
    });

    // Prevent microphone activity from continuing after page navigation.
    window.addEventListener("beforeunload", () => {
        if (isListening && recognition) {
            recognition.stop();
        }
    });

    console.log("ASTRA voice input initialized.");
});
