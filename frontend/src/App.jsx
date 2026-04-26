import { useState, useEffect } from 'react';
import { socket } from './socket';

export default function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [role, setRole] = useState(null); // 'creator', 'host', or 'player'
    
  // --- BUILDER STATE ---
  const [customQuestion, setCustomQuestion] = useState({
    text: "What is the capital of France?",
    options: ["Berlin", "London", "Paris", "Madrid"],
    correctAnswer: 2, // Index of 'Paris'
    timeLimit: 10 // seconds
  });

  // --- HOST STATE ---
  const [pin, setPin] = useState('');
  const [players, setPlayers] = useState([]);
  const [leaderboard, setLeaderboard] = useState(null);
  
  // --- PLAYER STATE ---
  const [name, setName] = useState('');
  const [inputPin, setInputPin] = useState('');
  const [gameState, setGameState] = useState('waiting');
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [startTime, setStartTime] = useState(0);

  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    
    socket.on('room_created', (newPin) => { setPin(newPin); setRole('host'); });
    socket.on('player_joined', setPlayers);
    socket.on('leaderboard_results', setLeaderboard);
    
    socket.on('quiz_started', (data) => {
      setActiveQuestion(data.question);
      setStartTime(data.startTime);
      setGameState('playing');
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('room_created');
      socket.off('player_joined');
      socket.off('leaderboard_results');
      socket.off('quiz_started');
    };
  }, []);

  // --- ACTIONS ---
  const startQuiz = () => {
    socket.emit('start_quiz', { pin, customQuestion });
    // Fetch leaderboard slightly after the custom time limit ends
    setTimeout(() => {
      socket.emit('get_leaderboard', { pin });
    }, (customQuestion.timeLimit * 1000) + 500); 
  };

  const submitAnswer = (index) => {
    const reactionTimeMs = Date.now() - startTime;
    socket.emit('submit_answer', { pin: inputPin, name, answerIndex: index, reactionTimeMs });
    setGameState('done');
  };

  // 1. MAIN MENU
  if (!role) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white font-sans p-4">
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
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="max-w-2xl mx-auto bg-gray-800 p-8 rounded-2xl shadow-2xl border border-gray-700">
          <h1 className="text-3xl font-black mb-8 text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500">Quiz Builder</h1>
          
          <div className="space-y-6">
            <div>
              <label className="block text-gray-400 font-bold mb-2">The Question</label>
              <input type="text" className="w-full p-4 bg-gray-900 rounded-lg border border-gray-600 text-xl font-bold" value={customQuestion.text} onChange={e => setCustomQuestion({...customQuestion, text: e.target.value})} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {customQuestion.options.map((opt, i) => (
                <div key={i} className="flex flex-col">
                  <label className="text-gray-400 text-sm font-bold mb-1 flex justify-between">
                    Option {i + 1}
                    <input type="radio" name="correctAnswer" checked={customQuestion.correctAnswer === i} onChange={() => setCustomQuestion({...customQuestion, correctAnswer: i})} className="w-4 h-4 cursor-pointer" />
                  </label>
                  <input type="text" className={`p-3 bg-gray-900 rounded-lg border ${customQuestion.correctAnswer === i ? 'border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]' : 'border-gray-600'}`} value={opt} onChange={e => {
                    const newOpts = [...customQuestion.options];
                    newOpts[i] = e.target.value;
                    setCustomQuestion({...customQuestion, options: newOpts});
                  }} />
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center pt-6 border-t border-gray-700">
              <div className="flex items-center gap-4">
                <label className="text-gray-400 font-bold">Time Limit (seconds):</label>
                <input type="number" min="5" max="60" className="p-2 w-20 bg-gray-900 border border-gray-600 rounded text-center font-bold text-xl" value={customQuestion.timeLimit} onChange={e => setCustomQuestion({...customQuestion, timeLimit: parseInt(e.target.value)})} />
              </div>
              
              <button onClick={() => socket.emit('create_room')} className="bg-purple-600 hover:bg-purple-500 font-black px-8 py-4 rounded-xl text-xl transition-all shadow-lg">
                Save & Generate PIN 🚀
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 3. HOST PROJECTOR VIEW
  if (role === 'host') {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        {!leaderboard ? (
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl text-gray-400 mb-2">Join at <span className="font-bold text-white">127.0.0.1:5173</span> with PIN:</h2>
            <h1 className="text-8xl font-black tracking-widest mb-12 text-blue-400">{pin}</h1>
            <button onClick={startQuiz} className="bg-green-500 hover:bg-green-400 text-black font-black text-2xl py-4 px-12 rounded-full mb-12 shadow-[0_0_30px_rgba(34,197,94,0.3)] hover:scale-105 transition-all">LAUNCH QUESTION</button>
            <div className="flex flex-wrap justify-center gap-3">
              {players.map((p, i) => <span key={i} className="bg-gray-800 px-6 py-3 rounded-lg text-xl font-bold animate-fade-in">{p}</span>)}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto">
            <h1 className="text-5xl font-black text-center mb-8 text-yellow-400">LEADERBOARD</h1>
            <div className="space-y-4">
              {leaderboard.map((player, i) => (
                <div key={i} className="flex justify-between items-center bg-gray-800 p-6 rounded-xl text-2xl font-bold border border-gray-700">
                  <span className="flex items-center gap-4"><span className="text-gray-500 text-xl">#{i + 1}</span> {player.name}</span>
                  <span className="text-blue-400">{player.score} pts</span>
                </div>
              ))}
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
              <button key={i} onClick={() => submitAnswer(i)} className="bg-blue-600 hover:bg-blue-500 active:scale-95 p-6 rounded-xl text-xl font-bold transition-all shadow-lg">
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}

      {gameState === 'done' && <h2 className="text-3xl font-bold text-center text-green-400">Answer Submitted! Look at the main screen.</h2>}
    </div>
  );
}