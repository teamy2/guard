
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, random_split
from dataset import get_combined_dataset
from model import BotClassifier, extract_features
import numpy as np
import pickle
import os

# --- Training Loop ---
def train_model():
    print("Loading datasets...")
    data_dir = os.path.join(os.path.dirname(__file__), '../data')
    full_dataset = get_combined_dataset(data_dir)
    
    if len(full_dataset) == 0:
        print("No data found! Check paths.")
        return

    # Precompute features
    print("Extracting features...")
    X = []
    y = []
    for sample in full_dataset.data:
        X.append(extract_features(sample))
        y.append(sample['label'])
    
    X = torch.tensor(np.array(X), dtype=torch.float32)
    y = torch.tensor(np.array(y), dtype=torch.float32).unsqueeze(1)
    
    # Normalize features
    mean = X.mean(dim=0)
    std = X.std(dim=0) + 1e-6
    X = (X - mean) / std
    
    # Save normalization stats
    with open('model_stats.pkl', 'wb') as f:
        pickle.dump({'mean': mean, 'std': std}, f)
        
    # Split
    dataset = torch.utils.data.TensorDataset(X, y)
    train_size = int(0.8 * len(dataset))
    val_size = len(dataset) - train_size
    train_ds, val_ds = random_split(dataset, [train_size, val_size])
    
    train_loader = DataLoader(train_ds, batch_size=64, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=64)
    
    # Init Model
    model = BotClassifier(input_dim=X.shape[1])
    criterion = nn.BCELoss()
    optimizer = optim.Adam(model.parameters(), lr=0.001)
    
    print(f"Starting training on {len(X)} samples for 5 epochs...")
    
    for epoch in range(5):
        model.train()
        total_loss = 0
        for batch_X, batch_y in train_loader:
            optimizer.zero_grad()
            outputs = model(batch_X)
            loss = criterion(outputs, batch_y)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
            
        model.eval()
        val_acc = 0
        with torch.no_grad():
            for batch_X, batch_y in val_loader:
                outputs = model(batch_X)
                predicted = (outputs > 0.5).float()
                val_acc += (predicted == batch_y).sum().item()
        
        print(f"Epoch {epoch+1}, Loss: {total_loss/len(train_loader):.4f}, Val Acc: {val_acc/val_size:.4f}")
        
    torch.save(model.state_dict(), "model.pth")
    print("Model saved to model.pth")

if __name__ == "__main__":
    train_model()
