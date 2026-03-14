import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, FileText, Video, Globe, Scissors, GraduationCap, ArrowRightLeft, Mic, Send, Ghost, History, Plus, Volume2, Trash2 } from "lucide-react";

// Samsung-like spring physics from your Figma design
const springConfig = { type: "spring", stiffness: 300, damping: 24 };

const defaultWelcomeMessage = { text: "👋 Hello! I am your AI Assistant. Upload a PDF, transcribe a video, or go to an Amazon/Flipkart page and click 'Compare'!", sender: 'ai' };

function App() {
  const [messages, setMessages] = useState([defaultWelcomeMessage]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [language, setLanguage] = useState('English');
  const [quizQuestion, setQuizQuestion] = useState(null);
  const [isListening, setIsListening] = useState(false);

  const [savedSessions, setSavedSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(Date.now().toString());
  const [isTemporary, setIsTemporary] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // LOAD HISTORY ON STARTUP
  useEffect(() => {
    if (window.chrome && chrome.storage) {
      chrome.storage.local.get(['savedSessions', 'targetLanguage'], (result) => {
        if (result.savedSessions) setSavedSessions(result.savedSessions);
        if (result.targetLanguage) setLanguage(result.targetLanguage);
      });
    }
  }, []);

  useEffect(() => {
    if (window.chrome && chrome.storage) chrome.storage.local.set({ targetLanguage: language });
  }, [language]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    if (isTemporary || messages.length <= 1) return;

    if (window.chrome && chrome.storage) {
      setSavedSessions(prevSessions => {
        const existingIndex = prevSessions.findIndex(s => s.id === currentSessionId);
        let newSessions = [...prevSessions];

        let previewText = messages[1]?.text;
        if (typeof previewText === 'object') previewText = "Shopping Analysis Dashboard";
        else previewText = previewText?.substring(0, 40) + '...';

        const sessionData = {
          id: currentSessionId,
          date: new Date().toLocaleString(),
          preview: previewText,
          messages: messages
        };

        if (existingIndex >= 0) newSessions[existingIndex] = sessionData;
        else newSessions = [sessionData, ...newSessions];

        chrome.storage.local.set({ savedSessions: newSessions });
        return newSessions;
      });
    }
  }, [messages, isTemporary, currentSessionId]);

  const handleNewChat = (startAsTemp = false) => {
    setMessages([defaultWelcomeMessage]);
    setCurrentSessionId(Date.now().toString());
    setIsTemporary(startAsTemp === true);
    setShowHistory(false);
    setQuizQuestion(null);
  };

  const handleToggleTemp = () => handleNewChat(!isTemporary);

  const loadSession = (session) => {
    setMessages(session.messages);
    setCurrentSessionId(session.id);
    setIsTemporary(false);
    setShowHistory(false);
    setQuizQuestion(null);
  };

  const deleteSession = (e, id) => {
    e.stopPropagation();
    const newSessions = savedSessions.filter(s => s.id !== id);
    setSavedSessions(newSessions);
    if (window.chrome && chrome.storage) chrome.storage.local.set({ savedSessions: newSessions });
    if (currentSessionId === id) handleNewChat(false);
  };

  // --- FEATURE HANDLERS ---
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsUploading(true);
    setMessages(prev => [...prev, { text: `📄 Uploading and reading "${file.name}"...`, sender: 'ai' }]);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://localhost:8000/upload', { method: 'POST', body: formData });
      if (!response.ok) throw new Error("Upload failed");
      setMessages(prev => [...prev, { text: "✅ Document successfully processed! Ask away.", sender: 'ai' }]);
    } catch (error) {
      setMessages(prev => [...prev, { text: "❌ Error: Could not upload document.", sender: 'ai' }]);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleTranscribeVideo = async () => {
    let currentUrl = "";
    try {
      if (window.chrome && chrome.tabs) {
        const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (tabs && tabs.length > 0) currentUrl = tabs[0].url;
      }
      if (!currentUrl || currentUrl.startsWith('chrome')) currentUrl = prompt("Please enter the Video URL:");
    } catch { currentUrl = prompt("Please enter the Video URL:"); }

    if (!currentUrl) return;
    setIsUploading(true);
    setMessages(prev => [...prev, { text: `🎥 Transcribing video:\n${currentUrl}\n\nThis may take a minute!`, sender: 'ai' }]);

    try {
      const response = await fetch('http://localhost:8000/transcribe-video', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ video_url: currentUrl })
      });
      if (!response.ok) throw new Error("Transcription failed.");
      setMessages(prev => [...prev, { text: "✅ Video transcribed! Ask me a question.", sender: 'ai' }]);
    } catch (error) {
      setMessages(prev => [...prev, { text: `❌ Error: ${error.message}`, sender: 'ai' }]);
    } finally { setIsUploading(false); }
  };

  const handleScrapePage = async () => {
    if (window.chrome && chrome.tabs) {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tabs && tabs.length > 0) {
        setIsUploading(true);
        setMessages(prev => [...prev, { text: "🌐 Reading webpage text...", sender: 'ai' }]);

        chrome.tabs.sendMessage(tabs[0].id, { action: "SCRAPE_WEBPAGE" }, async (response) => {
          if (!response || !response.text) {
            setMessages(prev => [...prev, { text: "❌ Refresh the page to use this feature.", sender: 'ai' }]);
            setIsUploading(false); return;
          }
          try {
            const res = await fetch('http://localhost:8000/upload-text', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: response.text, title: response.title })
            });
            if (!res.ok) throw new Error("Server Error");
            setMessages(prev => [...prev, { text: `✅ Webpage loaded! Ask away.`, sender: 'ai' }]);
          } catch {
            setMessages(prev => [...prev, { text: "❌ Error connecting to backend.", sender: 'ai' }]);
          } finally { setIsUploading(false); }
        });
      }
    }
  };

  const handleGenerateQuiz = async () => {
    setIsLoading(true);
    setMessages(prev => [...prev, { text: "🤔 Generating Viva Voce question...", sender: 'ai' }]);

    try {
      const response = await fetch('http://localhost:8000/quiz/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: "generate", target_language: language })
      });
      if (!response.ok) throw new Error("Quiz generation failed");
      const data = await response.json();
      setMessages(prev => [...prev, { text: `🎓 **VIVA VOCE:**\n\n${data.question}`, sender: 'ai' }]);
      setQuizQuestion(data.question);
    } catch {
      setMessages(prev => [...prev, { text: "❌ Ensure a document is loaded first.", sender: 'ai' }]);
    } finally { setIsLoading(false); }
  };

  const handleSnip = async () => {
    if (window.chrome && chrome.tabs) {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tabs && tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "START_SNIPPING" });
        setMessages(prev => [...prev, { text: "✂️ Snipping tool activated! Drag a box over the webpage.", sender: 'ai' }]);
      }
    }
  };

  const handleShoppingCompare = async () => {
    if (window.chrome && chrome.tabs) {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tabs && tabs.length > 0) {
        setIsLoading(true);
        setLoadingStep('Extracting product data...');

        chrome.tabs.sendMessage(tabs[0].id, { action: "SCRAPE_PRODUCT" }, async (response) => {
          if (!response || !response.name) {
            setMessages(prev => [...prev, { text: "❌ Could not find product details. Are you on a shopping site?", sender: 'ai' }]);
            setIsLoading(false); return;
          }

          try {
            setTimeout(() => setLoadingStep('Analyzing historical trends...'), 1500);
            setTimeout(() => setLoadingStep('Synthesizing final verdict...'), 3000);

            const res = await fetch('http://localhost:8000/analyze-shopping', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ product_name: response.name, product_details: response.details, target_language: language })
            });

            if (!res.ok) throw new Error("Server Error");

            const data = await res.json();
            setMessages(prev => [...prev, { text: data, isDashboard: true, sender: 'ai' }]);
          } catch (err) {
            setMessages(prev => [...prev, { text: "❌ Error generating shopping dashboard.", sender: 'ai' }]);
          } finally {
            setIsLoading(false);
            setLoadingStep('');
          }
        });
      }
    }
  };

  const speakText = (text) => {
    if (typeof text === 'object') return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const langMap = { 'English': 'en-US', 'Kannada': 'kn-IN', 'Hindi': 'hi-IN', 'Telugu': 'te-IN', 'Tamil': 'ta-IN', 'Malayalam': 'ml-IN' };
    utterance.lang = langMap[language] || 'en-US';
    window.speechSynthesis.speak(utterance);
  };

  const startListening = async () => {
    if (isListening) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMessages(prev => [...prev, { text: "❌ Voice input is not supported in this browser.", sender: 'ai' }]);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
    } catch (err) {
      if (window.chrome && chrome.tabs && window.innerWidth <= 800) {
        setMessages(prev => [...prev, { text: "⚠️ Chrome Side Panels block permission popups! Opening a secure tab... Please click the Mic there and hit 'Allow'!", sender: 'ai' }]);
        setTimeout(() => { chrome.tabs.create({ url: chrome.runtime.getURL("index.html") }); }, 3000);
        return;
      } else {
        setMessages(prev => [...prev, { text: "❌ Mic blocked! Please allow Microphone permissions.", sender: 'ai' }]);
        return;
      }
    }

    const recognition = new SpeechRecognition();
    const langMap = { 'English': 'en-US', 'Kannada': 'kn-IN', 'Hindi': 'hi-IN', 'Telugu': 'te-IN', 'Tamil': 'ta-IN', 'Malayalam': 'ml-IN' };
    recognition.lang = langMap[language] || 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => prev + (prev ? " " : "") + transcript);
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      if (event.error !== 'no-speech') {
        setMessages(prev => [...prev, { text: `❌ Mic error: ${event.error}. Please try again.`, sender: 'ai' }]);
      }
    };

    recognition.onend = () => setIsListening(false);

    try { recognition.start(); } catch (e) { setIsListening(false); }
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
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: quizQuestion, student_answer: userMsg, target_language: language })
        });
        if (!response.ok) throw new Error("Server Error");
        const data = await response.json();
        setMessages(prev => [...prev, { text: `📝 **Score: ${data.score}/10**\n\n${data.feedback}`, sender: 'ai' }]);
        setQuizQuestion(null);
      } else {
        const response = await fetch('http://localhost:8000/ask', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: userMsg, target_language: language })
        });
        if (!response.ok) throw new Error("Server Error");
        const data = await response.json();
        setMessages(prev => [...prev, { text: data.answer, sender: 'ai' }]);
      }
    } catch {
      setMessages(prev => [...prev, { text: "❌ Error connecting to backend.", sender: 'ai' }]);
    } finally { setIsLoading(false); }
  };

  // Tools mapping Native CSS layout
  const tools = [
    { icon: FileText, label: "PDF", className: "tool-pdf", onClick: () => fileInputRef.current?.click() },
    { icon: Video, label: "Video", className: "tool-video", onClick: handleTranscribeVideo },
    { icon: Globe, label: "Page", className: "tool-page", onClick: handleScrapePage },
    { icon: Scissors, label: "Snip", className: "tool-snip", onClick: handleSnip },
    { icon: GraduationCap, label: "Quiz", className: "tool-quiz", onClick: handleGenerateQuiz },
    { icon: ArrowRightLeft, label: "Compare", className: "tool-compare", onClick: handleShoppingCompare },
  ];

  const actions = [
    { icon: Ghost, label: "Temp", onClick: handleToggleTemp, active: isTemporary },
    { icon: History, label: "History", onClick: () => setShowHistory(true) },
    { icon: Plus, label: "New", onClick: () => handleNewChat(false) },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        
        * { box-sizing: border-box; }
        body, html { margin: 0; padding: 0; height: 100%; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #f8fafc; color: #1e293b; overflow: hidden;}
        
        /* Layout fixes to prevent pushing off-screen */
        .vb-container { display: flex; flex-direction: column; height: 100vh; width: 100%; max-width: 100%; position: relative; overflow: hidden; background-color: #f8fafc; }
        
        /* 1. LIQUID BACKGROUND BLOBS */
        .bg-blobs { position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
        .blob { position: absolute; border-radius: 50%; mix-blend-mode: multiply; filter: blur(60px); opacity: 0.4; animation: blobAnim 10s infinite alternate cubic-bezier(0.4, 0, 0.2, 1); }
        .blob-1 { top: -10%; left: -10%; width: 350px; height: 350px; background: #93c5fd; }
        .blob-2 { top: 20%; right: -15%; width: 350px; height: 350px; background: #c084fc; animation-delay: 2s; }
        .blob-3 { bottom: -10%; left: 10%; width: 300px; height: 300px; background: #f472b6; animation-delay: 4s; }
        @keyframes blobAnim { 0% { transform: translate(0, 0) scale(1); } 50% { transform: translate(20px, -40px) scale(1.1); } 100% { transform: translate(-20px, 20px) scale(0.9); } }

        /* 2. GLASS PANEL */
        .glass-panel { position: relative; z-index: 10; display: flex; flex-direction: column; height: 100%; width: 100%; background: rgba(255, 255, 255, 0.65); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); }
        
        /* 3. HEADER */
        .vb-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid rgba(255, 255, 255, 0.6); flex-shrink: 0; }
        .vb-title-wrapper { display: flex; align-items: center; gap: 10px; }
        .vb-icon { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #fde047, #f97316); display: flex; align-items: center; justify-content: center; box-shadow: inset 0 2px 4px rgba(0,0,0,0.1); color: white; }
        .vb-title { font-size: 18px; font-weight: 800; color: #111827; margin: 0; letter-spacing: -0.5px; }
        .vb-close { width: 32px; height: 32px; border-radius: 50%; background: rgba(0,0,0,0.05); display: flex; align-items: center; justify-content: center; border: none; cursor: pointer; color: #4b5563; transition: background 0.2s; }
        .vb-close:hover { background: rgba(0,0,0,0.1); }

        /* 4. CONTENT SCROLL AREA */
        .vb-content { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 16px 20px; display: flex; flex-direction: column; gap: 20px; scroll-behavior: smooth; }
        .vb-content::-webkit-scrollbar { width: 4px; }
        .vb-content::-webkit-scrollbar-track { background: transparent; }
        .vb-content::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 10px; }

        /* 5. TOOLS & ACTIONS */
        .vb-top-actions { display: flex; justify-content: space-between; align-items: center; background: rgba(255, 255, 255, 0.6); border-radius: 16px; padding: 6px; border: 1px solid rgba(255, 255, 255, 0.8); box-shadow: 0 2px 6px rgba(0,0,0,0.03); }
        .vb-action-btn { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px; border-radius: 12px; border: none; background: transparent; cursor: pointer; color: #4b5563; transition: background 0.2s; }
        .vb-action-btn:hover { background: rgba(255, 255, 255, 0.9); }
        .vb-action-btn.active { background: rgba(16, 185, 129, 0.15); color: #059669; }
        .vb-action-btn span { font-size: 11px; font-weight: 700; }
        .vb-lang { background: transparent; border: none; font-size: 12px; font-weight: 800; color: #374151; outline: none; cursor: pointer; padding: 0 8px; }
        .vb-divider { width: 1px; height: 24px; background: rgba(0,0,0,0.1); margin: 0 4px; }

        .vb-tools-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 12px; }
        .vb-tool-item { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 12px 8px; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.8); cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.03); }
        .vb-tool-item:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }
        .vb-tool-item span { font-size: 11px; font-weight: 700; }
        
        .tool-pdf { background: #fffbeb; color: #f59e0b; }
        .tool-video { background: #eef2ff; color: #6366f1; }
        .tool-page { background: #eff6ff; color: #3b82f6; }
        .tool-snip { background: #fff1f2; color: #f43f5e; }
        .tool-quiz { background: #faf5ff; color: #a855f7; }
        /* Adjusted Compare to perfectly span the remaining 3 slots in the 4-col grid */
        .tool-compare { background: #fff7ed; color: #f97316; grid-column: span 3; }

        /* 6. CHAT BUBBLES */
        .vb-chat-list { display: flex; flex-direction: column; gap: 16px; min-height: 120px; justify-content: flex-end; padding-bottom: 8px; }
        .vb-msg-row { display: flex; width: 100%; align-items: flex-end; }
        .vb-msg-row.user { justify-content: flex-end; }
        .vb-msg-row.ai { justify-content: flex-start; }
        
        .vb-bubble { max-width: 88%; padding: 14px 16px; font-size: 13.5px; font-weight: 500; line-height: 1.5; border-radius: 20px; position: relative; white-space: pre-wrap; }
        .vb-bubble.user { background: linear-gradient(135deg, #4f46e5, #3b82f6); color: white; border-bottom-right-radius: 4px; box-shadow: 0 8px 20px rgba(59,130,246,0.25); }
        .vb-bubble.ai { background: rgba(255, 255, 255, 0.9); border: 1px solid rgba(255, 255, 255, 1); color: #1e293b; border-bottom-left-radius: 4px; box-shadow: 0 4px 15px rgba(0,0,0,0.04); }
        .vb-tts { background: none; border: none; font-size: 16px; color: #9ca3af; cursor: pointer; padding: 6px; margin-left: 4px; transition: color 0.2s;}
        .vb-tts:hover { color: #4f46e5; }
        .wave-icon { display: inline-block; font-size: 18px; margin-right: 4px; animation: wave 2.5s infinite; transform-origin: 70% 70%; }
        @keyframes wave { 0%, 60%, 100% { transform: rotate(0deg); } 10%, 30% { transform: rotate(14deg); } 20%, 40% { transform: rotate(-8deg); } 50% { transform: rotate(10deg); } }

        /* 7. DASHBOARD */
        .vb-dash { background: rgba(255, 255, 255, 0.95); border-radius: 20px; border: 1px solid white; box-shadow: 0 8px 25px rgba(0,0,0,0.06); width: 100%; overflow: hidden; }
        .vb-dash-header { padding: 16px 20px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
        .vb-dash-label { font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
        .vb-dash-price { font-size: 24px; font-weight: 800; color: #059669; margin: 0; letter-spacing: -0.5px;}
        .vb-dash-body { padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
        .vb-dash-timing { display: flex; justify-content: space-between; align-items: center; background: rgba(248, 250, 252, 0.8); padding: 12px; border-radius: 12px; border: 1px solid #e2e8f0; }
        .vb-dash-timing-col { display: flex; flex-direction: column; gap: 2px; }
        .vb-dash-title { font-size: 13px; font-weight: 700; color: #334155; }
        .vb-dash-sub { font-size: 11px; font-weight: 600; color: #64748b; }
        .vb-dash-badge { padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 800; }
        .badge-buy { background: #d1fae5; color: #047857; border: 1px solid #a7f3d0; }
        .badge-wait { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
        .vb-dash-verdict { background: #eef2ff; padding: 16px; border-radius: 16px; border: 1px solid #e0e7ff; font-size: 13px; font-weight: 500; color: #3730a3; line-height: 1.5; }
        .vb-dash-verdict strong { display: flex; align-items: center; gap: 6px; color: #4f46e5; margin-bottom: 6px; font-size: 14px; }

        /* 8. INPUT DOCK (FIXED FLEX OVERFLOW BUG) */
        .vb-input-area { padding: 12px 20px 20px; background: rgba(255, 255, 255, 0.5); border-top: 1px solid rgba(255, 255, 255, 0.6); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); flex-shrink: 0; width: 100%; }
        .vb-quiz-alert { font-size: 10px; font-weight: 800; color: #4f46e5; text-transform: uppercase; margin-bottom: 10px; display: flex; align-items: center; gap: 6px; padding-left: 8px; letter-spacing: 0.5px;}
        .vb-input-box { display: flex; align-items: center; background: white; border-radius: 99px; padding: 6px 8px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02), 0 8px 24px rgba(0,0,0,0.06); border: 1px solid #f1f5f9; transition: box-shadow 0.2s, border-color 0.2s; width: 100%; }
        .vb-input-box:focus-within { box-shadow: inset 0 2px 4px rgba(0,0,0,0.02), 0 0 0 3px #dbeafe; border-color: #bfdbfe; }
        
        /* min-width: 0 is incredibly important here to stop input from blowing out the parent container! */
        .vb-input { flex: 1; min-width: 0; background: transparent; border: none; outline: none; padding: 8px 12px; font-size: 14px; font-weight: 500; color: #1e293b; font-family: inherit; }
        .vb-input::placeholder { color: #94a3b8; }
        
        .vb-mic { flex-shrink: 0; padding: 10px; border-radius: 50%; border: none; background: transparent; color: #94a3b8; cursor: pointer; display: flex; align-items: center; justify-content: center; position: relative; transition: color 0.2s, background 0.2s; }
        .vb-mic:hover { color: #4b5563; background: #f1f5f9; }
        .vb-mic.active { color: #ef4444; background: #fef2f2; }
        .vb-mic-ping { position: absolute; inset: 0; border-radius: 50%; border: 2px solid #ef4444; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite; }
        @keyframes ping { 75%, 100% { transform: scale(1.5); opacity: 0; } }

        /* Prevent Send button from getting squished or pushed out */
        .vb-send { flex-shrink: 0; background: #111827; color: white; padding: 10px 16px; border-radius: 99px; border: none; font-size: 13px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; margin-left: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transition: transform 0.2s, background 0.2s; }
        .vb-send:hover:not(:disabled) { background: #000; transform: translateY(-2px); }
        .vb-send:disabled { background: #94a3b8; cursor: not-allowed; box-shadow: none; transform: none; }

        /* 9. LOADER */
        .vb-loader { display: flex; gap: 6px; padding: 14px 20px; background: rgba(255, 255, 255, 0.9); border-radius: 20px; border-top-left-radius: 4px; width: fit-content; border: 1px solid white; align-items: center; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
        .vb-dot { width: 6px; height: 6px; background: #6366f1; border-radius: 50%; animation: dotBounce 1.4s infinite ease-in-out both; }
        .vb-dot:nth-child(1) { animation-delay: -0.32s; }
        .vb-dot:nth-child(2) { animation-delay: -0.16s; }
        @keyframes dotBounce { 0%, 80%, 100% { transform: scale(0.4); opacity: 0.3;} 40% { transform: scale(1); opacity: 1;} }
        .vb-loader-text { margin-left: 8px; font-size: 10px; font-weight: 800; color: #4f46e5; text-transform: uppercase; letter-spacing: 0.5px; }
        .vb-temp-alert { background: #ecfdf5; color: #059669; font-size: 11px; font-weight: 800; text-align: center; padding: 8px; border-radius: 12px; border: 1px solid #a7f3d0; margin-bottom: 12px; }

        /* 10. HISTORY OVERLAY */
        .vb-history { position: absolute; inset: 0; z-index: 50; background: rgba(255,255,255,0.95); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); display: flex; flex-direction: column; width: 100%; height: 100%; }
        .vb-hist-head { padding: 24px 20px 16px; border-bottom: 1px solid rgba(0,0,0,0.05); display: flex; justify-content: space-between; align-items: center; }
        .vb-hist-title { font-size: 18px; font-weight: 800; display: flex; align-items: center; gap: 8px; color: #1f2937; margin: 0; }
        .vb-hist-list { flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
        .vb-hist-item { background: white; padding: 16px; border-radius: 16px; border: 1px solid #f1f5f9; cursor: pointer; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 8px rgba(0,0,0,0.02); transition: transform 0.2s, box-shadow 0.2s; }
        .vb-hist-item:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.05); border-color: #e2e8f0; }
        .vb-hist-info { display: flex; flex-direction: column; gap: 4px; overflow: hidden; padding-right: 12px; }
        .vb-hist-date { font-size: 10px; font-weight: 800; color: #6366f1; text-transform: uppercase; letter-spacing: 0.5px; }
        .vb-hist-prev { font-size: 14px; font-weight: 600; color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .vb-hist-del { flex-shrink: 0; padding: 8px; border-radius: 50%; border: none; background: transparent; color: #f87171; cursor: pointer; transition: background 0.2s, color 0.2s; }
        .vb-hist-del:hover { background: #fef2f2; color: #ef4444; }
      `}</style>

      <div className="vb-container">

        {/* Animated Liquid Background Layer */}
        <div className="bg-blobs">
          <div className="blob blob-1"></div>
          <div className="blob blob-2"></div>
          <div className="blob blob-3"></div>
        </div>

        {/* Hidden File Input */}
        <input type="file" accept=".pdf" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />

        <div className="glass-panel">

          {/* Header Area */}
          <div className="vb-header">
            <div className="vb-title-wrapper">
              <div className="vb-icon"><Sparkles size={16} /></div>
              <h1 className="vb-title">Vernacular Bridge</h1>
            </div>
            <motion.button whileHover={{ scale: 1.1, rotate: 90 }} whileTap={{ scale: 0.9 }} className="vb-close" onClick={() => { if (window.close) window.close(); }}>
              <X size={16} />
            </motion.button>
          </div>

          {/* Main Scrollable Area */}
          <div className="vb-content">

            {/* Tools & Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flexShrink: 0 }}>
              <div className="vb-top-actions">
                {actions.map((action, i) => (
                  <motion.button key={i} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={action.onClick} className={`vb-action-btn ${action.active ? 'active' : ''}`}>
                    <action.icon size={16} />
                    <span>{action.label}</span>
                  </motion.button>
                ))}
                <div className="vb-divider"></div>
                <select value={language} onChange={(e) => setLanguage(e.target.value)} className="vb-lang">
                  <option value="English">EN</option>
                  <option value="Kannada">KN</option>
                  <option value="Hindi">HI</option>
                  <option value="Telugu">TE</option>
                  <option value="Tamil">TA</option>
                  <option value="Malayalam">ML</option>
                </select>
              </div>

              <motion.div variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } }} initial="hidden" animate="show" className="vb-tools-grid">
                {tools.map((tool, i) => (
                  <motion.button key={i} disabled={isUploading || isLoading} onClick={tool.onClick} variants={{ hidden: { opacity: 0, y: 10, scale: 0.5 }, show: { opacity: 1, y: 0, scale: 1, transition: springConfig } }} whileHover={{ scale: 1.05, y: -2 }} whileTap={{ scale: 0.95 }} className={`vb-tool-item ${tool.className}`}>
                    <tool.icon size={20} />
                    <span>{tool.label}</span>
                  </motion.button>
                ))}
              </motion.div>
            </div>

            {/* Chat History Render */}
            <div className="vb-chat-list">
              {isTemporary && <div className="vb-temp-alert">👻 Incognito Mode Active: Chat won't be saved.</div>}

              {messages.map((msg, index) => (
                <motion.div key={index} initial={{ opacity: 0, y: 15, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={springConfig} className={`vb-msg-row ${msg.sender}`}>

                  {/* Standard Chat Bubble */}
                  {!msg.isDashboard && (
                    <div style={{ display: 'flex', alignItems: 'flex-end', maxWidth: '100%' }}>
                      <div className={`vb-bubble ${msg.sender}`}>
                        {msg.text.toString().includes("👋 Hello!") ? (
                          <p style={{ margin: 0 }}>
                            <span className="wave-icon">👋</span>
                            Hello! I am your AI Assistant. Upload a PDF, transcribe a video, or go to an Amazon/Flipkart page and click '<strong style={{ color: '#f97316' }}>Compare</strong>'!
                          </p>
                        ) : (msg.text)}
                      </div>
                      {msg.sender === 'ai' && !msg.text.toString().includes("...") && (
                        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => speakText(msg.text)} className="vb-tts" title="Read Aloud">
                          <Volume2 size={16} />
                        </motion.button>
                      )}
                    </div>
                  )}

                  {/* Clean Glass Dashboard */}
                  {msg.isDashboard && typeof msg.text === 'object' && (
                    <div className="vb-dash">
                      <div className="vb-dash-header">
                        <span className="vb-dash-label">Best Global Price</span>
                        <h3 className="vb-dash-price">{msg.text.lowest_price}</h3>
                      </div>
                      <div className="vb-dash-body">
                        <div className="vb-dash-timing">
                          <div className="vb-dash-timing-col">
                            <span className="vb-dash-title">Market Timing</span>
                            <span className="vb-dash-sub">Avg: {msg.text.historical_average}</span>
                          </div>
                          <span className={`vb-dash-badge ${msg.text.timing_indicator === 'Buy Now' ? 'badge-buy' : 'badge-wait'}`}>
                            {msg.text.timing_indicator}
                          </span>
                        </div>
                        <div className="vb-dash-verdict">
                          <strong><Sparkles size={14} /> AI Verdict</strong>
                          {msg.text.verdict}
                        </div>
                      </div>
                    </div>
                  )}

                </motion.div>
              ))}

              {isLoading && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="vb-msg-row ai">
                  <div className="vb-loader">
                    <div className="vb-dot"></div><div className="vb-dot"></div><div className="vb-dot"></div>
                    {loadingStep && <span className="vb-loader-text">{loadingStep}</span>}
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input Dock */}
          <div className="vb-input-area">
            {quizQuestion && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="vb-quiz-alert">
                <GraduationCap size={12} /> Quiz Mode Active
              </motion.div>
            )}
            <div className="vb-input-box">
              <input
                type="text"
                className="vb-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                placeholder={isListening ? "Listening..." : (quizQuestion ? "Type your answer..." : "Ask me anything...")}
                disabled={isLoading || isUploading}
              />
              <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={startListening} disabled={isLoading || isUploading || isListening} className={`vb-mic ${isListening ? 'active' : ''}`}>
                {isListening && <div className="vb-mic-ping"></div>}
                <Mic size={20} />
              </motion.button>
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={sendMessage} disabled={isLoading || isUploading || !input.trim()} className="vb-send">
                Send <Send size={14} />
              </motion.button>
            </div>
          </div>
        </div>

        {/* History Panel Layer */}
        <AnimatePresence>
          {showHistory && (
            <motion.div initial={{ x: '100%', opacity: 0.5 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '100%', opacity: 0 }} transition={{ type: "spring", damping: 25, stiffness: 200 }} className="vb-history">
              <div className="vb-hist-head">
                <h3 className="vb-hist-title"><History size={20} color="#6366f1" /> Chat History</h3>
                <motion.button whileHover={{ scale: 1.1, backgroundColor: "#f3f4f6" }} whileTap={{ scale: 0.9 }} onClick={() => setShowHistory(false)} className="vb-close">
                  <X size={18} color="#4b5563" />
                </motion.button>
              </div>

              <div className="vb-hist-list">
                {savedSessions.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', gap: '16px' }}>
                    <History size={48} opacity={0.2} />
                    <span style={{ fontSize: '14px', fontWeight: '600' }}>No saved chats yet.</span>
                  </div>
                ) : (
                  savedSessions.map((session, idx) => (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} key={session.id} onClick={() => loadSession(session)} className="vb-hist-item">
                      <div className="vb-hist-info">
                        <span className="vb-hist-date">{session.date}</span>
                        <span className="vb-hist-prev">{session.preview}</span>
                      </div>
                      <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={(e) => deleteSession(e, session.id)} className="vb-hist-del">
                        <Trash2 size={16} />
                      </motion.button>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

export default App;