
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import torch
import numpy as np
import pickle
from model import BotClassifier, extract_features
import os

app = FastAPI()

# Global variables for model and stats
model = None
stats = None

class RequestFeatures(BaseModel):
    url: str
    method: str = "GET"
    user_agent: str = ""

@app.on_event("startup")
def load_model():
    global model, stats
    
    # 1. Load Stats
    try:
        with open('model_stats.pkl', 'rb') as f:
            stats = pickle.load(f)
        print("Loaded normalization stats.")
    except FileNotFoundError:
        print("Stats file not found. Run train.py first.")
        stats = None
        
    # 2. Load Model
    try:
        model = BotClassifier()
        model.load_state_dict(torch.load("model.pth"))
        model.eval()
        print("Loaded model weights.")
    except FileNotFoundError:
        print("Model file not found. Run train.py first.")
        model = None

@app.get("/health")
def health_check():
    return {"status": "ok", "model_loaded": model is not None}

@app.post("/predict")
def predict(features: RequestFeatures):
    if model is None or stats is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
        
    # Extract features
    # Convert Pydantic model to dict
    sample = features.dict()
    
    # Extract
    x = extract_features(sample)
    
    # Normalize
    mean = stats['mean']
    std = stats['std']
    x = (x - mean.numpy()) / std.numpy() # Ensure numpy ops
    
    # Convert to Tensor
    x_tensor = torch.tensor(x, dtype=torch.float32).unsqueeze(0) # Batch dim
    
    # Inference
    with torch.no_grad():
        score = model(x_tensor).item()
        
    return {
        "bot_score": score,
        "is_bot": score > 0.5
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
