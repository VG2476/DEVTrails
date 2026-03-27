"""
isolation_forest_pipeline.py
──────────────────────────────
Generates a synthetic dataset containing normal patterns and fraudulent 
policy-gaming topologies (GPS spoofing, burst claims) to train the 
GigKavach Anomaly Detection layer.
"""

import os
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

# Paths
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../data/processed")
os.makedirs(DATA_DIR, exist_ok=True)

def generate_fraud_data(num_records=10000, fraud_ratio=0.05) -> pd.DataFrame:
    """Synthesizes fraud topologies and maps them into an Isolation Forest training set."""
    print(f"Synthesizing {num_records} worker claim signatures (Fraud Ratio: {fraud_ratio*100}%)...")
    
    np.random.seed(42)
    
    data = []
    
    # Generate Normal Claims
    num_normal = int(num_records * (1 - fraud_ratio))
    for _ in range(num_normal):
        data.append({
            "gps_ip_mismatch": int(np.random.random() < 0.01), # Rare false positives
            "claim_burst_2min": np.random.randint(1, 3), # Normal 1-2 claims in the zone
            "dci_threshold_gaming": np.random.uniform(5.0, 30.0), # Distance from 65 (Safe)
            "platform_offline_all_day": False,
            "registration_age_days": np.random.randint(30, 1000), # Old accounts
            "device_id_duplicate": False,
            "gps_movement_entropy": np.random.uniform(0.6, 1.0), # High moving entropy (Normal deliveries)
            "stationary_gps_zero_orders": False,
            "is_fraud_label": 0  # For testing only, Isolation forest is unsupervised
        })
        
    # Generate Anomalous (Fraud) Claims
    num_fraud = num_records - num_normal
    for _ in range(num_fraud):
        # We inject specific fraud ring topologies
        fraud_type = np.random.choice(["GPS_Spoof", "Syndicate_Burst", "Threshold_Gamer"])
        
        record = {
            "gps_ip_mismatch": int(fraud_type == "GPS_Spoof" or np.random.random() < 0.8),
            "claim_burst_2min": np.random.randint(15, 50) if fraud_type == "Syndicate_Burst" else np.random.randint(1, 5),
            "dci_threshold_gaming": np.random.uniform(0.01, 0.5) if fraud_type == "Threshold_Gamer" else np.random.uniform(1.0, 20.0), # Extremely close to exactly 65 score
            "platform_offline_all_day": int(np.random.random() < 0.9), # Scammers don't actually do deliveries
            "registration_age_days": np.random.randint(0, 3) if np.random.random() < 0.7 else np.random.randint(10, 50), # Fresh burner accounts
            "device_id_duplicate": int(np.random.random() < 0.6), # Emulators copy IDs
            "gps_movement_entropy": np.random.uniform(0.0, 0.1), # Very low entropy (GPS locked via spoofing app)
            "stationary_gps_zero_orders": int(np.random.random() < 0.85),
            "is_fraud_label": 1
        }
        data.append(record)
        
    df = pd.DataFrame(data)
    
    # Shuffle dataset
    df = df.sample(frac=1, random_state=42).reset_index(drop=True)
    return df

def preprocess_isolation_forest(df: pd.DataFrame):
    """Numerically scales and transforms the dataset for spatial anomaly distance computing."""
    print("Normalizing fraud vectors via StandardScaler...")
    
    # Save the labels aside (For evaluation, the model shouldn't see this)
    y_test_labels = df["is_fraud_label"].copy()
    X = df.drop(columns=["is_fraud_label"])
    
    # Convert booleans to floats
    for col in X.columns:
        if X[col].dtype == 'bool':
            X[col] = X[col].astype(float)
            
    # Apply standard scaling so high-variance floats (registration_age) don't dominate cluster spacing
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    X_scaled_df = pd.DataFrame(X_scaled, columns=X.columns)
    
    # Bind it back for the CSV (we keep the labels just so the Devs can test it later)
    X_scaled_df["is_fraud_label"] = y_test_labels
    
    csv_path = os.path.join(DATA_DIR, "fraud_training_set.csv")
    X_scaled_df.to_csv(csv_path, index=False)
    
    print(f"✅ Fraud Dataset Normalized and Exported to: {csv_path}")
    print(f"Dataset Shape: {X_scaled_df.shape}")
    
    # Quick sanity check
    from sklearn.ensemble import IsolationForest
    print("\nExecuting dry-run Mock Isolation Forest to test topological separability...")
    
    model = IsolationForest(contamination=0.05, random_state=42, n_estimators=100)
    # Fit strictly on scaled features (no labels)
    X_fit = X_scaled_df.drop(columns=["is_fraud_label"])
    
    predictions = model.fit_predict(X_fit)
    # -1 for anomalies, 1 for normal
    anomalies_detected = (predictions == -1).sum()
    print(f"Isolation Forest flagged {anomalies_detected} anomalies out of {len(predictions)} records.")
    
    # Compare with our injected labels to see if the features are good enough
    true_frauds = (X_scaled_df["is_fraud_label"] == 1).sum()
    print(f"Ground Truth Frauds Injected: {true_frauds}")
    print("--------------------------------------------------")

if __name__ == "__main__":
    df = generate_fraud_data()
    preprocess_isolation_forest(df)
