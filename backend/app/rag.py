import os
import shutil
from dotenv import load_dotenv
from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain_community.vectorstores import FAISS

load_dotenv()

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_DIR = os.path.join(BASE_DIR, "faiss_db")

def process_new_pdf(file_bytes: bytes, filename: str):
    """Saves a new file, clears old data, and builds a fresh database."""
    print(f"Processing new file: {filename}...")
    
    # 1. Clear old PDF and old database to make room for the new one
    if os.path.exists(DATA_DIR):
        shutil.rmtree(DATA_DIR)
    if os.path.exists(DB_DIR):
        shutil.rmtree(DB_DIR)

    os.makedirs(DATA_DIR, exist_ok=True)

    # 2. Save the newly uploaded file
    file_path = os.path.join(DATA_DIR, filename)
    with open(file_path, "wb") as f:
        f.write(file_bytes)

    # 3. Read it and build a fresh FAISS Database
    embeddings = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001")
    
    # CRITICAL FIX: Check if it's a PDF or our Video Transcript text file!
    if filename.endswith('.pdf'):
        loader = PyPDFLoader(file_path)
    else:
        # If it's the video transcript (.txt), load it as plain text
        loader = TextLoader(file_path, encoding='utf-8')
        
    documents = loader.load()
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    chunks = text_splitter.split_documents(documents)

    vector_db = FAISS.from_documents(chunks, embeddings)
    vector_db.save_local(DB_DIR) 
    
    print("New database built successfully!")
    return True

def initialize_knowledge_base():
    """Loads the database if it exists."""
    embeddings = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001")
    if os.path.exists(os.path.join(DB_DIR, "index.faiss")):
        return FAISS.load_local(DB_DIR, embeddings, allow_dangerous_deserialization=True)
    return None  # Return nothing if no file has been processed yet!

def ask_document(question: str, language: str = "English"):
    """Searches the database and answers the question."""
    vector_db = initialize_knowledge_base()
    
    # Safety check if the user hasn't uploaded a PDF or Video yet!
    if not vector_db:
        return "I don't have a document or video to read yet! Please upload one first."
        
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0) 
    docs = vector_db.similarity_search(question, k=3)
    context = "\n\n".join([doc.page_content for doc in docs])
    
    prompt = f"""Use the following context from a document or video to answer the question. 
    If the answer is not in the context, say "I cannot answer this based on the provided material."
    
    IMPORTANT RULE: You MUST write your final answer fluently in {language}.
    
    Context:
    {context}
    
    Question: {question}
    
    Answer (in {language}):"""
    
    response = llm.invoke(prompt)
    return response.content