const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const redis = require('./redisClient');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Hardcoded question for the MVP
const QUESTION = {
    text: "What does Redis stand for?",
    options: ["Remote Dictionary Server", "Realtime Database", "Relational Data Store", "Random Data Syntax"],
    correctAnswer: 0,
    maxTimeMs: 10000
};

io.on('connection', (socket) => {
    console.log(`⚡ Player connected: ${socket.id}`);

    // HOST: Create a Room
    // HOST: Create a Room
    socket.on('create_room', async () => {
        console.log(`🛠️ Backend: Host requested to create a room...`);
        try {
            const pin = Math.floor(100000 + Math.random() * 900000).toString(); 
            socket.join(pin);
            
            // Clear old room data
            await redis.del(`room:${pin}:players`);
            await redis.del(`room:${pin}:leaderboard`);
            
            console.log(`✅ Backend: Room ${pin} created! Sending back to frontend...`);
            socket.emit('room_created', pin);
        } catch (error) {
            console.error(`❌ Backend Redis Error during room creation:`, error);
        }
    });

    // PLAYER: Join a Room
    socket.on('join_room', async ({ pin, name }) => {
        socket.join(pin);
        await redis.sadd(`room:${pin}:players`, name); // Add to Redis Set
        
        // Notify the host that someone joined
        const players = await redis.smembers(`room:${pin}:players`);
        io.to(pin).emit('player_joined', players);
    });

    // HOST: Start the Quiz
    socket.on('start_quiz', ({ pin }) => {
        const startTime = Date.now();
        // Broadcast the question to everyone in the room
        io.to(pin).emit('quiz_started', { question: QUESTION, startTime });
    });

    // PLAYER: Submit Answer
    socket.on('submit_answer', async ({ pin, name, answerIndex, reactionTimeMs }) => {
        const isCorrect = (answerIndex === QUESTION.correctAnswer);
        const basePoints = isCorrect ? 1000 : 0;
        
        // COMPOSITE SCORING (Breaks ties using reaction time)
        const timeFraction = Math.max(0, 1 - (reactionTimeMs / QUESTION.maxTimeMs));
        const compositeScore = basePoints + (isCorrect ? timeFraction : 0);

        // Add to Redis Sorted Set
        await redis.zincrby(`room:${pin}:leaderboard`, compositeScore, name);
        
        // Notify host that this player answered
        io.to(pin).emit('player_answered', name);
    });

    // HOST: Get Final Leaderboard
    socket.on('get_leaderboard', async ({ pin }) => {
        // Fetch top 5, highest score first
        const results = await redis.zrevrange(`room:${pin}:leaderboard`, 0, 4, 'WITHSCORES');
        
        const leaderboard = [];
        for (let i = 0; i < results.length; i += 2) {
            leaderboard.push({
                name: results[i],
                // Math.floor removes the decimal tie-breaker for the UI
                score: Math.floor(parseFloat(results[i+1])) 
            });
        }
        
        io.to(pin).emit('leaderboard_results', leaderboard);
    });
});

// Force the server to listen on all network interfaces inside Docker
const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Game Engine running on port ${PORT}`);
});