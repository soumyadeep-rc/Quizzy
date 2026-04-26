import { useState, useEffect } from 'react';
import { socket } from './socket';

export default function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [role, setRole] = useState(null); 
    
  // --- BUILDER STATE (Now an Array!) ---
  const [questions, setQuestions] = useState([{
    text: "What is the capital of France?",
    options: ["Berlin", "London", "Paris", "Madrid"],
    correctAnswer: 2,
    timeLimit: 10
  }]);

  // --- HOST STATE ---
  const [pin, setPin] = useState('');
  const [players, setPlayers] = useState([]);
  const [leaderboard, setLeaderboard] = useState(null);
  const [hostState, setHostState] = useState('lobby'); // 'lobby', 'question_live', 'leaderboard'
  const [currentQIndex, setCurrentQIndex] = useState(0);
  
  // --- PLAYER STATE ---
  const [name, setName] = useState('');
  const [inputPin, setInputPin] = useState('');
  const [gameState, setGameState] = useState('waiting');
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [startTime, setStartTime] = useState(0);

  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    
    socket.on('room_created', (newPin) => { setPin(newPin); setRole('host'); setHostState('lobby'); });
    socket.on('player_joined', setPlayers);
    socket.on('leaderboard_results', (results) => {
        setLeaderboard(results);
        setHostState('leaderboard');
    });
    
    // Player listens for new questions
    socket.on('quiz_started', (data) => {
      setActiveQuestion(data.question);
      setStartTime(data.startTime);
      setGameState('playing');
    });

    return () => {
      socket.off('connect'); socket.off('disconnect'); socket.off('room_created');
      socket.off('player_joined'); socket.off('leaderboard_results'); socket.off('quiz_started');
    };
  }, []);

  // --- ACTIONS ---
  const launchQuestion = (index) => {
    setHostState('question_live');
    const q = questions[index];
    socket.emit('start_quiz', { pin, customQuestion: q });
    
    // Auto-fetch leaderboard after this specific question's timer ends
    setTimeout(() => {
      socket.emit('get_leaderboard', { pin });
    }, (q.timeLimit * 1000) + 500); 
  };

  const submitAnswer = (index) => {
    const reactionTimeMs = Date.now() - startTime;
    socket.emit('submit_answer', { pin: inputPin, name, answerIndex: index, reactionTimeMs });
    setGameState('done');
  };

  // --- HELPER FUNCTIONS FOR CREATOR ---
  const addQuestion = () => {
    setQuestions([...questions, { text: "New Question", options: ["A", "B", "C", "D"], correctAnswer: 0, timeLimit: 10 }]);
  };

  // 1. MAIN MENU
  if (!role) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
        <div className={`fixed top-4 left-4 px-4 py-2 rounded-full font-bold shadow-lg border ${isConnected ? 'bg-green-500/20 text-green-400 border-green-500' : 'bg-red-500/20 text-red-400 border-red-500'}`}>
          {isConnected ? '🟢 Server Connected' : '🔴 Server Offline'}
        </div>
        <h1 className="text-6xl font-black mb-8 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">QUIZZY</h1>
        
        <div className="space-y-6 w-full max-w-sm">
          <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
            <h2 className="text-xl font-bold mb-4">Join as Player</h2>
            <input className="w-full p-3 mb-3 bg-gray-900 rounded border border-gray-600 focus:border-blue-500 outline-none" placeholder="Room PIN" value={inputPin} onChange={e => setInputPin(e.target.value)} />
            <input className="w-full p-3 mb-4 bg-gray-900 rounded border border-gray-600 focus:border-blue-500 outline-none" placeholder="Nickname" value={name} onChange={e => setName(e.target.value)} />
            <button onClick={() => { setRole('player'); socket.emit('join_room', { pin: inputPin, name }); }} className="w-full bg-blue-600 hover:bg-blue-500 font-bold py-3 rounded transition-colors">Enter Room</button>
          </div>
          <button onClick={() => setRole('creator')} className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold py-4 rounded-xl border border-gray-700 transition-colors">Create a Custom Game</button>
        </div>
      </div>
    );
  }

  // 2. QUIZ CREATOR VIEW
  if (role === 'creator') {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8 overflow-y-auto">
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="flex justify-between items-center bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-2xl sticky top-0 z-10">
              <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500">Quiz Builder</h1>
              <button onClick={() => socket.emit('create_room')} className="bg-purple-600 hover:bg-purple-500 font-black px-8 py-3 rounded-xl text-xl shadow-[0_0_20px_rgba(147,51,234,0.4)] transition-all">Launch Game 🚀</button>
          </div>

          {questions.map((q, qIndex) => (
            <div key={qIndex} className="bg-gray-800 p-8 rounded-2xl shadow-xl border border-gray-700">
              <h2 className="text-xl font-bold text-gray-400 mb-4">Question {qIndex + 1}</h2>
              <input type="text" className="w-full p-4 mb-6 bg-gray-900 rounded-lg border border-gray-600 text-xl font-bold focus:border-blue-500 outline-none" value={q.text} 
                onChange={e => { const newQs = [...questions]; newQs[qIndex].text = e.target.value; setQuestions(newQs); }} />
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                {q.options.map((opt, oIndex) => (
                  <div key={oIndex} className="flex flex-col">
                    <label className="text-gray-400 text-sm font-bold mb-1 flex justify-between items-center">
                      Option {oIndex + 1}
                      <input type="radio" name={`correctAnswer-${qIndex}`} checked={q.correctAnswer === oIndex} onChange={() => { const newQs = [...questions]; newQs[qIndex].correctAnswer = oIndex; setQuestions(newQs); }} className="w-5 h-5 cursor-pointer accent-green-500" />
                    </label>
                    <input type="text" className={`p-3 bg-gray-900 rounded-lg border ${q.correctAnswer === oIndex ? 'border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.2)]' : 'border-gray-600'} focus:outline-none`} value={opt} 
                      onChange={e => { const newQs = [...questions]; newQs[qIndex].options[oIndex] = e.target.value; setQuestions(newQs); }} />
                  </div>
                ))}
              </div>
              
              <div className="flex items-center gap-4">
                <label className="text-gray-400 font-bold">Timer (sec):</label>
                <input type="number" className="p-2 w-20 bg-gray-900 border border-gray-600 rounded text-center font-bold text-xl" value={q.timeLimit} onChange={e => { const newQs = [...questions]; newQs[qIndex].timeLimit = parseInt(e.target.value); setQuestions(newQs); }} />
              </div>
            </div>
          ))}
          
          <button onClick={addQuestion} className="w-full bg-gray-800 hover:bg-gray-700 border-2 border-dashed border-gray-600 text-gray-400 font-bold py-6 rounded-2xl text-xl transition-all">+ Add Another Question</button>
        </div>
      </div>
    );
  }

  // 3. HOST PROJECTOR VIEW
  if (role === 'host') {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8 flex flex-col items-center justify-center">
        
        {hostState === 'lobby' && (
          <div className="max-w-4xl w-full text-center animate-fade-in">
            <h2 className="text-3xl text-gray-400 mb-2">Join at <span className="font-bold text-white">127.0.0.1:5173</span> with PIN:</h2>
            <h1 className="text-[120px] leading-none font-black tracking-widest mb-12 text-blue-400 drop-shadow-[0_0_40px_rgba(96,165,250,0.3)]">{pin}</h1>
            <button onClick={() => launchQuestion(0)} className="bg-green-500 hover:bg-green-400 text-black font-black text-3xl py-6 px-16 rounded-full mb-12 shadow-[0_0_50px_rgba(34,197,94,0.4)] hover:scale-105 transition-all">START GAME</button>
            <div className="flex flex-wrap justify-center gap-4">
              {players.map((p, i) => <span key={i} className="bg-gray-800 px-6 py-3 rounded-lg text-2xl font-bold">{p}</span>)}
            </div>
          </div>
        )}

        {hostState === 'question_live' && (
           <div className="text-center animate-fade-in">
             <h2 className="text-5xl font-black text-yellow-400 animate-pulse mb-4">Question {currentQIndex + 1} is Live!</h2>
             <p className="text-2xl text-gray-400">Look at the player devices...</p>
           </div>
        )}

        {hostState === 'leaderboard' && leaderboard && (
          <div className="max-w-4xl w-full animate-fade-in">
            <h1 className="text-6xl font-black text-center mb-12 text-yellow-400 drop-shadow-[0_0_20px_rgba(250,204,21,0.3)]">LEADERBOARD</h1>
            <div className="space-y-4 mb-12">
              {leaderboard.map((player, i) => (
                <div key={i} className="flex justify-between items-center bg-gray-800 p-6 rounded-2xl text-3xl font-bold border border-gray-700 shadow-lg">
                  <span className="flex items-center gap-6"><span className="text-gray-500 w-12">#{i + 1}</span> {player.name}</span>
                  <div className="flex items-center gap-8">
                    <span className="text-gray-400 text-xl font-normal">⏱️ {player.time}</span>
                    <span className="text-blue-400 w-32 text-right">{player.score} pts</span>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="text-center">
              {currentQIndex < questions.length - 1 ? (
                <button onClick={() => {
                  const nextIndex = currentQIndex + 1;
                  setCurrentQIndex(nextIndex);
                  launchQuestion(nextIndex);
                }} className="bg-blue-600 hover:bg-blue-500 text-white font-black text-2xl py-4 px-12 rounded-full shadow-[0_0_30px_rgba(37,99,235,0.4)] transition-all">
                  Next Question ➡️
                </button>
              ) : (
                <h2 className="text-4xl font-black text-green-400">🏆 Quiz Complete!</h2>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // 4. PLAYER MOBILE VIEW
  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 flex flex-col justify-center max-w-md mx-auto">
      {gameState === 'waiting' && <h2 className="text-3xl font-bold text-center animate-pulse text-gray-400">Waiting for Host...</h2>}
      
      {gameState === 'playing' && (
        <div className="animate-fade-in">
          <h2 className="text-2xl font-bold mb-8 text-center">{activeQuestion.text}</h2>
          <div className="grid grid-cols-1 gap-4">
            {activeQuestion.options.map((opt, i) => (
              <button key={i} onClick={() => submitAnswer(i)} className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 p-6 rounded-xl text-xl font-bold transition-colors shadow-lg active:scale-95">
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}

      {gameState === 'done' && <h2 className="text-3xl font-bold text-center text-green-400 animate-fade-in">Answer Submitted! Look at the main screen.</h2>}
    </div>
  );
}