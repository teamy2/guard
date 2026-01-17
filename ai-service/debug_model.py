
import torch
import pickle
import numpy as np
from model import BotClassifier, extract_features

def debug():
    # 1. Load Stats
    try:
        with open('model_stats.pkl', 'rb') as f:
            stats = pickle.load(f)
        print("Stats Loaded:")
        print("Mean:", stats['mean'])
        print("Std:", stats['std'])
    except Exception as e:
        print("Failed to load stats:", e)
        return

    # 2. Load Model
    model = BotClassifier()
    try:
        state = torch.load("model.pth")
        model.load_state_dict(state)
        model.eval()
        print("Model loaded.")
    except Exception as e:
        print("Failed to load model:", e)
        return

    # 3. Test Cases
    cases = [
        {'url': '/', 'method': 'GET', 'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'},
        {'url': '/login?user=\' OR 1=1', 'method': 'GET', 'user_agent': 'sqlmap/1.5.2'},
        {'url': '/about', 'method': 'GET', 'user_agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'}
    ]

    print("\n--- Inference ---")
    for case in cases:
        print(f"\nCase: {case['url']}")
        # Extract
        x_raw = extract_features(case)
        print("Raw Features:", x_raw)
        
        # Normalize
        x_norm = (x_raw - stats['mean'].numpy()) / stats['std'].numpy()
        print("Norm Features:", x_norm)
        
        # Predict
        x_tensor = torch.tensor(x_norm, dtype=torch.float32).unsqueeze(0)
        with torch.no_grad():
            score = model(x_tensor).item()
        print(f"Score: {score:.4f}")

if __name__ == "__main__":
    debug()
