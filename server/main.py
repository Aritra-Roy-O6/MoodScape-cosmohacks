import os
import smtplib
from email.mime.text import MIMEText
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from transformers import pipeline
from google import genai
from dotenv import load_dotenv

# 1. Load Environment Variables
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
EMAIL_SENDER = os.getenv("EMAIL_SENDER")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD")

# 2. Initialize LOCAL Emotion Brain (HuggingFace)
print("⏳ Loading Local Emotion Model...")
try:
    classifier = pipeline("zero-shot-classification", model="facebook/bart-large-mnli")
    print("✅ Local Brain Loaded!")
except Exception as e:
    print(f"❌ Failed to load local model: {e}")

# 3. Initialize GEMINI CLIENT (New SDK)
client = None
if GEMINI_API_KEY:
    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        print("✅ Gemini Client Initialized")
    except Exception as e:
        print(f"❌ Gemini Client Failed: {e}")

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
    labels = ["Calm", "Anxious", "Overwhelmed", "Low", "Focused", "Energized", "Sad"]
    try:
        result = classifier(data.text, labels)
        return {"emotion": result['labels'][0]}
    except:
        return {"emotion": "Anxious"}

@app.post("/chat")
def chat_with_therapist(data: ChatRequest):
    if not client:
        return {"reply": "I am having trouble connecting to my AI brain, but I am listening.", "action": None}

    prompt = f"""
    You are an empathetic therapist and friend called Moody. User feels {data.mood}.
    User said: "{data.text}"
    Instructions:
    1. Validate their feeling briefly.
    2. If they mention suicide/self-harm, end with <TRIGGER_EMERGENCY>.
    3. Otherwise, ask a gentle grounding question.
    """

    # UPDATED: Use the correct stable models based on your documentation
    models_to_try = ['gemini-2.5-flash','gemini-2.0-flash', 'gemini-2.0-flash-lite']
    
    for model_name in models_to_try:
        try:
            response = client.models.generate_content(
                model=model_name, 
                contents=prompt
            )
            
            reply = response.text.strip()
            
            action_taken = None
            if "<TRIGGER_EMERGENCY>" in reply:
                reply = reply.replace("<TRIGGER_EMERGENCY>", "").strip()
                if data.emergency_email:
                    send_emergency_email(data.user_email, data.emergency_email, data.text)
                    action_taken = "email_sent"
                    reply += " (I have notified your emergency contact. Please stay safe.)"
                else:
                    reply += " (Please call a helpline immediately. You matter.)"

            return {"reply": reply, "action": action_taken}
            
        except Exception as e:
            print(f"⚠️ {model_name} failed: {e}")
            continue

    return {"reply": "I am listening, but my connection is weak right now. Please tell me more.", "action": None}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)