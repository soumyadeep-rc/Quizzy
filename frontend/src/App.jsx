import { useState, useEffect } from 'react';
import { socket } from './socket';

export default function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [role, setRole] = useState(null); 
    
  const [questions, setQuestions] = useState([{
    text: "What does Redis stand for?",
    options: ["Remote Dictionary Server", "Relational Data System", "Realtime Data Service", "Remote Disk Storage"],
    correctAnswer: 0,
    timeLimit: 10
  }]);

  const [pin, setPin] = useState('');
  const [players, setPlayers] = useState([]);
  const [leaderboard, setLeaderboard] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [hostState, setHostState] = useState('lobby'); 
  const [gameState, setGameState] = useState('waiting'); 
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [startTime, setStartTime] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [name, setName] = useState('');
  const [inputPin, setInputPin] = useState('');

  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    
    socket.on('room_created', (newPin) => { setPin(newPin); setRole('host'); setHostState('lobby'); });
    socket.on('player_joined', setPlayers);
    
    socket.on('join_error', (msg) => setErrorMsg(msg));
    socket.on('join_success', () => { setErrorMsg(''); setRole('player'); setGameState('waiting'); });

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

  useEffect(() => {
    if (timeLeft > 0) {
      const timerId = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timerId);
    }

    if (timeLeft === 0 && role === 'player' && gameState === 'playing') setGameState('done');

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

  const startQuiz = () => { setCurrentQIndex(0); socket.emit('start_quiz', { pin, customQuestion: questions[0] }); };
  const submitAnswer = (index) => {
    socket.emit('submit_answer', { pin: inputPin, name, answerIndex: index, reactionTimeMs: Date.now() - startTime });
    setGameState('done');
  };
  const addQuestion = () => setQuestions([...questions, { text: "New Question", options: ["A", "B", "C", "D"], correctAnswer: 0, timeLimit: 10 }]);
  const handleExit = () => window.location.reload();

  // FIX: Un-cramped Leaderboard, added Time, spaced out Name/Score
  const SharedLeaderboard = () => (
    <div className="w-full max-w-4xl mx-auto animate-fade-in flex flex-col items-center z-10 h-full">
      <h1 className="font-mech text-3xl md:text-5xl text-center mb-8 text-[#d8b4fe] drop-shadow-[0_0_15px_rgba(168,85,247,0.5)] tracking-widest leading-normal">FINAL SCOREBOARD</h1>
      <div className="space-y-3 w-full overflow-y-auto px-2 pb-4">
        {leaderboard.map((player, i) => (
          <div key={i} className={`flex justify-between items-center p-3 sm:p-4 border backdrop-blur-sm transition-all ${name === player.name ? 'bg-[#6d28d9]/20 border-[#8b5cf6] shadow-[0_0_20px_rgba(139,92,246,0.3)]' : 'bg-black/60 border-gray-800'}`}>
            <div className="flex items-center gap-3 sm:gap-4 overflow-hidden flex-1">
              <div className="flex-shrink-0 font-mech text-xl text-gray-500 w-6">{i + 1}</div>
              <span className="text-lg sm:text-xl font-bold text-gray-200 truncate tracking-widest uppercase">{player.name}</span>
              {name === player.name && <span className="bg-[#6d28d9] text-white text-[10px] px-2 py-1 tracking-[0.2em] font-bold">YOU</span>}
            </div>
            <div className="flex flex-col items-end justify-center flex-shrink-0 ml-4">
              <span className="font-mech text-purple-400 text-xl sm:text-2xl tracking-widest leading-none mb-1">{player.score} <span className="text-xs text-purple-600 font-sans tracking-[0.2em]">PTS</span></span>
              <span className="text-gray-500 font-mono text-[10px] sm:text-xs tracking-widest uppercase">Time: {player.time}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // 1. MAIN MENU
  if (!role) {
    return (
      <div className="relative flex flex-col items-center justify-center h-[100dvh] p-6 selection:bg-purple-500/30 overflow-hidden">
        <div className={`absolute top-4 left-4 px-3 py-1 rounded-none text-[10px] font-bold tracking-[0.2em] uppercase flex items-center gap-2 border ${isConnected ? 'bg-purple-900/20 text-purple-400 border-purple-500/50' : 'bg-red-900/20 text-red-400 border-red-500/50'}`}>
          <div className={`w-1.5 h-1.5 ${isConnected ? 'bg-purple-400 animate-pulse' : 'bg-red-400'}`}></div>
          {isConnected ? 'ONLINE' : 'OFFLINE'}
        </div>

        <div className="text-center z-10 mb-8">
          <h1 className="font-mech text-5xl md:text-7xl tracking-widest text-[#d8b4fe] drop-shadow-[0_0_15px_rgba(168,85,247,0.6)] mb-2">QUIZZY</h1>
          <h2 className="text-sm md:text-base font-semibold tracking-[0.3em] uppercase text-gray-400">Live Quiz Platform</h2>
        </div>
        
        <div className="w-full max-w-sm flex flex-col gap-4 z-10">
          <div className="bg-black/40 backdrop-blur-sm p-6 border border-gray-800 relative">
            <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-purple-500"></div>
            <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-purple-500"></div>

            <h2 className="text-lg font-bold tracking-[0.2em] mb-4 text-gray-300 uppercase">Join a Room</h2>
            {errorMsg && <div className="mb-4 p-3 bg-red-900/30 border-l-2 border-red-500 text-red-400 text-xs font-bold tracking-widest">{errorMsg}</div>}

            <div className="space-y-3">
              <input className="w-full p-2.5 bg-black/50 border border-gray-700 text-white font-mono placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors uppercase tracking-wider text-sm" placeholder="ROOM PIN" value={inputPin} onChange={e => { setInputPin(e.target.value); setErrorMsg(''); }} />
              <input className="w-full p-2.5 bg-black/50 border border-gray-700 text-white font-mono placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors uppercase tracking-wider text-sm" placeholder="NICKNAME" value={name} onChange={e => { setName(e.target.value); setErrorMsg(''); }} />
              <button onClick={() => { if (!inputPin || !name) return setErrorMsg('PLEASE ENTER DETAILS'); socket.emit('join_room', { pin: inputPin, name }); }} className="mech-btn w-full bg-[#6d28d9] hover:bg-[#5b21b6] text-white font-bold tracking-[0.2em] py-3 text-sm transition-all mt-2">JOIN LOBBY</button>
            </div>
          </div>
          <button onClick={() => setRole('creator')} className="mech-btn w-full bg-transparent border-2 border-gray-600 hover:border-purple-400 hover:text-purple-300 text-gray-400 font-bold tracking-[0.2em] py-3 text-sm transition-all">CREATE GAME</button>
        </div>
      </div>
    );
  }

  // 2. CREATOR VIEW
  if (role === 'creator') {
    return (
      <div className="h-[100dvh] bg-[#050505] text-gray-200 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-6 relative z-10 pb-12">
          
          {/* FIX: Solid Opaque Background for Sticky Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-[#050505] shadow-[0_10px_30px_#050505] p-4 sm:p-6 border-b border-gray-800 sticky top-0 z-20">
              <div>
                <h1 className="font-mech text-2xl text-purple-400 tracking-widest">QUIZ BUILDER</h1>
              </div>
              <button onClick={() => socket.emit('create_room')} className="mech-btn mt-4 sm:mt-0 w-full sm:w-auto bg-[#6d28d9] text-white font-bold tracking-[0.2em] px-6 py-2 shadow-[0_0_15px_rgba(109,40,217,0.3)]">LAUNCH</button>
          </div>

          {questions.map((q, qIndex) => (
            <div key={qIndex} className="bg-black/40 p-4 md:p-6 border border-gray-800 relative">
              <div className="absolute top-0 left-0 w-1 h-full bg-purple-600"></div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-mech text-lg text-gray-400 tracking-widest">Q_{qIndex + 1}</h2>
                <div className="flex items-center gap-2 bg-black/80 px-3 py-1 border border-gray-700">
                  <span className="text-purple-500 font-bold text-[10px]">TIME</span>
                  <input type="number" className="w-12 bg-transparent text-white text-center font-mono focus:outline-none" value={q.timeLimit} onChange={e => { const newQs = [...questions]; newQs[qIndex].timeLimit = parseInt(e.target.value); setQuestions(newQs); }} />
                </div>
              </div>
              <input type="text" className="w-full p-3 mb-4 bg-black/60 border border-gray-700 font-bold text-gray-200 focus:outline-none focus:border-purple-500" value={q.text} onChange={e => { const newQs = [...questions]; newQs[qIndex].text = e.target.value; setQuestions(newQs); }} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {q.options.map((opt, oIndex) => (
                  <div key={oIndex} className={`relative flex items-center p-1 border ${q.correctAnswer === oIndex ? 'bg-purple-900/20 border-purple-500/50' : 'bg-black border-gray-800'}`}>
                    <label className="flex items-center justify-center w-10 h-10 cursor-pointer shrink-0">
                      <input type="radio" checked={q.correctAnswer === oIndex} onChange={() => { const newQs = [...questions]; newQs[qIndex].correctAnswer = oIndex; setQuestions(newQs); }} className="w-4 h-4 appearance-none border border-gray-500 checked:bg-purple-500 cursor-pointer" />
                    </label>
                    <input type="text" className="w-full p-2 bg-transparent text-gray-300 focus:outline-none text-sm" value={opt} onChange={e => { const newQs = [...questions]; newQs[qIndex].options[oIndex] = e.target.value; setQuestions(newQs); }} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <button onClick={addQuestion} className="mech-btn w-full bg-transparent border-2 border-dashed border-gray-700 text-gray-500 py-4 font-bold tracking-[0.2em] text-sm">+ ADD QUESTION</button>
        </div>
      </div>
    );
  }

  // 3. HOST VIEW
  if (role === 'host') {
    return (
      <div className="h-[100dvh] w-full p-6 flex flex-col items-center justify-center overflow-hidden relative">
        {hostState === 'lobby' && (
          <div className="text-center z-10 w-full max-w-4xl flex flex-col items-center h-full justify-center">
            <h2 className="text-xl font-bold text-gray-400 tracking-[0.3em] uppercase mb-4">Join at <span className="text-purple-400">https://quizzy-src.vercel.app/</span></h2>
            
            {/* FIX: PIN font changed from font-mech to font-mono for readability */}
            <div className="bg-black/50 p-8 mb-8 border border-purple-500/30">
              <h1 className="font-mono font-bold tracking-[0.2em] text-7xl md:text-9xl leading-none text-white">{pin}</h1>
            </div>
            
            <button onClick={startQuiz} className="mech-btn bg-[#6d28d9] text-white font-bold tracking-[0.3em] text-xl py-4 px-12 mb-8">START GAME</button>
            <div className="flex gap-3 justify-center flex-wrap max-w-3xl max-h-[30vh] overflow-y-auto">
              {players.map((p, i) => <span key={i} className="bg-gray-900 border border-gray-700 px-4 py-1.5 text-sm font-mono text-purple-200">{p}</span>)}
            </div>
          </div>
        )}

        {(hostState === 'question_live' || hostState === 'transitioning') && activeQuestion && (
           <div className="w-full max-w-5xl h-full flex flex-col py-4 z-10">
             <div className="flex-none text-center mb-4">
                <div className={`font-mech text-6xl drop-shadow-[0_0_15px_rgba(255,255,255,0.2)] ${timeLeft <= 3 ? 'text-red-500 animate-pulse' : 'text-purple-400'}`}>
                  00:{timeLeft.toString().padStart(2, '0')}
                </div>
             </div>
             <div className="flex-1 flex items-center justify-center mb-6">
                <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-center leading-tight text-white">{activeQuestion.text}</h2>
             </div>
             <div className="flex-none h-[45vh] grid grid-cols-2 gap-4 md:gap-6">
                {activeQuestion.options.map((opt, i) => (
                  <div key={i} className="bg-black/60 border border-gray-700 flex items-center justify-center p-6 text-xl md:text-2xl font-bold text-gray-200 h-full w-full">
                    {opt}
                  </div>
                ))}
             </div>
           </div>
        )}

        {hostState === 'leaderboard' && leaderboard && (
           <div className="w-full h-full flex flex-col items-center py-6 z-10">
             <div className="flex-1 w-full overflow-hidden">
               <SharedLeaderboard />
             </div>
             <button onClick={handleExit} className="mech-btn flex-none mt-6 bg-transparent border-2 border-gray-700 font-bold py-3 px-8 text-sm">EXIT TO MENU</button>
           </div>
        )}
      </div>
    );
  }

  // 4. PLAYER VIEW
  return (
    <div className="h-[100dvh] w-full text-gray-200 flex flex-col items-center relative z-10 overflow-hidden">
      
      {/* FIX: Dynamic max-w based on gameState. Normal gameplay is max-w-md (phone-sized container). Leaderboard expands to max-w-4xl (laptop-sized container) */}
      <div className={`w-full mx-auto h-full flex flex-col p-4 relative ${gameState === 'leaderboard' ? 'max-w-4xl' : 'max-w-md'}`}>
        
        {gameState === 'waiting' && (
          <div className="h-full flex flex-col items-center justify-center">
            <div className="w-12 h-12 border-2 border-gray-800 border-t-purple-500 animate-spin mb-6"></div>
            <h2 className="font-mech text-xl text-gray-400">WAITING FOR HOST</h2>
          </div>
        )}
        
        {gameState === 'playing' && activeQuestion && (
          <div className="animate-fade-in flex flex-col h-full">
            <div className="flex-none flex justify-between items-center mb-4 bg-black/50 px-4 py-3 border border-gray-800">
               <span className="text-gray-500 font-bold text-[10px] tracking-widest">TIME</span>
               <span className={`font-mech text-2xl ${timeLeft <= 3 ? 'text-red-500 animate-pulse' : 'text-purple-400'}`}>00:{timeLeft.toString().padStart(2, '0')}</span>
            </div>
            <div className="flex-1 flex items-center justify-center py-2 overflow-y-auto">
               <h2 className="text-lg sm:text-xl font-bold text-center leading-snug text-gray-100">{activeQuestion.text}</h2>
            </div>
            <div className="flex-none h-[50vh] grid grid-cols-1 gap-3 mt-4">
              {activeQuestion.options.map((opt, i) => (
                <button key={i} onClick={() => submitAnswer(i)} className="mech-btn bg-black/80 border border-gray-700 hover:border-purple-500 px-4 py-2 text-sm sm:text-base font-bold text-gray-300 text-left h-full w-full flex items-center">
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )}

        {gameState === 'done' && (
          <div className="h-full flex flex-col items-center justify-center">
            <div className="text-emerald-500 mb-4 font-mech text-3xl">LOCKED</div>
            <h2 className="text-lg font-bold text-gray-200">Answer Received</h2>
          </div>
        )}

        {gameState === 'leaderboard' && leaderboard && (
           <div className="h-full flex flex-col items-center py-4">
             <div className="flex-1 w-full overflow-hidden">
               <SharedLeaderboard />
             </div>
             <button onClick={handleExit} className="mech-btn flex-none mt-4 w-full max-w-md bg-transparent border-2 border-gray-700 py-3 text-sm font-bold">EXIT TO MENU</button>
           </div>
        )}
      </div>
    </div>
  );
}