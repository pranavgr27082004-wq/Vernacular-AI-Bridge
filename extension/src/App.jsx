import { useState, useRef, useEffect } from 'react'

const defaultWelcomeMessage = { text: "👋 Hello! I am ready to help. Your chats are now auto-saved! Click '🕒 History' to view them, or '👻 Temp' for a private unsaved chat.", sender: 'ai' };

function App() {
  const [messages, setMessages] = useState([defaultWelcomeMessage]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [language, setLanguage] = useState('English');
  const [quizQuestion, setQuizQuestion] = useState(null);

  // NEW STATE: Memory & Session Management
  const [savedSessions, setSavedSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(Date.now().toString());
  const [isTemporary, setIsTemporary] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // LOAD HISTORY ON STARTUP
  // Notice we only load the list of sessions, we DO NOT load them onto the screen. It starts fresh!
  useEffect(() => {
    if (window.chrome && chrome.storage) {
      chrome.storage.local.get(['savedSessions', 'targetLanguage'], (result) => {
        if (result.savedSessions) {
          setSavedSessions(result.savedSessions);
        }
        if (result.targetLanguage) {
          setLanguage(result.targetLanguage);
        }
      });
    }
  }, []);

  // SAVE LANGUAGE PREFERENCE
  useEffect(() => {
    if (window.chrome && chrome.storage) {
      chrome.storage.local.set({ targetLanguage: language });
    }
  }, [language]);

  // AUTO-SAVE CURRENT SESSION
  // Every time messages update, we save the active session (unless it's temporary!)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

    // Don't save if in Ghost mode, or if it's just the default welcome message
    if (isTemporary || messages.length <= 1) return;

    if (window.chrome && chrome.storage) {
      setSavedSessions(prevSessions => {
        const existingIndex = prevSessions.findIndex(s => s.id === currentSessionId);
        let newSessions = [...prevSessions];

        const sessionData = {
          id: currentSessionId,
          date: new Date().toLocaleString(),
          // Use the user's first question as the title of the chat
          preview: messages[1]?.text?.substring(0, 40) + '...',
          messages: messages
        };

        if (existingIndex >= 0) {
          newSessions[existingIndex] = sessionData; // Update existing
        } else {
          newSessions = [sessionData, ...newSessions]; // Add to top of history
        }

        chrome.storage.local.set({ savedSessions: newSessions });
        return newSessions;
      });
    }
  }, [messages, isTemporary, currentSessionId]);

  // SESSION CONTROLS
  const handleNewChat = (startAsTemp = false) => {
    setMessages([defaultWelcomeMessage]);
    setCurrentSessionId(Date.now().toString());
    setIsTemporary(startAsTemp === true);
    setShowHistory(false);
    setQuizQuestion(null);
  };

  const handleToggleTemp = () => {
    // Toggling modes always starts a fresh chat to prevent accidental saving
    handleNewChat(!isTemporary);
  };

  const loadSession = (session) => {
    setMessages(session.messages);
    setCurrentSessionId(session.id);
    setIsTemporary(false); // Loading history means it's not a temp chat
    setShowHistory(false);
    setQuizQuestion(null);
  };

  const deleteSession = (e, id) => {
    e.stopPropagation(); // Prevents loading the session when clicking delete
    const newSessions = savedSessions.filter(s => s.id !== id);
    setSavedSessions(newSessions);

    if (window.chrome && chrome.storage) {
      chrome.storage.local.set({ savedSessions: newSessions });
    }

    if (currentSessionId === id) {
      handleNewChat(false); // If they delete the active chat, clear the screen
    }
  };


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

  // Handle Video Transcription
  const handleTranscribeVideo = async () => {
    let currentUrl = "";
    try {
      if (window.chrome && chrome.tabs) {
        const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (tabs && tabs.length > 0) {
          currentUrl = tabs[0].url;
        }
      }
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

  // Handle Context-Aware Web Scraping
  const handleScrapePage = async () => {
    if (window.chrome && chrome.tabs) {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tabs && tabs.length > 0) {
        setIsUploading(true);
        setMessages(prev => [...prev, { text: "🌐 Reading the text on this webpage...", sender: 'ai' }]);

        chrome.tabs.sendMessage(tabs[0].id, { action: "SCRAPE_WEBPAGE" }, async (response) => {
          if (chrome.runtime.lastError || !response || !response.text) {
            setMessages(prev => [...prev, { text: "❌ Error: Could not read this webpage. Make sure you refresh the webpage first!", sender: 'ai' }]);
            setIsUploading(false);
            return;
          }

          try {
            const res = await fetch('http://localhost:8000/upload-text', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: response.text, title: response.title })
            });

            if (!res.ok) throw new Error("Server Error");
            setMessages(prev => [...prev, { text: `✅ Webpage "${response.title}" successfully loaded! Ask me anything about it.`, sender: 'ai' }]);
          } catch (error) {
            setMessages(prev => [...prev, { text: "❌ Error connecting to the Python backend. Is it running?", sender: 'ai' }]);
          } finally {
            setIsUploading(false);
          }
        });
      }
    } else {
      alert("This feature only works inside the Chrome Extension!");
    }
  };

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
      setQuizQuestion(data.question);
    } catch (error) {
      setMessages(prev => [...prev, { text: "❌ Error: Could not generate quiz. Make sure a document is loaded.", sender: 'ai' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSnip = async () => {
    if (window.chrome && chrome.tabs) {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tabs && tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "START_SNIPPING" });
        setMessages(prev => [...prev, { text: "✂️ Snipping tool activated! Drag a box over the webpage to capture an image.", sender: 'ai' }]);
      }
    } else {
      alert("This feature only works inside the Chrome Extension!");
    }
  };

  const speakText = (textToRead) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(textToRead);

    const langMap = {
      'English': 'en-US',
      'Kannada': 'kn-IN',
      'Hindi': 'hi-IN',
      'Telugu': 'te-IN',
      'Tamil': 'ta-IN',
      'Malayalam': 'ml-IN'
    };
    utterance.lang = langMap[language] || 'en-US';
    window.speechSynthesis.speak(utterance);
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMsg = input.trim();
    setMessages(prev => [...prev, { text: userMsg, sender: 'user' }]);
    setInput('');
    setIsLoading(true);

    try {
      if (quizQuestion) {
        const response = await fetch('http://localhost:8000/quiz/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: quizQuestion, student_answer: userMsg, target_language: language })
        });

        if (!response.ok) throw new Error("Server Error");
        const data = await response.json();

        setMessages(prev => [...prev, { text: `📝 **Score: ${data.score}/10**\n\n${data.feedback}`, sender: 'ai' }]);
        setQuizQuestion(null);
      } else {
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
        body, html { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; height: 100%; background-color: #f3f4f6; overflow: hidden; }
        #root { height: 100vh; display: flex; flex-direction: column; position: relative; }

        .chat-container { display: flex; flex-direction: column; height: 100%; }
        
        .chat-header { background: #4f46e5; color: white; padding: 15px; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); z-index: 10; }
        .header-top { display: flex; justify-content: space-between; align-items: center; }
        .header-top h2 { margin: 0; font-size: 1.1rem; }
        
        .top-controls { display: flex; gap: 6px; }
        .top-btn { background: rgba(255,255,255,0.2); border: none; color: white; padding: 4px 10px; border-radius: 4px; font-size: 0.8rem; cursor: pointer; font-weight: bold; transition: background 0.2s; }
        .top-btn:hover { background: rgba(255,255,255,0.3); }
        .top-btn.temp-active { background: #10b981; color: white; } /* Green when Temp mode is ON */

        .controls-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; width: 100%; justify-content: space-between; }
        .action-btn { background: white; color: #4f46e5; border: none; padding: 6px 10px; border-radius: 6px; font-weight: bold; font-size: 0.8rem; cursor: pointer; transition: background 0.2s; display: flex; align-items: center; justify-content: center; gap: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.2); flex: 1; }
        .action-btn:hover:not(:disabled) { background: #e0e7ff; }
        .action-btn:disabled { background: #c7d2fe; color: white; cursor: not-allowed; }

        .language-selector select { padding: 6px 5px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.3); outline: none; background: rgba(255,255,255,0.15); color: white; font-weight: bold; cursor: pointer; font-size: 0.85rem;}
        .language-selector select option { color: #1f2937; background: white; }

        /* The active chat window */
        .chat-messages { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 12px; }
        .temp-warning { text-align: center; color: #10b981; font-size: 0.8rem; font-weight: bold; margin-bottom: 10px; }
        .message-wrapper { display: flex; width: 100%; }
        .message-wrapper.user { justify-content: flex-end; }
        .message-wrapper.ai { justify-content: flex-start; }
        .message-bubble { max-width: 85%; padding: 12px 16px; border-radius: 18px; line-height: 1.4; font-size: 0.95rem; word-wrap: break-word; white-space: pre-wrap; position: relative; }
        .user .message-bubble { background: #4f46e5; color: white; border-bottom-right-radius: 4px; }
        .ai .message-bubble { background: white; color: #1f2937; border-bottom-left-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.1); border: 1px solid #e5e7eb; }

        .tts-btn { background: none; border: none; font-size: 1.1rem; cursor: pointer; padding: 0 0 0 8px; vertical-align: bottom; transition: transform 0.2s; opacity: 0.7; }
        .tts-btn:hover { transform: scale(1.2); opacity: 1; }

        /* History Overlay Panel */
        .history-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: white; z-index: 20; display: flex; flex-direction: column; }
        .history-header { padding: 15px; background: #f3f4f6; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; }
        .history-header h3 { margin: 0; color: #1f2937; font-size: 1.1rem; }
        .close-history { background: #ef4444; color: white; border: none; border-radius: 4px; padding: 6px 12px; cursor: pointer; font-weight: bold; }
        .history-list { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
        .history-item { padding: 15px; border: 1px solid #e5e7eb; border-radius: 8px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background 0.2s; background: white; }
        .history-item:hover { background: #f9fafb; border-color: #d1d5db; }
        .history-item-info { display: flex; flex-direction: column; gap: 6px; flex: 1; overflow: hidden; }
        .history-date { font-size: 0.75rem; color: #6b7280; font-weight: bold; }
        .history-preview { font-size: 0.95rem; color: #1f2937; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .delete-btn { background: #ef4444; color: white; border: none; border-radius: 4px; padding: 6px 10px; cursor: pointer; font-size: 0.8rem; margin-left: 10px; font-weight: bold; }
        .delete-btn:hover { background: #dc2626; }
        .no-history { text-align: center; color: #6b7280; margin-top: 50px; }

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
            <div className="top-controls">
              <button className={`top-btn ${isTemporary ? 'temp-active' : ''}`} onClick={handleToggleTemp} title="Toggle Temporary/Ghost Chat">
                {isTemporary ? '👻 Temp ON' : '👻 Temp OFF'}
              </button>
              <button className="top-btn" onClick={() => setShowHistory(true)}>
                🕒 History
              </button>
              <button className="top-btn" onClick={() => handleNewChat(false)}>
                ➕ New
              </button>
            </div>
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
            <button className="action-btn" onClick={handleScrapePage} disabled={isUploading || isLoading}>
              🌐 Page
            </button>
            <button className="action-btn" onClick={handleSnip} disabled={isUploading || isLoading}>
              ✂️ Snip
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
                <option value="Malayalam">മലയാളം</option>
              </select>
            </div>
          </div>
        </header>

        <main className="chat-messages">
          {isTemporary && <div className="temp-warning">👻 Temporary Mode Active: This conversation will NOT be saved to History.</div>}

          {messages.map((msg, index) => (
            <div key={index} className={`message-wrapper ${msg.sender}`}>
              <div className="message-bubble">
                {msg.text}

                {msg.sender === 'ai' && !msg.text.includes("...") && (
                  <button
                    className="tts-btn"
                    onClick={() => speakText(msg.text)}
                    title="Read Aloud"
                  >
                    🔊
                  </button>
                )}
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

      {/* FULL SCREEN HISTORY OVERLAY */}
      {showHistory && (
        <div className="history-overlay">
          <div className="history-header">
            <h3>🕒 Chat History</h3>
            <button className="close-history" onClick={() => setShowHistory(false)}>Close</button>
          </div>
          <div className="history-list">
            {savedSessions.length === 0 ? (
              <div className="no-history">No saved chats yet. Start asking questions!</div>
            ) : (
              savedSessions.map(session => (
                <div key={session.id} className="history-item" onClick={() => loadSession(session)}>
                  <div className="history-item-info">
                    <span className="history-date">{session.date}</span>
                    <span className="history-preview">"{session.preview}"</span>
                  </div>
                  <button className="delete-btn" onClick={(e) => deleteSession(e, session.id)} title="Delete Chat">
                    🗑️
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default App