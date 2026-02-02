import torch
import torch.nn as nn
import math
import os
import random
from textblob import TextBlob

# ---------------- CONFIGURATION ----------------
DEVICE = torch.device("cpu") 
MAX_LEN = 100

# ---------------- MODEL ARCHITECTURE (DO NOT TOUCH) ----------------
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

# ---------------- 🧠 SMART PREDICTOR CLASS ----------------
class SymptomPredictor:
    def __init__(self, model_path):
        self.model = None
        self.word2idx = {}
        self.idx2word = {}
        
        # ✅ EXTENDED MEDICAL ADVICE DATABASE (Non-Diagnostic, Supportive Care Only)
        self.advice_db = {
            "fungal infection": (
                "Keep the affected area clean and completely dry. "
                "Avoid sharing towels, clothes, or footwear. "
                "Wear loose, breathable cotton clothing. "
                "Do not scratch the area, as it can spread the infection. "
                "If symptoms persist or worsen, consult a dermatologist."
            ),
            "allergy": (
                "Identify and avoid known allergens such as dust, pollen, or pet dander. "
                "Keep windows closed during high pollen seasons. "
                "Use masks in polluted environments. "
                "Over-the-counter antihistamines may help, but consult a doctor if symptoms are severe."
            ),
            "malaria": (
                "Seek medical attention immediately for confirmation through blood tests. "
                "Rest adequately and drink plenty of fluids to prevent dehydration. "
                "Avoid self-medication. "
                "Use mosquito nets and repellents to prevent further bites."
            ),
            "jaundice": (
                "Drink plenty of boiled or filtered water. "
                "Eat easily digestible, low-fat foods. "
                "Avoid alcohol and oily or spicy foods completely. "
                "Take adequate rest and follow up with liver function tests as advised by a doctor."
            ),
            "stomach infection": (
                "Stay hydrated by drinking ORS or electrolyte solutions. "
                "Eat bland foods like rice, bananas, yogurt, and toast. "
                "Avoid spicy, oily, or outside food. "
                "If vomiting or diarrhea persists, seek medical help."
            ),
            "bronchial asthma": (
                "Keep prescribed inhalers accessible at all times. "
                "Avoid known triggers such as smoke, dust, cold air, and strong odors. "
                "Practice breathing exercises if advised. "
                "Seek emergency care if breathlessness suddenly worsens."
            ),
            "cervical spondylosis": (
                "Maintain proper posture while sitting and using electronic devices. "
                "Avoid prolonged screen time without breaks. "
                "Gentle neck stretching and physiotherapy exercises may help. "
                "Use a firm pillow and avoid sudden neck movements."
            ),
            "migraine": (
                "Rest in a dark, quiet room during an attack. "
                "Avoid loud noise, bright lights, and screen exposure. "
                "Stay well hydrated and do not skip meals. "
                "Identify and avoid personal triggers such as stress or lack of sleep."
            ),
            "arthritis": (
                "Apply warm compresses to relieve stiffness and cold packs for swelling. "
                "Engage in gentle joint movements to maintain flexibility. "
                "Maintain a healthy weight to reduce joint stress. "
                "Avoid heavy lifting or overexertion."
            ),
            "viral fever": (
                "Take complete rest and stay hydrated. "
                "Monitor body temperature regularly. "
                "Eat light, nutritious food. "
                "Avoid antibiotics unless prescribed by a doctor."
            ),
            "dengue": (
                "Seek immediate medical supervision and regular blood tests. "
                "Drink plenty of fluids such as water, coconut water, and ORS. "
                "Avoid painkillers like ibuprofen or aspirin. "
                "Watch for warning signs like bleeding or severe abdominal pain."
            ),
            "typhoid": (
                "Complete the full course of prescribed medication. "
                "Maintain strict hygiene and drink safe water. "
                "Eat soft, low-fiber foods during recovery. "
                "Avoid street food until fully recovered."
            ),
            "covid-19": (
                "Isolate yourself to prevent spread. "
                "Monitor oxygen levels and temperature regularly. "
                "Stay hydrated and get adequate rest. "
                "Seek medical attention if breathing difficulty develops."
            ),
            "food poisoning": (
                "Avoid solid food temporarily if vomiting is severe. "
                "Sip ORS or clear fluids frequently. "
                "Avoid dairy, caffeine, and alcohol. "
                "Seek medical care if symptoms persist beyond 24 hours."
            ),
            "dehydration": (
                "Increase fluid intake immediately using ORS or electrolyte drinks. "
                "Avoid excessive heat exposure. "
                "Eat water-rich fruits. "
                "Seek medical help if dizziness or confusion occurs."
            )
        }
        
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
        
        self.model.load_state_dict(checkpoint['model_state_dict'], strict=False)
        self.model.eval()
        print("✅ AI Brain Loaded & Ready!")

    def _encode_text(self, text):
        return [self.word2idx.get(w, self.word2idx.get("<unk>", 0)) for w in text.lower().split()]

    # --- 🧠 BALANCED LOGIC LAYER (Smarter, safer, less robot-like) ---
    def _apply_medical_logic(self, input_text, prediction):
        text = input_text.lower()
        pred = prediction.lower()

        # --------------------------------------------------
        # 0. RED-FLAG OVERRIDES (Safety First)
        # --------------------------------------------------
        if any(x in text for x in ["chest pain", "severe breath", "unable to breathe"]):
            return "bronchial asthma"

        if any(x in text for x in ["unconscious", "faint", "seizure"]):
            return "viral fever"

        # --------------------------------------------------
        # 1. SPONDYLOSIS SAFEGUARD (Fix obvious misfires)
        # --------------------------------------------------
        if "spondylosis" in pred:
            if any(x in text for x in ["fever", "temperature", "chills"]):
                return "viral fever"
            if any(x in text for x in ["vomit", "nausea", "diarrhea", "loose motion"]):
                return "stomach infection"
            if "itch" in text and "rash" in text:
                return "fungal infection"
            if "breath" in text:
                return "bronchial asthma"

        # --------------------------------------------------
        # 2. JAUNDICE LOGIC (Strict)
        # --------------------------------------------------
        if ("yellow" in text and "skin" in text) or ("yellow eyes" in text):
            if any(x in text for x in ["urine", "dark urine", "fatigue", "abdominal pain"]):
                return "jaundice"
            # If ONLY yellow skin but no other confirmation, default to jaundice but keep it loose
            return "jaundice"

        # --------------------------------------------------
        # 3. MALARIA vs VIRAL FEVER (Disambiguation)
        # --------------------------------------------------
        if "fever" in text:
            if any(x in text for x in ["shiver", "chills", "sweating cycles"]):
                return "malaria"
            if any(x in text for x in ["body ache", "headache", "weakness"]):
                return "viral fever"

        # --------------------------------------------------
        # 4. DENGUE CHECK (High Risk)
        # --------------------------------------------------
        if "fever" in text and any(x in text for x in ["platelet", "joint pain", "eye pain"]):
            return "dengue"

        # --------------------------------------------------
        # 5. ASTHMA vs INFECTION
        # --------------------------------------------------
        if any(x in text for x in ["breath", "wheezing", "tight chest"]):
            if "fever" not in text:
                return "bronchial asthma"

        # --------------------------------------------------
        # 6. STOMACH ISSUES (Layered)
        # --------------------------------------------------
        if any(x in text for x in ["vomit", "nausea", "loose motion", "diarrhea"]):
            if "fever" in text:
                return "stomach infection"
            return "food poisoning"

        # --------------------------------------------------
        # 7. HEADACHE LOGIC (Migraine vs Fever)
        # --------------------------------------------------
        if "headache" in text:
            if any(x in text for x in ["light", "noise", "dark room", "throbbing"]):
                return "migraine"
            if "fever" in text:
                return "viral fever"

        # --------------------------------------------------
        # 8. JOINT & MUSCLE LOGIC
        # --------------------------------------------------
        if any(x in text for x in ["joint pain", "swelling", "stiffness"]):
            if "morning" in text or "chronic" in text:
                return "arthritis"
            if "fever" in text:
                return "viral fever"

        # --------------------------------------------------
        # 9. FALLBACK PROTECTION
        # --------------------------------------------------
        # If model is unsure or user input is vague, trust model
        return prediction

    # --- 🗣️ CONVERSATIONAL LAYER (Makes it polite) ---
    def _format_polite_response(self, diagnosis):
        diagnosis = diagnosis.strip().lower()
        
        # Get advice or a generic fallback
        advice = self.advice_db.get(diagnosis, "Please consult a general physician for a detailed checkup.")
        
        # Capitalize for display
        display_name = diagnosis.title()

        # Templates for variety
        openers = [
            f"Based on your symptoms, it looks like you might have **{display_name}**.",
            f"I have analyzed your symptoms. The indicators point towards **{display_name}**.",
            f"It seems you are experiencing symptoms of **{display_name}**."
        ]
        
        chosen_opener = random.choice(openers)
        
        # The frontend will likely treat \n as line breaks
        return f"{chosen_opener}\n\n💡 **Dr. AI Recommends:**\n{advice}"

    def predict(self, sentence):
        try:
            # 1. Correct Spelling
            corrected = str(TextBlob(sentence).correct())
            
            # 2. Prepare for AI
            src_tokens = self._encode_text(corrected)[:MAX_LEN-2]
            sos_idx = self.word2idx.get("<sos>", 1)
            eos_idx = self.word2idx.get("<eos>", 2)
            pad_idx = self.word2idx.get("<pad>", 0)

            src_padded = [sos_idx] + src_tokens + [eos_idx] + [pad_idx] * (MAX_LEN - len(src_tokens) - 2)
            src_tensor = torch.tensor([src_padded], dtype=torch.long).to(DEVICE)
            tgt_tensor = torch.tensor([[sos_idx]], dtype=torch.long).to(DEVICE)
            
            # 3. Ask the Brain
            with torch.no_grad():
                for _ in range(MAX_LEN):
                    output = self.model(src_tensor, tgt_tensor)
                    next_token = output[0, -1].argmax(dim=-1).item()
                    if next_token == eos_idx:
                        break
                    tgt_tensor = torch.cat([tgt_tensor, torch.tensor([[next_token]], device=DEVICE)], dim=1)

            raw_prediction = " ".join([self.idx2word.get(idx, "") for idx in tgt_tensor[0].tolist()[1:]])
            
            # 4. Apply Hybrid Logic (Fix mistakes)
            final_diagnosis = self._apply_medical_logic(corrected, raw_prediction)
            
            # 5. Make it Polite (Add advice)
            polite_response = self._format_polite_response(final_diagnosis)

            return {
                "original": sentence,
                "corrected": corrected,
                "diagnosis": polite_response 
            }
            
        except Exception as e:
            return {"error": str(e)}

predictor = SymptomPredictor("symptom_transformer.pth")