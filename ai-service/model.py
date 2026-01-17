
import torch
import torch.nn as nn
import numpy as np

# --- Feature Extraction ---
METHODS = {'GET': 0, 'POST': 1, 'PUT': 2, 'DELETE': 3, 'HEAD': 4, 'OPTIONS': 5, 'CONNECT': 6, 'TRACE': 7, 'PATCH': 8}

def extract_features(sample):
    """
    Converts a sample dict to a feature vector.
    """
    url = str(sample.get('url', ''))
    method = str(sample.get('method', 'GET')).upper()
    ua = str(sample.get('user_agent', ''))
    
    # 1. Method
    method_idx = METHODS.get(method, 0)
    
    # 2. URL Features
    url_len = len(url)
    url_depth = url.count('/')
    url_digits = sum(c.isdigit() for c in url)
    url_special = sum(not c.isalnum() for c in url)
    
    # 3. UA Features
    ua_len = len(ua)
    ua_digits = sum(c.isdigit() for c in ua)
    
    # Feature Vector (7 dims)
    return np.array([
        method_idx, 
        url_len, 
        url_depth, 
        url_digits, 
        url_special, 
        ua_len, 
        ua_digits
    ], dtype=np.float32)

# --- Model Definition ---
class BotClassifier(nn.Module):
    def __init__(self, input_dim=7):
        super(BotClassifier, self).__init__()
        self.network = nn.Sequential(
            nn.Linear(input_dim, 64),
            nn.ReLU(),
            nn.BatchNorm1d(64),
            nn.Dropout(0.3),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
            nn.Sigmoid()
        )
        
    def forward(self, x):
        return self.network(x)
