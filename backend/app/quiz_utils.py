from langchain_google_genai import ChatGoogleGenerativeAI
import json

def generate_quiz_question(context: str, language: str = "English") -> str:
    """Reads the context and generates a single tough conceptual question."""
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.7)
    
    # Using standard Python f-strings avoids LangChain import errors!
    prompt = f"""
    You are an expert professor conducting a Viva Voce (oral exam).
    Based ONLY on the following context, generate ONE challenging conceptual question to test the student's understanding.
    Do NOT provide the answer. Just ask the question.
    
    IMPORTANT: Ask the question in {language}.
    
    Context:
    {context}
    """
    
    response = llm.invoke(prompt)
    return response.content.strip()

def evaluate_student_answer(question: str, student_answer: str, context: str, language: str = "English") -> dict:
    """Evaluates the user's answer and gives a score out of 10."""
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0)
    
    prompt = f"""
    You are an expert professor evaluating a student's answer in a Viva Voce.
    
    Context material: {context}
    The Question you asked: {question}
    The Student's Answer: {student_answer}
    
    Evaluate the student's answer based on the context. 
    1. Give a score out of 10.
    2. Provide constructive feedback (correcting mistakes or praising good points).
    
    Respond in EXACTLY this JSON format:
    {{"score": 8, "feedback": "Your feedback here..."}}
    
    IMPORTANT: Write the feedback in {language}.
    """
    
    response = llm.invoke(prompt)
    
    try:
        # Clean up the response in case Gemini adds markdown blocks like ```json
        clean_json = response.content.replace("```json", "").replace("```", "").strip()
        return json.loads(clean_json)
    except:
        return {"score": 0, "feedback": "Failed to parse the evaluation. Please try again."}