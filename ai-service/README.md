# AI Bot Detection Service

This is a Python-based microservice that uses a PyTorch model to detect bot traffic.

## Prerequisites

- Python 3.8+
- pip

## Setup

1.  **Install Dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

2.  **Train the Model:**
    ```bash
    python train.py
    ```
    This will parse the data in `../data`, train the model, and save `model.pth` and `model_stats.pkl`.

3.  **Run the API:**
    ```bash
    python main.py
    ```
    The service will start on `http://localhost:8000`.

## API

### POST /predict

**Request:**
```json
{
  "url": "/login",
  "method": "POST",
  "user_agent": "Mozilla/5.0..."
}
```

**Response:**
```json
{
  "bot_score": 0.95,
  "is_bot": true
}
```
