
import os
import re
import pandas as pd
import glob
from torch.utils.data import Dataset, ConcatDataset
import torch

class UnifiedDataset(Dataset):
    def __init__(self, data):
        """
        data: list of dicts with keys ['url', 'method', 'user_agent', 'label']
        """
        self.data = data
    
    def __len__(self):
        return len(self.data)
    
    def __getitem__(self, idx):
        return self.data[idx]

def load_phase_data(data_dir):
    """
    Parses Phase 1 and Phase 2 logs and annotations.
    """
    samples = []
    
    # Locate all annotation files
    pattern = os.path.join(data_dir, "phase*", "annotations", "*", "train")
    print(f"DEBUG: Looking for annotations with pattern: {pattern}")
    annotation_files = glob.glob(pattern) + \
                       glob.glob(os.path.join(data_dir, "phase*", "annotations", "*", "test"))
    print(f"DEBUG: Found {len(annotation_files)} annotation files: {annotation_files}")
    
    # Load labels
    session_labels = {}
    for af in annotation_files:
        with open(af, 'r') as f:
            for line in f:
                parts = line.strip().split()
                if len(parts) == 2:
                    sid, label = parts
                    session_labels[sid] = 1 if 'bot' in label.lower() else 0
                    
    # Locate log files
    log_files = glob.glob(os.path.join(data_dir, "phase*/data/web_logs/*/*.log"))
    
    # Apache log regex
    # Format: - - [Date] "METHOD URL PROTOCOL" Status Size "Referrer" SessionID "UserAgent"
    # Example: - - [29/Oct/2019...] "GET /css/main.css HTTP/1.1" 200 764 "..." g2gh9... "Mozilla..."
    log_pattern = re.compile(r'- - \[.*?\] "(.*?) (.*?) HTTP/.*?" \d+ \d+ "(.*?)" (\S+) "(.*?)"')
    
    for lf in log_files:
        with open(lf, 'r', encoding='latin-1') as f:
            for line in f:
                match = log_pattern.match(line)
                if match:
                    method, url, referrer, sid, ua = match.groups()
                    sid = sid.strip()
                    if sid in session_labels:
                        samples.append({
                            'url': url,
                            'method': method,
                            'user_agent': ua,
                            'label': session_labels[sid]
                        })
    
    print(f"Loaded {len(samples)} samples from Phase data")
    return samples

def load_csic_data(csv_path):
    samples = []
    if not os.path.exists(csv_path):
        print(f"CSIC file not found: {csv_path}")
        return samples
        
    try:
        df = pd.read_csv(csv_path)
        # Columns: Method,User-Agent,...,classification,URL
        for _, row in df.iterrows():
            label = 0 if row['classification'] == 'Normal' else 1
            samples.append({
                'url': row['URL'],
                'method': row['Method'],
                'user_agent': row['User-Agent'],
                'label': label
            })
    except Exception as e:
        print(f"Error loading CSIC data: {e}")
        
    print(f"Loaded {len(samples)} samples from CSIC data")
    return samples

def load_query_data(file_path, label, limit=50000):
    samples = []
    if not os.path.exists(file_path):
        print(f"Query file not found: {file_path}")
        return samples
        
    with open(file_path, 'r', encoding='latin-1') as f:
        for i, line in enumerate(f):
            if i >= limit:
                break
            url = line.strip()
            if url:
                samples.append({
                    'url': url,
                    'method': 'GET', # Default
                    'user_agent': '', # Default
                    'label': label
                })
    print(f"Loaded {len(samples)} samples from {os.path.basename(file_path)}")
    return samples

def get_combined_dataset(root_dir):
    all_samples = []
    
    # 1. Phase Data
    all_samples.extend(load_phase_data(root_dir))
    
    # 2. CSIC Data
    all_samples.extend(load_csic_data(os.path.join(root_dir, 'csic_database.csv')))
    
    # 3. Queries
    all_samples.extend(load_query_data(os.path.join(root_dir, 'goodqueries.txt'), 0))
    all_samples.extend(load_query_data(os.path.join(root_dir, 'badqueries.txt'), 1))
    
    return UnifiedDataset(all_samples)

if __name__ == "__main__":
    # Test loading
    ds = get_combined_dataset("../data")
    print(f"Total Combined Samples: {len(ds)}")
    if len(ds) > 0:
        print("Sample 0:", ds[0])

