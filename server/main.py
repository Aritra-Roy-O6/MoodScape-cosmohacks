import os
import smtplib
from email.mime.text import MIMEText
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google import genai
from dotenv import load_dotenv
from huggingface_hub import InferenceClient

# 1. Load Environment Variables
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
HF_TOKEN = os.getenv("HF_TOKEN")
EMAIL_SENDER = os.getenv("EMAIL_SENDER")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD")

# 2. Initialize Clients
# Gemini (For Chat)
gemini_client = None
if GEMINI_API_KEY:
    try:
        gemini_client = genai.Client(api_key=GEMINI_API_KEY)
        print("✅ Gemini Client Initialized")
    except Exception as e:
        print(f"❌ Gemini Client Failed: {e}")

# Hugging Face (For Emotion) - Connects to Cloud API
if not HF_TOKEN:
    print("⚠️ WARNING: HF_TOKEN is missing. Emotion detection will fail.")
hf_client = InferenceClient(token=HF_TOKEN)

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
    try:
        # Use sentiment analysis (simple, reliable, FREE on Hugging Face)
        result = hf_client.text_classification(
            text=data.text,
            model="cardiffnlp/twitter-roberta-base-sentiment-latest"
        )
        
        print(f"📦 Sentiment Result: {result}")
        
        # Map sentiment to your 7 emotions
        if result and len(result) > 0:
            label = result[0]['label'].lower()
            score = result[0]['score']
            
            # Smart mapping based on sentiment + confidence
            if 'positive' in label:
                emotion = 'Energized' if score > 0.75 else 'Calm'
            elif 'negative' in label:
                if score > 0.8:
                    emotion = 'Overwhelmed'
                elif score > 0.6:
                    emotion = 'Anxious'
                else:
                    emotion = 'Low'
            else:  # neutral
                emotion = 'Focused'
            
            print(f"✅ Detected emotion: {emotion}")
            return {"emotion": emotion}
        
        return {"emotion": "Calm"}
        
    except Exception as e:
        print(f"⚠️ Error: {e}")
        import traceback
        traceback.print_exc()
        return {"emotion": "Calm"}

@app.post("/chat")
def chat_with_therapist(data: ChatRequest):
    if not gemini_client:
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
        response = gemini_client.models.generate_content(model='gemini-2.0-flash', contents=prompt)
        reply = response.text.strip()
        
        action_taken = None
        if "<TRIGGER_EMERGENCY>" in reply:
            reply = reply.replace("<TRIGGER_EMERGENCY>", "").strip()
            if data.emergency_email:
                send_emergency_email(data.user_email, data.emergency_email, data.text)
                action_taken = "email_sent"
        
        return {"reply": reply, "action": action_taken}
    except Exception as e:
        print(f"Chat Error: {e}")
        return {"reply": "I hear you. I'm right here with you.", "action": None}

if __name__ == "__main__":
    import uvicorn
    # Use port 8000 for local development
    uvicorn.run(app, host="0.0.0.0", port=8000)