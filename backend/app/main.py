from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from .models import QueryRequest, QueryResponse
from .rag import ask_document, process_new_pdf, initialize_knowledge_base
from .audio_utils import download_audio_from_video, transcribe_audio
from .quiz_utils import generate_quiz_question, evaluate_student_answer
from .vision_utils import analyze_image_with_vision

app = FastAPI(title="Vernacular AI Bridge API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Models ---
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

# --- Base Endpoints ---
@app.get("/")
def read_root():
    return {"message": "Server is running with Vision active!"}

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
    """Saves scraped webpage text as a .txt file and builds the vector DB."""
    try:
        file_bytes = request.text.encode('utf-8')
        
        # Clean up the title to make a safe filename
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

# --- Video Context Extraction ---
@app.post("/transcribe-video")
def process_video(request: VideoRequest):
    """Downloads a video, transcribes it, and saves the text into our FAISS database."""
    try:
        audio_path = download_audio_from_video(request.video_url)
        transcript_text = transcribe_audio(audio_path)
        
        file_bytes = transcript_text.encode('utf-8')
        process_new_pdf(file_bytes, "video_transcript.txt")
        
        return {"message": "Video transcribed successfully!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- AI Viva Voce ---
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

# --- Vision Context (Circle to Search) ---
@app.post("/analyze-vision")
def analyze_vision(request: VisionRequest):
    """Processes the cropped base64 image and answers the user's prompt."""
    try:
        answer = analyze_image_with_vision(
            request.base64_image, 
            request.prompt, 
            request.target_language
        )
        return {"answer": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))