from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Any
from dotenv import load_dotenv

load_dotenv()

from .models import QueryRequest, QueryResponse
from .rag import ask_document, process_new_pdf, initialize_knowledge_base
from .audio_utils import download_audio_from_video, transcribe_audio
from .quiz_utils import generate_quiz_question, evaluate_student_answer
from .vision_utils import analyze_image_with_vision
from .shopping_utils import analyze_product_shopping

app = FastAPI(title="Vernacular AI Bridge API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Data Models ---
class VideoRequest(BaseModel):
    video_url: str

class QuizEvalRequest(BaseModel):
    question: str
    student_answer: str
    target_language: str = "English"

class VisionRequest(BaseModel):
    base64_image: str
    prompt: str
    target_language: str = "English"

class ScrapeRequest(BaseModel):
    text: str
    title: str

# CRITICAL FIX: Use 'Any' to completely prevent Pydantic 422 errors from complex E-Commerce arrays/objects
class ShoppingRequest(BaseModel):
    product_name: Any = None
    product_details: Any = None
    target_language: Any = "English"

# --- Endpoints ---
@app.get("/")
def read_root():
    return {"message": "Server is running with Shopping Concierge active!"}

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        process_new_pdf(contents, file.filename)
        return {"message": f"Successfully processed {file.filename}!"}
    except Exception as e:
        return {"error": str(e)}

@app.post("/upload-text")
def process_scraped_text(request: ScrapeRequest):
    try:
        file_bytes = request.text.encode('utf-8')
        safe_title = "".join([c for c in request.title if c.isalnum() or c==' ']).rstrip()
        filename = f"{safe_title.replace(' ', '_')[:30]}.txt" if safe_title else "webpage.txt"
        process_new_pdf(file_bytes, filename)
        return {"message": f"Successfully processed webpage: {request.title}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ask", response_model=QueryResponse)
def ask_question(request: QueryRequest):
    ai_answer = ask_document(request.question, request.target_language)
    return QueryResponse(answer=ai_answer, source_documents=[])

@app.post("/transcribe-video")
def process_video(request: VideoRequest):
    try:
        audio_path = download_audio_from_video(request.video_url)
        transcript_text = transcribe_audio(audio_path)
        file_bytes = transcript_text.encode('utf-8')
        process_new_pdf(file_bytes, "video_transcript.txt")
        return {"message": "Video transcribed successfully!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/quiz/generate")
def get_quiz_question(request: QueryRequest):
    vector_db = initialize_knowledge_base()
    if not vector_db:
        return {"question": "Please upload a document or transcribe a video first!"}
    
    docs = vector_db.similarity_search("core concepts", k=2)
    context = "\n".join([doc.page_content for doc in docs])
    question = generate_quiz_question(context, request.target_language)
    return {"question": question}

@app.post("/quiz/evaluate")
def evaluate_quiz(request: QuizEvalRequest):
    vector_db = initialize_knowledge_base()
    if not vector_db:
        return {"score": 0, "feedback": "No active database found."}
    
    docs = vector_db.similarity_search(request.question, k=3)
    context = "\n".join([doc.page_content for doc in docs])
    evaluation = evaluate_student_answer(
        question=request.question, 
        student_answer=request.student_answer, 
        context=context,
        language=request.target_language
    )
    return evaluation

@app.post("/analyze-vision")
def analyze_vision(request: VisionRequest):
    try:
        answer = analyze_image_with_vision(
            request.base64_image, 
            request.prompt, 
            request.target_language
        )
        return {"answer": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze-shopping")
def analyze_shopping(request: ShoppingRequest):
    try:
        # Safely cast whatever complex object Flipkart/Amazon sent into a basic string
        name = str(request.product_name) if request.product_name else "Unknown Product"
        details = str(request.product_details) if request.product_details else ""
        lang = str(request.target_language) if request.target_language else "English"
        
        # Truncate details to prevent LLM context overload (Amazon sends MASSIVE metadata)
        details = details[:3000]
        
        dashboard_data = analyze_product_shopping(name, details, lang)
        return dashboard_data
    except Exception as e:
        print(f"❌ Shopping Analysis Error: {str(e)}")
        # FAIL-SAFE: Return a valid dashboard object showing the error, so the UI never crashes!
        return {
            "best_platform": "System Error",
            "lowest_price": "N/A",
            "historical_average": "N/A",
            "timing_indicator": "Wait",
            "competitors": [],
            "verdict": f"Backend Error: {str(e)}. Try refreshing the page and checking the Python terminal."
        }