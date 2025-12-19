import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, RefreshCw, Play, AlertTriangle, MessageSquare, Send, Clock, X, Pause, CheckCircle2, Home, Settings, LogOut, User } from 'lucide-react';
import { signInWithPopup, signOut } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, googleProvider, db } from './firebase'; // Ensure this points to your firebase.js

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const MOODS = {
  Anxious: { 
    gradient: 'from-indigo-900 via-indigo-800 to-purple-900',
    accentColor: 'bg-indigo-500',
    borderColor: 'border-indigo-400',
    textColor: 'text-indigo-100',
    icon: '🌊',
    ambiance: 'Calm waves wash over you'
  },
  Overwhelmed: { 
    gradient: 'from-slate-900 via-slate-800 to-gray-900',
    accentColor: 'bg-slate-500',
    borderColor: 'border-slate-400',
    textColor: 'text-slate-100',
    icon: '⚡',
    ambiance: 'Ground yourself in this moment'
  },
  Low: { 
    gradient: 'from-stone-900 via-stone-800 to-neutral-900',
    accentColor: 'bg-amber-500',
    borderColor: 'border-amber-400',
    textColor: 'text-amber-100',
    icon: '🍂',
    ambiance: 'Gentle warmth surrounds you'
  },
  Sad: { 
    gradient: 'from-gray-900 via-slate-900 to-zinc-900',
    accentColor: 'bg-blue-400',
    borderColor: 'border-blue-300',
    textColor: 'text-blue-100',
    icon: '🌧️',
    ambiance: 'You are held and supported'
  },
  Energized: { 
    gradient: 'from-orange-600 via-red-500 to-pink-600',
    accentColor: 'bg-yellow-400',
    borderColor: 'border-yellow-300',
    textColor: 'text-yellow-100',
    icon: '🔥',
    ambiance: 'Channel your vibrant energy'
  },
  Calm: { 
    gradient: 'from-teal-800 via-cyan-700 to-blue-800',
    accentColor: 'bg-teal-400',
    borderColor: 'border-teal-300',
    textColor: 'text-teal-100',
    icon: '🌿',
    ambiance: 'Peace flows through you'
  },
  Focused: { 
    gradient: 'from-violet-900 via-purple-800 to-fuchsia-900',
    accentColor: 'bg-purple-400',
    borderColor: 'border-purple-300',
    textColor: 'text-purple-100',
    icon: '🎯',
    ambiance: 'Clarity sharpens your mind'
  }
};

const RITUALS = {
  Anxious: { title: "4-7-8 Breathing", steps: ["Sit comfortably", "Inhale through nose (4s)", "Hold breath (7s)", "Exhale slowly (8s)", "Repeat 4 times"] },
  Overwhelmed: { title: "5-4-3-2-1 Grounding", steps: ["Observe your space", "5 things you see", "4 things you touch", "3 sounds you hear", "2 things you smell"] },
  Low: { title: "Sunlight Visualization", steps: ["Close your eyes", "Imagine golden light", "Feel it on your forehead", "Let warmth fill your chest", "Breathe in the energy"] },
  Sad: { title: "Self-Compassion", steps: ["Hand on heart", "Feel your heartbeat", "Take 3 deep breaths", "Say: 'I'm doing my best'", "Say: 'I deserve peace'"] },
  Energized: { title: "Channel Energy", steps: ["Stand and stretch", "Shake it out", "Pick ONE task", "Set 25-min timer", "Begin with intention"] },
  Calm: { title: "Gratitude Moment", steps: ["Notice this peace", "Think of someone special", "Send silent thanks", "Feel the connection", "Smile softly"] },
  Focused: { title: "Deep Work Ritual", steps: ["Silence notifications", "Close extra tabs", "Write your goal", "One centering breath", "Begin focused work"] }
};

const useStorage = (key, init) => {
  const [val, setVal] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key)) || init; } 
    catch { return init; }
  });
  const set = (v) => { setVal(v); localStorage.setItem(key, JSON.stringify(v)); };
  return [val, set];
};

const SafetyBanner = ({ mood }) => {
  if (!['Sad', 'Overwhelmed', 'Low'].includes(mood)) return null;
  return (
    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} 
      className="mb-3 bg-red-500/20 border-2 border-red-400/40 rounded-xl p-3 backdrop-blur-xl flex-shrink-0">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-red-200 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-red-50 mb-2">You don't have to face this alone</p>
          <a href="https://findahelpline.com/" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-lg">
            Find Support Now →
          </a>
        </div>
      </div>
    </motion.div>
  );
};

function App() {
  // --- AUTH & SETTINGS STATE ---
  const [user, setUser] = useState(null);
  const [emergencyEmail, setEmergencyEmail] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  const [view, setView] = useState('input');
  const [input, setInput] = useState('');
  const [mood, setMood] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // RITUAL STATE
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const autoPlayTimeoutRef = useRef(null);
  
  // CHAT STATE
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([]);
  
  const [history, setHistory] = useStorage('moodHistory', []);
  const chatEnd = useRef(null);

  // AUDIO: preload low-volume background tracks for each mood
  const audioMapRef = useRef({});

  useEffect(() => {
    // Only reference files that actually exist in `public/`.
    // Note: `sad.mp3` wasn't present; map `Sad` to `calm.mp3` as a gentle fallback.
    const moodFiles = {
      Anxious: '/anxious.mp3',
      Overwhelmed: '/overwhelmed.mp3',
      Low: '/low.mp3',
      Sad: '/calm.mp3',
      Energized: '/energized.mp3',
      Calm: '/calm.mp3',
      Focused: '/focused.mp3'
    };

    const audios = {};
    Object.entries(moodFiles).forEach(([key, src]) => {
      try {
        const a = new Audio(src);
        a.preload = 'auto';
        a.loop = true;
        a.volume = 0.12; // low background volume
        audios[key] = a;
      } catch (e) {
        console.warn('Failed to create audio for', key, e);
      }
    });

    audioMapRef.current = audios;

    return () => {
      Object.values(audioMapRef.current).forEach((a) => {
        try { a.pause(); a.src = ''; } catch (e) {}
      });
      audioMapRef.current = {};
    };
  }, []);

  // Play the track matching `mood`, stop others
  useEffect(() => {
    // Stop any currently playing tracks
    Object.values(audioMapRef.current).forEach((a) => {
      try {
        if (!a.paused) {
          a.pause();
          a.currentTime = 0;
        }
      } catch (e) {}
    });

    if (mood && audioMapRef.current[mood]) {
      const track = audioMapRef.current[mood];
      // ensure settings
      track.loop = true;
      track.volume = 0.12;
      const p = track.play();
      if (p && p.catch) p.catch((err) => {
        // Common reasons: browser autoplay policy or missing/corrupt asset
        if (err && err.name === 'NotSupportedError') {
          console.warn('Autoplay failed - file may be missing or unsupported for', mood, track.src, err);
        } else {
          console.warn('Autoplay prevented or failed for', mood, err);
        }
      });
    }
  }, [mood]);

  // --- 1. AUTH LISTENER ---
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Retrieve saved emergency contact from Firestore
        const docRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setEmergencyEmail(docSnap.data().emergencyEmail || "");
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try { await signInWithPopup(auth, googleProvider); } 
    catch (error) { console.error("Login failed", error); }
  };

  const saveSettings = async () => {
    if (!user) return;
    try {
      await setDoc(doc(db, "users", user.uid), { emergencyEmail }, { merge: true });
      setShowSettings(false);
      alert("Emergency contact saved.");
    } catch (e) { alert("Error saving settings"); }
  };

  // --- 2. RITUAL LOGIC ---
  useEffect(() => {
    if (!isAutoPlaying || !mood || !RITUALS[mood]) return;
    
    const ritual = RITUALS[mood];
    if (currentStep >= ritual.steps.length - 1) {
      setIsAutoPlaying(false);
      return;
    }
    
    autoPlayTimeoutRef.current = setTimeout(() => {
      setCurrentStep(prev => prev + 1);
      setCompletedSteps(prev => [...prev, currentStep]);
    }, 5000);
    
    return () => {
      if (autoPlayTimeoutRef.current) clearTimeout(autoPlayTimeoutRef.current);
    };
  }, [isAutoPlaying, currentStep, mood]);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // --- 3. API CALLS (UPDATED) ---
  const analyze = async () => {
    if (!input.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input })
      });
      const { emotion } = await res.json();
      setMood(emotion);
      setView('ritual');
      setCurrentStep(0);
      setCompletedSteps([]);
      setIsAutoPlaying(false);
      setMessages([{ sender: 'bot', text: `I sense you're feeling ${emotion.toLowerCase()}. Let's work through this together.` }]);
      
      const entry = {
        id: Date.now(),
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        mood: emotion,
        text: input.substring(0, 50) + (input.length > 50 ? '...' : '')
      };
      setHistory([entry, ...history.slice(0, 4)]);
    } catch (err) {
      alert('Unable to connect. Please ensure the server is running.');
    }
    setLoading(false);
  };

  const sendMsg = async () => {
    if (!chatInput.trim()) return;
    const newMsgs = [...messages, { sender: 'user', text: chatInput }];
    setMessages(newMsgs);
    setChatInput('');

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: chatInput, 
          mood: mood,
          history: newMsgs.slice(-5), // Send Context
          user_email: user?.email,
          emergency_email: emergencyEmail
        })
      });
      const data = await res.json();
      setMessages(prev => [...prev, { sender: 'bot', text: data.reply }]);
      
      if (data.action === "email_sent") {
        alert("⚠️ An emergency alert has been sent to your contact.");
      }
    } catch {
      setMessages(prev => [...prev, { sender: 'bot', text: "Connection error." }]);
    }
  };

  // --- HELPERS ---
  const toggleAutoPlay = () => setIsAutoPlaying(!isAutoPlaying);
  
  const goToStep = (index) => {
    if (autoPlayTimeoutRef.current) clearTimeout(autoPlayTimeoutRef.current);
    setIsAutoPlaying(false);
    setCurrentStep(index);
  };

  const completeCurrentStep = () => {
    if (!completedSteps.includes(currentStep)) setCompletedSteps([...completedSteps, currentStep]);
    const ritual = RITUALS[mood];
    if (currentStep < ritual.steps.length - 1) setCurrentStep(currentStep + 1);
  };

  const restartRitual = () => {
    setCurrentStep(0);
    setCompletedSteps([]);
    setIsAutoPlaying(true);
  };

  const reset = () => {
    if (autoPlayTimeoutRef.current) clearTimeout(autoPlayTimeoutRef.current);
    setIsAutoPlaying(false);
    setView('input');
    setMood(null);
    setInput('');
    setCurrentStep(0);
    setCompletedSteps([]);
    setMessages([]);
  };

  const gradient = mood ? MOODS[mood]?.gradient : 'from-slate-900 via-indigo-900 to-purple-900';
  const moodConfig = mood ? MOODS[mood] : null;
  const ritual = mood ? RITUALS[mood] : null;

  // --- 4. LOGIN VIEW (If not authenticated) ---
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-xl p-8 rounded-3xl border border-white/20 text-center max-w-md w-full shadow-2xl">
          <Sparkles className="w-12 h-12 text-blue-400 mx-auto mb-4" />
          <h1 className="text-4xl font-bold text-white mb-2">MoodScape</h1>
          <p className="text-slate-300 mb-8">Your AI-powered safe space for emotional balance.</p>
          <button onClick={handleLogin} className="w-full py-3 bg-white text-slate-900 rounded-xl font-bold hover:bg-slate-200 transition flex items-center justify-center gap-2">
            <User className="w-5 h-5" /> Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  // --- 5. MAIN APP RENDER ---
  return (
    <div className={`h-screen bg-gradient-to-br ${gradient} transition-all duration-1000 flex flex-col p-4 relative overflow-hidden`}>
      
      {/* Animated background particles */}
      {mood && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              className={`absolute w-2 h-2 ${moodConfig.accentColor} rounded-full opacity-20`}
              initial={{ x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight }}
              animate={{ x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight }}
              transition={{ duration: 10 + Math.random() * 20, repeat: Infinity, repeatType: "reverse" }}
            />
          ))}
        </div>
      )}

      <div className="w-full max-w-6xl mx-auto relative z-10 flex flex-col h-full">
        
        {/* HEADER */}
        <motion.header initial={{ opacity: 0 }} animate={{ opacity: 1 }} 
          className="flex-shrink-0 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sparkles className="w-7 h-7 text-white" />
            <h1 className="text-3xl font-bold text-white">MoodScape</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Settings Button */}
            <button onClick={() => setShowSettings(true)} className="p-2.5 bg-white/20 hover:bg-white/30 rounded-full backdrop-blur transition text-white">
              <Settings className="w-5 h-5" />
            </button>
            {/* Reset Button */}
            {mood && (
              <button onClick={reset} className="p-2.5 bg-white/20 hover:bg-white/30 rounded-full backdrop-blur transition text-white">
                <Home className="w-5 h-5" />
              </button>
            )}
            {/* Logout Button */}
            <button onClick={() => signOut(auth)} className="p-2.5 bg-white/20 hover:bg-red-500/50 rounded-full backdrop-blur transition text-white">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </motion.header>

        {/* SETTINGS MODAL */}
        <AnimatePresence>
          {showSettings && (
            <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
              <motion.div initial={{scale:0.9, opacity:0}} animate={{scale:1, opacity:1}} exit={{scale:0.9, opacity:0}} className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                <div className="flex justify-between mb-4">
                  <h3 className="font-bold text-lg text-slate-900">Safety Settings</h3>
                  <button onClick={() => setShowSettings(false)}><X className="text-slate-500" /></button>
                </div>
                <label className="block text-sm font-medium mb-1 text-slate-700">Emergency Contact Email</label>
                <input 
                  value={emergencyEmail}
                  onChange={(e) => setEmergencyEmail(e.target.value)}
                  placeholder="friend@example.com"
                  className="w-full p-2 border rounded-lg mb-4 text-slate-900"
                />
                <p className="text-xs text-slate-500 mb-4">
                  We will ONLY email this person if our AI detects you are in severe distress or crisis during a chat session.
                </p>
                <button onClick={saveSettings} className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold hover:bg-blue-700">Save</button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <SafetyBanner mood={mood} />

        <AnimatePresence mode="wait">
          
          {view === 'input' && (
            <motion.div key="input" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
              <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/20 shadow-2xl flex flex-col">
                <label className="block text-xl font-semibold text-white mb-3">How are you feeling right now?</label>
                <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="I'm feeling..." 
                  className="flex-1 w-full p-3 bg-white/90 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-white/50 text-base resize-none shadow-inner"
                  autoFocus />
                <motion.button onClick={analyze} disabled={loading || !input.trim()}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="w-full mt-3 py-3 bg-white text-slate-900 rounded-xl font-bold text-base hover:bg-white/90 transition disabled:opacity-50 shadow-xl">
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}><RefreshCw className="w-5 h-5" /></motion.div>
                      Analyzing...
                    </span>
                  ) : 'Check In'}
                </motion.button>
              </div>

              <div className="flex flex-col min-h-0">
                <div className="flex items-center gap-2 text-white/70 mb-3">
                  <Clock className="w-4 h-4" />
                  <h3 className="text-sm font-semibold uppercase tracking-wider">Recent Check-ins</h3>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
                  {history.length > 0 ? (
                    history.map(log => (
                      <motion.div key={log.id} whileHover={{ scale: 1.02 }}
                        className="bg-white/5 hover:bg-white/10 backdrop-blur rounded-xl p-3 border border-white/10 transition flex items-center justify-between">
                        <div className="font-semibold text-white text-sm">{log.mood}</div>
                        <span className="text-xs text-white/50">{log.date}</span>
                      </motion.div>
                    ))
                  ) : (
                    <div className="bg-white/5 backdrop-blur rounded-xl p-6 border border-white/10 text-center">
                      <div className="text-3xl mb-2">📝</div>
                      <p className="text-white/60 text-sm">Your check-in history will appear here</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {view === 'ritual' && ritual && moodConfig && (
            <motion.div key="ritual" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex-1 flex flex-col min-h-0">
              <div className="text-center mb-4 flex-shrink-0">
                
                <h2 className="text-3xl font-bold text-white mb-1">{mood}</h2>
                <p className={`text-base ${moodConfig.textColor} italic mb-1`}>{moodConfig.ambiance}</p>
                <p className="text-white/70 text-sm">{ritual.title}</p>
              </div>

              <div className="flex-1 max-w-2xl mx-auto w-full bg-white/95 backdrop-blur-xl rounded-2xl p-6 shadow-2xl mb-3 flex flex-col min-h-0">
                <div className="mb-4 flex-shrink-0">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs font-medium text-slate-600">Progress</span>
                    <span className="text-xs font-bold text-slate-900">{currentStep + 1} / {ritual.steps.length}</span>
                  </div>
                  <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <motion.div className={`h-full ${moodConfig.accentColor} rounded-full`}
                      initial={{ width: 0 }} animate={{ width: `${((currentStep + 1) / ritual.steps.length) * 100}%` }}
                      transition={{ type: "spring", stiffness: 100, damping: 20 }} />
                  </div>
                </div>

                <div className="flex-1 flex items-center justify-center py-4 min-h-0">
                  <motion.div key={currentStep} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="text-center">
                    <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full ${moodConfig.accentColor} text-white text-xl font-bold mb-3 shadow-lg`}>
                      {completedSteps.includes(currentStep) ? <CheckCircle2 className="w-6 h-6" /> : currentStep + 1}
                    </div>
                    <p className="text-2xl font-bold text-slate-900 leading-relaxed px-4">{ritual.steps[currentStep]}</p>
                  </motion.div>
                </div>

                <div className="flex justify-center gap-1.5 mb-4 flex-shrink-0">
                  {ritual.steps.map((_, i) => (
                    <button key={i} onClick={() => goToStep(i)}
                      className={`h-1.5 rounded-full transition-all duration-300 ${i === currentStep ? `w-6 ${moodConfig.accentColor}` : completedSteps.includes(i) ? 'w-1.5 bg-green-500' : 'w-1.5 bg-slate-300 hover:bg-slate-400'}`} />
                  ))}
                </div>

                <div className="flex gap-2 flex-shrink-0">
                  {currentStep < ritual.steps.length - 1 ? (
                    <>
                      <motion.button onClick={toggleAutoPlay} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        className={`flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition shadow-lg text-sm ${isAutoPlaying ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-white hover:from-amber-500 hover:to-orange-600' : `bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700`}`}>
                        {isAutoPlaying ? <><Pause className="w-4 h-4" /> Pause</> : <><Play className="w-4 h-4 fill-current" /> {currentStep === 0 ? "Start" : "Resume"}</>}
                      </motion.button>
                      <motion.button onClick={completeCurrentStep} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        className="flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition shadow-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 text-sm">
                        <CheckCircle2 className="w-4 h-4" /> Next
                      </motion.button>
                    </>
                  ) : (
                    <motion.button onClick={restartRitual} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                      className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition shadow-lg bg-gradient-to-r from-slate-700 to-slate-900 text-white hover:from-slate-800 hover:to-black text-sm">
                      <RefreshCw className="w-4 h-4" /> Start Over
                    </motion.button>
                  )}
                </div>
              </div>

              <div className="flex justify-center flex-shrink-0">
                <motion.button onClick={() => setView('chat')} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  className="px-5 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-xl border border-white/30 text-white rounded-xl font-semibold transition flex items-center gap-2 shadow-lg text-sm">
                  <MessageSquare className="w-4 h-4" /> Talk to Moody
                </motion.button>
              </div>
            </motion.div>
          )}

          {view === 'chat' && (
            <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex-1 max-w-3xl mx-auto w-full bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl flex flex-col min-h-0">
              <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-white/50 rounded-t-2xl flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <h3 className="font-bold text-slate-900 text-sm">Reflection Space</h3>
                </div>
                <button onClick={() => setView('ritual')} className="p-1.5 hover:bg-gray-100 rounded-lg transition"><X className="w-4 h-4 text-slate-600" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
                {messages.map((msg, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${msg.sender === 'user' ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-gray-100 text-slate-800 rounded-bl-sm'}`}>
                      {msg.text}
                    </div>
                  </motion.div>
                ))}
                <div ref={chatEnd} />
              </div>
              <div className="p-3 border-t border-gray-200 bg-white/50 rounded-b-2xl flex-shrink-0">
                <div className="flex gap-2">
                  <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMsg()}
                    placeholder="Share what's on your mind..." className="flex-1 px-3 py-2 bg-gray-100 rounded-xl text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <motion.button onClick={sendMsg} disabled={!chatInput.trim()} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-xl transition"><Send className="w-4 h-4" /></motion.button>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}

export default App;