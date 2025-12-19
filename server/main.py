import os
import requests
import smtplib
from email.mime.text import MIMEText
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google import genai
from dotenv import load_dotenv

# 1. Load Environment Variables
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
HF_TOKEN = os.getenv("HF_TOKEN")  # <--- Make sure this is in your Render Env Vars
EMAIL_SENDER = os.getenv("EMAIL_SENDER")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD")

# 2. Initialize GEMINI CLIENT (For Chat)
client = None
if GEMINI_API_KEY:
    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        print("✅ Gemini Client Initialized")
    except Exception as e:
        print(f"❌ Gemini Client Failed: {e}")

# 3. Config for Hugging Face (For Emotion Detection)
HF_API_URL = "https://api-inference.huggingface.co/models/facebook/bart-large-mnli"
hf_headers = {"Authorization": f"Bearer {HF_TOKEN}"}

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AnalysisRequest(BaseModel):
    text: str

class ChatRequest(BaseModel):
    text: str
    mood: str
    history: list = []
    user_email: str | None = None
    emergency_email: str | None = None

def send_emergency_email(user_email, target_email, user_text):
    if not EMAIL_SENDER or not EMAIL_PASSWORD or not target_email:
        print("❌ Email credentials missing.")
        return False
    try:
        msg = MIMEText(f"URGENT: Your friend ({user_email}) needs support.\n\nThey said: \"{user_text}\"\n\nPlease reach out immediately.")
        msg['Subject'] = "🚨 MoodScape Emergency Alert"
        msg['From'] = EMAIL_SENDER
        msg['To'] = target_email
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
            server.login(EMAIL_SENDER, EMAIL_PASSWORD)
            server.send_message(msg)
        print(f"✅ Emergency email sent to {target_email}")
        return True
    except Exception as e:
        print(f"❌ Email failed: {e}")
        return False

@app.post("/predict")
def predict_emotion(data: AnalysisRequest):
    # The categories to check against
    labels = ["Calm", "Anxious", "Overwhelmed", "Low", "Focused", "Energized", "Sad"]
    
    payload = {
        "inputs": data.text,
        "parameters": {"candidate_labels": labels}
    }

    try:
        # Hit Hugging Face Cloud API
        response = requests.post(HF_API_URL, headers=hf_headers, json=payload)
        result = response.json()
        
        # Check if model is loading (HF specific 503 error)
        if "error" in result and "loading" in result["error"]:
            print("⚠️ Model loading, falling back to Anxious")
            return {"emotion": "Anxious"} 

        # result is usually dict with 'labels' and 'scores'
        top_emotion = result['labels'][0]
        return {"emotion": top_emotion}
        
    except Exception as e:
        print(f"⚠️ HF API Error: {e}")
        # Fallback to Anxious so app doesn't crash
        return {"emotion": "Anxious"}

@app.post("/chat")
def chat_with_therapist(data: ChatRequest):
    if not client:
        return {"reply": "I am listening. Please tell me more.", "action": None}

    prompt = f"""
    You are Moody, an empathetic therapist. User feels {data.mood}.
    User said: "{data.text}"
    Instructions:
    1. Validate their feeling briefly.
    2. Keep it supportive and under 3 sentences.
    3. If they mention suicide or self-harm, end your message with exactly this code: <TRIGGER_EMERGENCY>.
    """

    try:
        response = client.models.generate_content(model='gemini-2.5-flash', contents=prompt)
        reply = response.text.strip()
        
        action_taken = None
        if "<TRIGGER_EMERGENCY>" in reply:
            reply = reply.replace("<TRIGGER_EMERGENCY>", "").strip()
            if data.emergency_email:
                send_emergency_email(data.user_email, data.emergency_email, data.text)
                action_taken = "email_sent"
        
        return {"reply": reply, "action": action_taken}
    except Exception as e:
        return {"reply": "I hear you. I'm right here with you.", "action": None}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)