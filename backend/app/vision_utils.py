from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI

def analyze_image_with_vision(base64_image: str, prompt: str, language: str = "English") -> str:
    """Sends a base64 image and a prompt to Gemini for analysis."""
    
    # Strip the data URI prefix if it exists so Gemini can read the raw base64 string
    if "base64," in base64_image:
        base64_image = base64_image.split("base64,")[1]
        
    # We use gemini-2.5-flash because it is lightning fast and supports multimodal image input
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.3)
    
    message = HumanMessage(
        content=[
            {"type": "text", "text": f"{prompt}\n\nIMPORTANT: Respond fluently in {language}."},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{base64_image}"}}
        ]
    )
    
    response = llm.invoke([message])
    return response.content.strip()