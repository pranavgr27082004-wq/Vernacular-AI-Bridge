import { useState, useRef, useEffect } from 'react'

function App() {
  const [messages, setMessages] = useState([
    { text: "👋 Hello! Upload a PDF or click 'Transcribe Video' to process the current LMS lesson.", sender: 'ai' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [language, setLanguage] = useState('English');
  const [quizQuestion, setQuizQuestion] = useState(null); // NEW: Tracks if we are answering a quiz
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle PDF Uploads
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsUploading(true);
    setMessages(prev => [...prev, { text: `📄 Uploading and reading "${file.name}"...`, sender: 'ai' }]);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://localhost:8000/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error("Upload failed");
      setMessages(prev => [...prev, { text: "✅ Document successfully processed! What would you like to know about it?", sender: 'ai' }]);
    } catch (error) {
      setMessages(prev => [...prev, { text: "❌ Error: Could not upload the document. Is your Python server running?", sender: 'ai' }]);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // NEW: Handle Video Transcription
  const handleTranscribeVideo = async () => {
    let currentUrl = "";
    try {
      // Try to automatically grab the current Chrome tab URL
      if (window.chrome && chrome.tabs) {
        // Use lastFocusedWindow so it grabs the actual webpage, not the side panel itself
        const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (tabs && tabs.length > 0) {
          currentUrl = tabs[0].url;
        }
      }

      // If it failed or grabbed a chrome:// URL, ask the user manually
      if (!currentUrl || currentUrl.startsWith('chrome')) {
        currentUrl = prompt("Please enter the Video URL (e.g., YouTube link):");
      }
    } catch (error) {
      currentUrl = prompt("Please enter the Video URL (e.g., YouTube link):");
    }

    if (!currentUrl) return;

    setIsUploading(true);
    setMessages(prev => [...prev, { text: `🎥 Downloading and transcribing video from:\n${currentUrl}\n\nThis may take a minute or two!`, sender: 'ai' }]);

    try {
      const response = await fetch('http://localhost:8000/transcribe-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_url: currentUrl })
      });

      if (!response.ok) {
        // Extract the exact error message from FastAPI so we can see it in the UI!
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Transcription failed due to a server error.");
      }

      setMessages(prev => [...prev, { text: "✅ Video transcribed and added to knowledge base! Ask me a question or start a quiz.", sender: 'ai' }]);
    } catch (error) {
      setMessages(prev => [...prev, { text: `❌ Error: ${error.message}\n\nPlease check the Python terminal for more details.`, sender: 'ai' }]);
    } finally {
      setIsUploading(false);
    }
  };

  // NEW: Handle Generating a Viva Voce Quiz
  const handleGenerateQuiz = async () => {
    setIsLoading(true);
    setMessages(prev => [...prev, { text: "🤔 Generating a challenging Viva Voce question...", sender: 'ai' }]);

    try {
      const response = await fetch('http://localhost:8000/quiz/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: "generate", target_language: language })
      });

      if (!response.ok) throw new Error("Quiz generation failed");

      const data = await response.json();
      setMessages(prev => [...prev, { text: `🎓 **VIVA VOCE:**\n\n${data.question}`, sender: 'ai' }]);
      setQuizQuestion(data.question); // Lock into quiz mode
    } catch (error) {
      setMessages(prev => [...prev, { text: "❌ Error: Could not generate quiz. Make sure a document is loaded.", sender: 'ai' }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Modified to handle both Normal Questions AND Quiz Answers
  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMsg = input.trim();
    setMessages(prev => [...prev, { text: userMsg, sender: 'user' }]);
    setInput('');
    setIsLoading(true);

    try {
      if (quizQuestion) {
        // We are answering a Quiz!
        const response = await fetch('http://localhost:8000/quiz/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: quizQuestion, student_answer: userMsg, target_language: language })
        });

        if (!response.ok) throw new Error("Server Error");
        const data = await response.json();

        setMessages(prev => [...prev, { text: `📝 **Score: ${data.score}/10**\n\n${data.feedback}`, sender: 'ai' }]);
        setQuizQuestion(null); // Exit quiz mode so user can ask normal questions again
      } else {
        // Normal RAG Question
        const response = await fetch('http://localhost:8000/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: userMsg, target_language: language })
        });

        if (!response.ok) throw new Error("Server Error");
        const data = await response.json();
        setMessages(prev => [...prev, { text: data.answer, sender: 'ai' }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { text: "❌ Error: Could not connect to the backend.", sender: 'ai' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body, html { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; height: 100%; background-color: #f3f4f6; }
        #root { height: 100vh; display: flex; flex-direction: column; }

        .chat-container { display: flex; flex-direction: column; height: 100%; }
        .chat-header { background: #4f46e5; color: white; padding: 15px; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); z-index: 10; }
        .header-top { display: flex; justify-content: space-between; align-items: center; }
        .chat-header h2 { margin: 0; font-size: 1.1rem; }

        /* Updated Action Buttons layout */
        .controls-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; width: 100%; }
        
        .action-btn { background: white; color: #4f46e5; border: none; padding: 6px 10px; border-radius: 6px; font-weight: bold; font-size: 0.8rem; cursor: pointer; transition: background 0.2s; display: flex; align-items: center; justify-content: center; gap: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.2); flex: 1; }
        .action-btn:hover:not(:disabled) { background: #e0e7ff; }
        .action-btn:disabled { background: #c7d2fe; color: white; cursor: not-allowed; }

        .language-selector select { padding: 6px 5px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.3); outline: none; background: rgba(255,255,255,0.15); color: white; font-weight: bold; cursor: pointer; font-size: 0.85rem;}
        .language-selector select option { color: #1f2937; background: white; }

        .chat-messages { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 12px; }
        .message-wrapper { display: flex; width: 100%; }
        .message-wrapper.user { justify-content: flex-end; }
        .message-wrapper.ai { justify-content: flex-start; }
        .message-bubble { max-width: 85%; padding: 12px 16px; border-radius: 18px; line-height: 1.4; font-size: 0.95rem; word-wrap: break-word; white-space: pre-wrap; }
        .user .message-bubble { background: #4f46e5; color: white; border-bottom-right-radius: 4px; }
        .ai .message-bubble { background: white; color: #1f2937; border-bottom-left-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.1); border: 1px solid #e5e7eb; }

        .chat-input-area { padding: 15px; background: white; border-top: 1px solid #e5e7eb; display: flex; gap: 10px; flex-direction: column;}
        .quiz-indicator { font-size: 0.8rem; color: #4f46e5; font-weight: bold; padding-left: 5px; }
        .input-row { display: flex; gap: 10px; }
        .chat-input-area input { flex: 1; padding: 12px; border: 1px solid #d1d5db; border-radius: 24px; outline: none; font-size: 0.95rem; }
        .chat-input-area button { background: #4f46e5; color: white; border: none; padding: 0 20px; border-radius: 24px; font-weight: bold; cursor: pointer; }
        .chat-input-area button:disabled { background: #a5b4fc; cursor: not-allowed; }

        .loading .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #9ca3af; margin: 0 2px; animation: bounce 1.4s infinite ease-in-out both; }
        .loading .dot:nth-child(1) { animation-delay: -0.32s; }
        .loading .dot:nth-child(2) { animation-delay: -0.16s; }
        @keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }
      `}</style>
      <div className="chat-container">
        <header className="chat-header">
          <div className="header-top">
            <h2>✨ Vernacular Bridge</h2>
          </div>

          <div className="controls-row">
            <input
              type="file"
              accept=".pdf"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
            <button className="action-btn" onClick={() => fileInputRef.current.click()} disabled={isUploading || isLoading}>
              📁 PDF
            </button>
            <button className="action-btn" onClick={handleTranscribeVideo} disabled={isUploading || isLoading}>
              🎥 Video
            </button>
            <button className="action-btn" onClick={handleGenerateQuiz} disabled={isUploading || isLoading || !!quizQuestion}>
              🎓 Quiz
            </button>

            <div className="language-selector">
              <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="English">EN</option>
                <option value="Kannada">ಕನ್ನಡ</option>
                <option value="Hindi">हिंदी</option>
                <option value="Telugu">తెలుగు</option>
                <option value="Tamil">தமிழ்</option>
                <option value="Malayalam">മല</option>
              </select>
            </div>
          </div>
        </header>

        <main className="chat-messages">
          {messages.map((msg, index) => (
            <div key={index} className={`message-wrapper ${msg.sender}`}>
              <div className="message-bubble">
                {msg.text}
              </div>
            </div>
          ))}

          {(isLoading || isUploading) && (
            <div className="message-wrapper ai">
              <div className="message-bubble loading">
                <span className="dot"></span><span className="dot"></span><span className="dot"></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </main>

        <footer className="chat-input-area">
          {quizQuestion && <div className="quiz-indicator">✏️ Quiz Mode Active: Type your answer below</div>}
          <div className="input-row">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder={quizQuestion ? "Type your answer..." : "Ask a question..."}
              disabled={isLoading || isUploading}
            />
            <button onClick={sendMessage} disabled={isLoading || isUploading || !input.trim()}>
              Send
            </button>
          </div>
        </footer>
      </div>
    </>
  )
}

export default App