🌌 MoodScape
Your Safe Space for Emotional Balance. An AI-powered mental health companion that listens, understands, and guides you to a better state of mind.

MoodScape is a full-stack mental health MVP designed to detect emotions in real-time and provide immediate, actionable support. It combines local AI privacy with Cloud AI intelligence to offer personalized grounding rituals and a safety-first therapeutic chat experience.

✨ Key Features
🧠 Hybrid AI Architecture
Privacy-First Emotion Detection: Uses a local HuggingFace model (facebook/bart-large-mnli) to analyze user sentiment instantly on-device without API latency.

Intelligent Therapist Chat: Powered by Google Gemini 2.0 Flash, offering empathetic, context-aware conversation to help users process their feelings.

🛡️ Crisis Intervention System (Safety First)
Real-time Threat Detection: The AI monitors conversations for signs of severe distress (self-harm, suicide).

Automated SOS: Automatically triggers an emergency email to a trusted contact (stored securely in Firebase) if a crisis is detected, ensuring users are never truly alone.

🌊 Immersive "Glassmorphism" UI
Adaptive Atmosphere: The interface changes colors, gradients, and ambient animations based on the detected mood (e.g., Calming Teal for "Anxious", Warm Amber for "Low").

Guided Rituals: Interactive, step-by-step grounding exercises (Breathing, Visualization, CBT techniques) tailored to the specific emotion.

Smooth Animations: Powered by Framer Motion for a breathing, organic feel.

🔐 Secure & Personalized
Google Authentication: Secure login via Firebase Auth.

Persistent History: Tracks mood patterns over time.

Encrypted User Data: Emergency contacts stored securely in Firestore.

🛠️ Tech Stack
Frontend (Client)
Framework: React (Vite)

Styling: Tailwind CSS (Glassmorphism design)

Animations: Framer Motion

Auth & DB: Firebase (Auth + Firestore)

Backend (Server)
API Framework: FastAPI (Python)

Local ML: HuggingFace Transformers (pipeline)

Cloud LLM: Google Gemini API (google-genai SDK)

Email Service: Python smtplib (Gmail Relay)

📸 How It Works
Check-In: User types how they are feeling ("I am so stressed about work").

Analysis: The Local Brain identifies "Anxious" and instantly shifts the UI to a calming deep blue theme.

Ritual: App presents a "4-7-8 Breathing" exercise with a visual pacer.

Reflection: After the ritual, the user can chat with the AI Therapist.

Safety Net: If the user types "I can't go on," the system immediately emails their emergency contact.

🔮 Future Roadmap
[ ] Voice-enabled check-ins.

[ ] Long-term mood trend analysis graphs.

[ ] Integration with wearable health data (Heart Rate/HRV).