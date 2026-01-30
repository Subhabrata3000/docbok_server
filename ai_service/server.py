from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from ai_engine import predictor 

app = FastAPI()

class RequestData(BaseModel):
    symptom: str

@app.get("/")
def check_health():
    return {"status": "AI Online", "device": str(predictor.model.parameters().__next__().device)}

@app.post("/predict")
def predict(data: RequestData):
    if not data.symptom:
        raise HTTPException(status_code=400, detail="Empty text")
    
    result = predictor.predict(data.symptom)
    return result