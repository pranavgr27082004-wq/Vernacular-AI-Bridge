from pydantic import BaseModel
from typing import List, Optional

class QueryRequest(BaseModel):
    """What we expect to receive from the Chrome Extension."""
    question: str
    target_language: str = "English"  # Changed from boolean to string!

class QueryResponse(BaseModel):
    """What we will send back to the Chrome Extension."""
    answer: str
    source_documents: Optional[List[str]] = []