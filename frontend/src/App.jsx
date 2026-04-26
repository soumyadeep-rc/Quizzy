import { useState, useEffect } from 'react';
import { socket } from './socket';

export default function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [role, setRole] = useState(null); 
    
  // --- BUILDER STATE ---
  const [questions, setQuestions] = useState([{
    text: "What does Redis stand for?",
    options: ["Remote Dictionary Server", "Relational Data System", "Realtime Data Service", "Remote Disk Storage"],
    correctAnswer: 0,
    timeLimit: 10
  }]);

  // --- ROOM STATE ---
  const [pin, setPin] = useState('');
  const [players, setPlayers] = useState([]);
  const [leaderboard, setLeaderboard] = useState(null);
  
  // --- FLOW STATE ---
  const [hostState, setHostState] = useState('lobby'); 
  const [gameState, setGameState] = useState('waiting'); 
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [startTime, setStartTime] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [name, setName] = useState('');
  const [inputPin, setInputPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  // 1. SOCKET LISTENERS
  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('join_error', (msg) => setErrorMsg(msg));
    socket.on('join_success', () => {
        setErrorMsg('');
        setRole('player');
        setGameState('waiting');
    });
    socket.on('room_created', (newPin) => { setPin(newPin); setRole('host'); setHostState('lobby'); });
    socket.on('player_joined', setPlayers);
    
    socket.on('quiz_started', (data) => {
      setActiveQuestion(data.question);
      setStartTime(data.startTime);
      setTimeLeft(data.question.timeLimit);
      setLeaderboard(null); 
      
      if (role === 'player') setGameState('playing');
      if (role === 'host') setHostState('question_live');
    });

    socket.on('leaderboard_results', (results) => {
      setLeaderboard(results);
      if (role === 'player') setGameState('leaderboard');
      if (role === 'host') setHostState('leaderboard');
    });

    return () => {
      socket.off('connect'); socket.off('disconnect'); socket.off('room_created');
      socket.off('player_joined'); socket.off('leaderboard_results'); socket.off('quiz_started');
      socket.off('join_error'); socket.off('join_success');
    };
  }, [role]);

  // 2. THE MASTER TIMER
  useEffect(() => {
    if (timeLeft > 0) {
      const timerId = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timerId);
    }

    if (timeLeft === 0 && role === 'player' && gameState === 'playing') {
      setGameState('done');
    }

    if (timeLeft === 0 && role === 'host' && hostState === 'question_live') {
      setHostState('transitioning'); 
      if (currentQIndex < questions.length - 1) {
        const nextIndex = currentQIndex + 1;
        setCurrentQIndex(nextIndex);
        socket.emit('start_quiz', { pin, customQuestion: questions[nextIndex] });
      } else {
        socket.emit('get_leaderboard', { pin });
      }
    }
  }, [timeLeft, role, hostState, gameState, currentQIndex, questions, pin]);


  // --- ACTIONS ---
  const startQuiz = () => {
    setCurrentQIndex(0);
    socket.emit('start_quiz', { pin, customQuestion: questions[0] });
  };

  const submitAnswer = (index) => {
    const reactionTimeMs = Date.now() - startTime;
    socket.emit('submit_answer', { pin: inputPin, name, answerIndex: index, reactionTimeMs });
    setGameState('done');
  };

  const addQuestion = () => setQuestions([...questions, { text: "New Question", options: ["A", "B", "C", "D"], correctAnswer: 0, timeLimit: 10 }]);

  // Completely resets the app state back to the main menu
  const handleExit = () => {
    window.location.reload();
  };

  // --- UI COMPONENTS ---
  
  const SharedLeaderboard = () => (
    <div className="w-full max-w-4xl mx-auto animate-fade-in flex flex-col items-center">
      <h1 className="text-4xl md:text-5xl font-black text-center mb-8 text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-yellow-500 drop-shadow-sm">FINAL SCOREBOARD</h1>
      <div className="space-y-4 w-full">
        {leaderboard.map((player, i) => (
          <div key={i} className={`flex justify-between items-center p-4 sm:p-6 rounded-2xl border backdrop-blur-sm transition-all ${name === player.name ? 'bg-indigo-900/40 border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.2)]' : 'bg-slate-900/60 border-slate-800 shadow-lg'}`}>
            
            {/* Left Side: Rank & Name */}
            <div className="flex items-center gap-3 sm:gap-4 overflow-hidden">
              <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-800/80 text-slate-400 font-black text-lg sm:text-xl">
                {i + 1}
              </div>
              <span className="text-xl sm:text-2xl font-bold text-slate-100 truncate max-w-[120px] sm:max-w-[250px]">{player.name}</span>
              {name === player.name && (
                <span className="bg-indigo-500 text-white text-[10px] sm:text-xs px-2 py-1 rounded-full uppercase tracking-widest font-black flex-shrink-0">You</span>
              )}
            </div>

            {/* Right Side: Score & Time Stacked */}
            <div className="flex flex-col items-end justify-center flex-shrink-0 ml-2">
              <span className="text-emerald-400 font-black text-2xl sm:text-3xl tracking-tight leading-none mb-1">{player.score} <span className="text-xs sm:text-sm text-emerald-600 uppercase">pts</span></span>
              <span className="text-slate-400 font-mono text-xs sm:text-sm flex items-center gap-1">
                <svg className="w-3 h-3 sm:w-4 sm:h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                {player.time}
              </span>
            </div>

          </div>
        ))}
      </div>
    </div>
  );

  // --- RENDERING ---

  // 1. MAIN MENU
  if (!role) {
    return (
      <div className="relative flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-100 p-6 selection:bg-indigo-500/30">
        <div className={`absolute top-6 left-6 px-4 py-1.5 rounded-full text-xs font-black tracking-widest uppercase flex items-center gap-2 border shadow-lg ${isConnected ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}></div>
          {isConnected ? 'System Online' : 'Offline'}
        </div>
        <h1 className="text-7xl font-black mb-12 tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-indigo-400 via-purple-400 to-pink-400 drop-shadow-lg">QUIZZY</h1>
        <div className="w-full max-w-sm flex flex-col gap-6">
          <div className="bg-slate-900/80 backdrop-blur-md p-8 rounded-3xl shadow-2xl border border-slate-800">
            <h2 className="text-xl font-bold mb-6 text-slate-300">Join as Player</h2>

            { }
            {errorMsg && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm font-bold flex items-center gap-3 animate-fade-in">
                 <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                 {errorMsg}
              </div>
            )}

            <div className="space-y-4">
              <input className="w-full p-4 bg-slate-950 rounded-xl border border-slate-800 text-slate-100 font-medium placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" placeholder="Room PIN" value={inputPin} onChange={e => { setInputPin(e.target.value); setErrorMsg(''); }} />
              <input className="w-full p-4 bg-slate-950 rounded-xl border border-slate-800 text-slate-100 font-medium placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" placeholder="Nickname" value={name} onChange={e => { setName(e.target.value); setErrorMsg(''); }} />
              
              {}
              <button onClick={() => { 
                if (!inputPin || !name) return setErrorMsg('Please enter a PIN and Nickname!');
                socket.emit('join_room', { pin: inputPin, name }); 
              }} className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all mt-2">Join Lobby ➡️</button>
            </div>
          </div>
          <button onClick={() => setRole('creator')} className="w-full bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold py-5 rounded-3xl transition-all shadow-xl flex justify-center items-center gap-3">
             <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
             Create Custom Game
          </button>
        </div>
      </div>
    );
  }

  // 2. CREATOR VIEW
  if (role === 'creator') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 p-6 md:p-12 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-900/80 backdrop-blur-md p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-2xl sticky top-6 z-20">
              <div>
                <h1 className="text-3xl font-black text-slate-100 tracking-tight">Quiz Builder</h1>
                <p className="text-slate-500 mt-1 font-medium">Configure your questions and timer settings.</p>
              </div>
              <button onClick={() => socket.emit('create_room')} className="mt-4 sm:mt-0 w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-10 py-4 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] transition-all">Launch Server 🚀</button>
          </div>
          {questions.map((q, qIndex) => (
            <div key={qIndex} className="bg-slate-900/50 p-6 md:p-10 rounded-3xl border border-slate-800 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-2 h-full bg-indigo-500"></div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-black text-indigo-400 uppercase tracking-widest">Question {qIndex + 1}</h2>
                <div className="flex items-center gap-3 bg-slate-950 px-4 py-2 rounded-lg border border-slate-800">
                  <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  <input type="number" className="w-16 bg-transparent text-slate-200 text-center font-bold text-lg focus:outline-none" value={q.timeLimit} onChange={e => { const newQs = [...questions]; newQs[qIndex].timeLimit = parseInt(e.target.value); setQuestions(newQs); }} />
                  <span className="text-slate-500 font-bold text-sm">SEC</span>
                </div>
              </div>
              <input type="text" className="w-full p-5 mb-8 bg-slate-950 rounded-xl border border-slate-800 text-2xl font-bold text-slate-100 placeholder-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" value={q.text} onChange={e => { const newQs = [...questions]; newQs[qIndex].text = e.target.value; setQuestions(newQs); }} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {q.options.map((opt, oIndex) => (
                  <div key={oIndex} className={`relative flex items-center p-2 rounded-xl border transition-all ${q.correctAnswer === oIndex ? 'bg-emerald-500/10 border-emerald-500/50' : 'bg-slate-950 border-slate-800'}`}>
                    <label className="flex items-center justify-center w-12 h-12 cursor-pointer shrink-0">
                      <input type="radio" checked={q.correctAnswer === oIndex} onChange={() => { const newQs = [...questions]; newQs[qIndex].correctAnswer = oIndex; setQuestions(newQs); }} className="w-6 h-6 appearance-none rounded-full border-2 border-slate-600 checked:border-emerald-500 checked:bg-emerald-500 transition-all cursor-pointer focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2" />
                    </label>
                    <input type="text" className="w-full p-3 bg-transparent text-slate-200 font-medium text-lg focus:outline-none" value={opt} onChange={e => { const newQs = [...questions]; newQs[qIndex].options[oIndex] = e.target.value; setQuestions(newQs); }} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <button onClick={addQuestion} className="w-full bg-slate-900/30 hover:bg-slate-900/80 border-2 border-dashed border-slate-700 hover:border-indigo-500 text-slate-400 hover:text-indigo-400 font-bold py-8 rounded-3xl text-xl transition-all flex items-center justify-center gap-3">
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
             Add Another Question
          </button>
        </div>
      </div>
    );
  }

  // 3. HOST VIEW
  if (role === 'host') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 p-8 flex flex-col items-center justify-center overflow-hidden relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none"></div>

        {hostState === 'lobby' && (
          <div className="text-center z-10 w-full max-w-5xl flex flex-col items-center">
            <div className="bg-slate-900/60 backdrop-blur-lg border border-slate-800 rounded-3xl p-12 shadow-2xl mb-12">
              <h2 className="text-3xl font-bold text-slate-400 mb-4 tracking-tight">Join the Quiz with PIN</h2>
              <h1 className="text-[12rem] leading-none font-black text-slate-100 tracking-tighter drop-shadow-2xl">{pin}</h1>
            </div>
            <button onClick={startQuiz} className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-3xl py-6 px-16 rounded-full mb-16 shadow-[0_0_40px_rgba(16,185,129,0.3)] hover:scale-105 transition-all">START GAME</button>
            <div className="flex gap-4 justify-center flex-wrap">
              {players.map((p, i) => <span key={i} className="bg-slate-800/80 backdrop-blur-sm border border-slate-700 px-6 py-3 rounded-xl text-2xl font-bold text-slate-200 animate-fade-in shadow-lg">{p}</span>)}
            </div>
          </div>
        )}

        {(hostState === 'question_live' || hostState === 'transitioning') && activeQuestion && (
           <div className="text-center max-w-6xl w-full z-10 flex flex-col h-[80vh]">
             <div className="flex-none pb-8 border-b border-slate-800/50 mb-12">
                <div className={`inline-flex items-center justify-center w-32 h-32 rounded-full border-4 shadow-[0_0_30px_rgba(0,0,0,0.5)] ${timeLeft <= 3 ? 'bg-red-500/10 border-red-500 text-red-500 animate-pulse' : 'bg-slate-900 border-indigo-500 text-indigo-400'}`}>
                  <span className="text-6xl font-black">{timeLeft}</span>
                </div>
             </div>
             <h2 className="text-6xl md:text-7xl font-bold mb-auto leading-tight text-slate-100 px-4 drop-shadow-xl">{activeQuestion.text}</h2>
             <div className="grid grid-cols-2 gap-6 mt-12">
                {activeQuestion.options.map((opt, i) => <div key={i} className="bg-slate-900/80 backdrop-blur-sm p-10 rounded-3xl text-4xl font-bold border border-slate-800 shadow-xl flex items-center justify-center min-h-[160px] text-slate-200">{opt}</div>)}
             </div>
           </div>
        )}

        {hostState === 'leaderboard' && leaderboard && (
           <div className="w-full flex flex-col items-center z-10">
             <SharedLeaderboard />
             <button onClick={handleExit} className="mt-12 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-bold py-4 px-8 rounded-xl transition-all shadow-lg">Exit to Main Menu</button>
           </div>
        )}
      </div>
    );
  }

  // 4. PLAYER VIEW
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center">
      <div className="w-full max-w-md mx-auto flex-1 flex flex-col justify-center p-6 relative">
        
        {gameState === 'waiting' && (
          <div className="flex flex-col items-center justify-center animate-pulse">
            <div className="w-16 h-16 rounded-full border-4 border-slate-800 border-t-indigo-500 animate-spin mb-8"></div>
            <h2 className="text-3xl font-black text-slate-400 tracking-tight">Waiting for Host...</h2>
            <p className="text-slate-600 mt-2 font-medium">Best of Luck !</p>
          </div>
        )}
        
        {gameState === 'playing' && activeQuestion && (
          <div className="animate-fade-in flex flex-col h-full py-4">
            <div className="flex justify-between items-center mb-8 bg-slate-900/80 px-6 py-4 rounded-2xl border border-slate-800 shadow-md">
               <span className="text-slate-400 font-bold uppercase tracking-widest text-sm">Time Left</span>
               <span className={`text-4xl font-black tabular-nums ${timeLeft <= 3 ? 'text-red-500' : 'text-indigo-400'}`}>{timeLeft}</span>
            </div>
            <h2 className="text-2xl font-bold mb-8 text-center leading-relaxed text-slate-100">{activeQuestion.text}</h2>
            <div className="grid grid-cols-1 gap-4 mt-auto">
              {activeQuestion.options.map((opt, i) => (
                <button key={i} onClick={() => submitAnswer(i)} className="bg-slate-800 hover:bg-indigo-600 active:bg-indigo-700 active:scale-[0.98] border border-slate-700 hover:border-indigo-500 p-6 rounded-2xl text-xl font-bold shadow-lg transition-all text-slate-200 text-left relative overflow-hidden group">
                  <span className="relative z-10">{opt}</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
                </button>
              ))}
            </div>
          </div>
        )}

        {gameState === 'done' && (
          <div className="text-center animate-fade-in bg-slate-900/50 p-10 rounded-3xl border border-slate-800 shadow-xl flex flex-col items-center">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-emerald-500/10 text-emerald-500 rounded-full mb-8">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
            </div>
            <h2 className="text-3xl font-black text-slate-100 mb-2">Answer Locked!</h2>
            <p className="text-slate-400 font-medium">Keep your eyes on the main screen.</p>
          </div>
        )}

        {gameState === 'leaderboard' && leaderboard && (
           <div className="w-full py-8 flex flex-col items-center">
             <SharedLeaderboard />
             <button onClick={handleExit} className="mt-8 w-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-bold py-4 rounded-xl transition-all shadow-lg">Exit to Main Menu</button>
           </div>
        )}
      </div>
    </div>
  );
}