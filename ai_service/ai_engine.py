import torch
import torch.nn as nn
import math
import os
from textblob import TextBlob

# ---------------- CONFIGURATION ----------------
DEVICE = torch.device("cpu") # Render uses CPU
MAX_LEN = 100

# ---------------- MODEL ARCHITECTURE ----------------
class PositionalEncoding(nn.Module):
    def __init__(self, d_model, max_len=MAX_LEN):
        super().__init__()
        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model))
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        self.register_buffer('pe', pe.unsqueeze(0))

    def forward(self, x):
        return x + self.pe[:, :x.size(1)]

class TransformerModel(nn.Module):
    def __init__(self, vocab_size, d_model, n_heads, ff_dim, num_layers):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, d_model)
        self.pos_encoding = PositionalEncoding(d_model)
        self.transformer = nn.Transformer(
            d_model=d_model,
            nhead=n_heads,
            num_encoder_layers=num_layers,
            num_decoder_layers=num_layers,
            dim_feedforward=ff_dim,
            dropout=0.1,
            batch_first=True
        )
        self.fc_out = nn.Linear(d_model, vocab_size)

    def forward(self, src, tgt):
        src_emb = self.pos_encoding(self.embedding(src))
        tgt_emb = self.pos_encoding(self.embedding(tgt))
        tgt_mask = self.transformer.generate_square_subsequent_mask(tgt.size(1)).to(DEVICE)
        out = self.transformer(src_emb, tgt_emb, tgt_mask=tgt_mask)
        return self.fc_out(out)

# ---------------- PREDICTOR CLASS ----------------
class SymptomPredictor:
    def __init__(self, model_path):
        self.model = None
        self.word2idx = {}
        self.idx2word = {}
        self._load_model(model_path)

    def _load_model(self, path):
        if not os.path.exists(path):
            raise FileNotFoundError(f"Model file not found at: {path}")

        print(f"Loading AI Brain from {path}...")
        checkpoint = torch.load(path, map_location=DEVICE)
        
        self.word2idx = checkpoint['word2idx']
        self.idx2word = checkpoint['idx2word']
        config = checkpoint['config']
        
        self.model = TransformerModel(
            vocab_size=config['vocab_size'],
            d_model=config['EMBED_DIM'],
            n_heads=config['N_HEADS'],
            ff_dim=config['FF_DIM'],
            num_layers=config['NUM_LAYERS']
        ).to(DEVICE)
        
        # ✅ FIXED LINE: strict=False ignores the missing 'pos_encoding.pe'
        self.model.load_state_dict(checkpoint['model_state_dict'], strict=False)
        self.model.eval()
        print("✅ AI Brain Loaded & Ready!")

    def _encode_text(self, text):
        return [self.word2idx.get(w, self.word2idx.get("<unk>", 0)) for w in text.lower().split()]

    def predict(self, sentence):
        try:
            corrected = str(TextBlob(sentence).correct())
            src_tokens = self._encode_text(corrected)[:MAX_LEN-2]
            
            sos_idx = self.word2idx.get("<sos>", 1)
            eos_idx = self.word2idx.get("<eos>", 2)
            pad_idx = self.word2idx.get("<pad>", 0)

            src_padded = [sos_idx] + src_tokens + [eos_idx] + [pad_idx] * (MAX_LEN - len(src_tokens) - 2)
            src_tensor = torch.tensor([src_padded], dtype=torch.long).to(DEVICE)
            tgt_tensor = torch.tensor([[sos_idx]], dtype=torch.long).to(DEVICE)
            
            with torch.no_grad():
                for _ in range(MAX_LEN):
                    output = self.model(src_tensor, tgt_tensor)
                    next_token = output[0, -1].argmax(dim=-1).item()
                    if next_token == eos_idx:
                        break
                    tgt_tensor = torch.cat([tgt_tensor, torch.tensor([[next_token]], device=DEVICE)], dim=1)

            prediction = " ".join([self.idx2word.get(idx, "") for idx in tgt_tensor[0].tolist()[1:]])
            return {"original": sentence, "corrected": corrected, "diagnosis": prediction}
            
        except Exception as e:
            return {"error": str(e)}

predictor = SymptomPredictor("symptom_transformer.pth")