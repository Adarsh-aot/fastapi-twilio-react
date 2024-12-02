import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from twilio.jwt.access_token import AccessToken
from twilio.jwt.access_token.grants import VideoGrant
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Twilio credentials - now with more robust error checking
def get_twilio_credentials():
    account_sid = os.getenv('TWILIO_ACCOUNT_SID')
    api_key_sid = os.getenv('TWILIO_API_KEY_SID')
    api_key_secret = os.getenv('TWILIO_API_KEY_SECRET')

    if not all([account_sid, api_key_sid, api_key_secret]):
        raise ValueError("""
        Twilio credentials are missing. 
        Please set the following environment variables:
        - TWILIO_ACCOUNT_SID
        - TWILIO_API_KEY_SID
        - TWILIO_API_KEY_SECRET
        
        You can find these in your Twilio Console:
        1. Log in to Twilio
        2. Go to Account > API Keys & Tokens
        3. Create a new API Key or use existing credentials
        """)
    
    return account_sid, api_key_sid, api_key_secret

app = FastAPI()

# Add CORS middleware to allow cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

class RoomTokenRequest(BaseModel):
    room_name: str
    identity: str

@app.post("/generate-token/")
async def generate_token(request: RoomTokenRequest):
    try:
        # Retrieve Twilio credentials
        account_sid, api_key_sid, api_key_secret = get_twilio_credentials()

        # Create Access Token
        access_token = AccessToken(
            account_sid,
            api_key_sid,
            api_key_secret,
            identity=request.identity
        )

        # Create Video Grant
        video_grant = VideoGrant(room=request.room_name)
        access_token.add_grant(video_grant)

        # Return the token
        return {"token": access_token.to_jwt()}

    except ValueError as ve:
        # This will catch the credential missing error
        raise HTTPException(status_code=500, detail=str(ve))
    except Exception as e:
        # Catch any other unexpected errors
        raise HTTPException(
            status_code=500, 
            detail=f"Unexpected error generating token: {str(e)}"
        )

# Optional: Health check endpoint
@app.get("/")
async def health_check():
    return {"status": "API is running"}

# To run the server:
# uvicorn main:app --reload --port 8001 