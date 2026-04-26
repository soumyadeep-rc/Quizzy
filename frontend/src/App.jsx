import { useState, useEffect } from 'react';
import { socket } from './socket';

export default function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [role, setRole] = useState(null); // 'host' or 'player'
    
  // Host State
  const [pin, setPin] = useState('');
  const [players, setPlayers] = useState([]);
  const [leaderboard, setLeaderboard] = useState(null);
  
  // Player State
  const [name, setName] = useState('');
  const [inputPin, setInputPin] = useState('');
  const [gameState, setGameState] = useState('waiting'); // 'waiting', 'playing', 'done'
  const [question, setQuestion] = useState(null);
  const [startTime, setStartTime] = useState(0);

  useEffect(() => {
    // 0. Connection Listeners
    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    // 1. Define the specific game listener functions
    const onRoomCreated = (newPin) => {
      console.log("🎯 FRONTEND: Received PIN from server:", newPin);
      setPin(newPin);
    };
    
    const onPlayerJoined = (playerList) => setPlayers(playerList);
    const onLeaderboard = (results) => setLeaderboard(results);
    const onQuizStarted = (data) => {
      setQuestion(data.question);
      setStartTime(data.startTime);
      setGameState('playing');
    };

    // 2. Attach the listeners
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room_created', onRoomCreated);
    socket.on('player_joined', onPlayerJoined);
    socket.on('leaderboard_results', onLeaderboard);
    socket.on('quiz_started', onQuizStarted);

    // 3. Cleanly remove the EXACT listeners on unmount
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room_created', onRoomCreated);
      socket.off('player_joined', onPlayerJoined);
      socket.off('leaderboard_results', onLeaderboard);
      socket.off('quiz_started', onQuizStarted);
    };
  }, []);

  // --- HOST ACTIONS ---
  const createRoom = () => {
    setRole('host');
    socket.emit('create_room');
  };

  const startQuiz = () => {
    socket.emit('start_quiz', { pin });
    setTimeout(() => {
      socket.emit('get_leaderboard', { pin });
    }, 10500); // Fetch leaderboard right after 10s timer ends
  };

  // --- PLAYER ACTIONS ---
  const joinRoom = () => {
    setRole('player');
    socket.emit('join_room', { pin: inputPin, name });
  };

  const submitAnswer = (index) => {
    const reactionTimeMs = Date.now() - startTime;
    socket.emit('submit_answer', { pin: inputPin, name, answerIndex: index, reactionTimeMs });
    setGameState('done');
  };

  // --- UI RENDERING ---
  if (!role) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white font-sans p-4">
        
        {/* CONNECTION INDICATOR */}
        <div className={`fixed top-4 left-4 px-4 py-2 rounded-full font-bold shadow-lg border ${isConnected ? 'bg-green-500/20 text-green-400 border-green-500' : 'bg-red-500/20 text-red-400 border-red-500'}`}>
          {isConnected ? '🟢 Connected to Server' : '🔴 Disconnected'}
        </div>

        <h1 className="text-6xl font-black mb-8 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">QUIZZY</h1>
        <div className="space-y-4 w-full max-w-sm">
          <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
            <h2 className="text-xl font-bold mb-4">Join a Game</h2>
            <input className="w-full p-3 mb-3 bg-gray-900 rounded border border-gray-600 text-white" placeholder="Room PIN" value={inputPin} onChange={e => setInputPin(e.target.value)} />
            <input className="w-full p-3 mb-4 bg-gray-900 rounded border border-gray-600 text-white" placeholder="Nickname" value={name} onChange={e => setName(e.target.value)} />
            <button onClick={joinRoom} className="w-full bg-blue-600 hover:bg-blue-500 font-bold py-3 rounded transition-colors">Enter</button>
          </div>
          <button onClick={createRoom} className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold py-4 rounded-xl border border-gray-700 transition-colors">Host a Game</button>
        </div>
      </div>
    );
  }

  // --- HOST VIEW ---
  if (role === 'host') {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        {!leaderboard ? (
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl text-gray-400 mb-2">Join at <span className="font-bold text-white">127.0.0.1:5173</span> with PIN:</h2>
            <h1 className="text-8xl font-black tracking-widest mb-12 text-blue-400">{pin}</h1>
            <button onClick={startQuiz} className="bg-green-500 hover:bg-green-400 text-black font-black text-2xl py-4 px-12 rounded-full mb-12 shadow-[0_0_30px_rgba(34,197,94,0.3)] transition-all">START QUIZ</button>
            <div className="flex flex-wrap justify-center gap-3">
              {players.map((p, i) => <span key={i} className="bg-gray-800 px-6 py-3 rounded-lg text-xl font-bold">{p}</span>)}
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

  // --- PLAYER VIEW ---
  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 flex flex-col justify-center max-w-md mx-auto">
      {gameState === 'waiting' && <h2 className="text-3xl font-bold text-center animate-pulse">Waiting for host...</h2>}
      
      {gameState === 'playing' && (
        <div className="animate-fade-in">
          <h2 className="text-2xl font-bold mb-8 text-center">{question.text}</h2>
          <div className="grid grid-cols-1 gap-4">
            {question.options.map((opt, i) => (
              <button key={i} onClick={() => submitAnswer(i)} className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 p-6 rounded-xl text-xl font-bold transition-colors">
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