const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const redis = require('./redisClient');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

io.on('connection', (socket) => {
    console.log(`⚡ Player connected: ${socket.id}`);

    // HOST: Create a Room
    socket.on('create_room', async () => {
        const pin = Math.floor(100000 + Math.random() * 900000).toString();
        socket.join(pin);
        
        // Clean slate for the new room
        await redis.del(`room:${pin}:players`);
        await redis.del(`room:${pin}:leaderboard`);
        await redis.del(`room:${pin}:times`); 
        
        // NEW: Set an "active" flag in Redis so we know this room exists
        await redis.set(`room:${pin}:active`, "true");
        await redis.expire(`room:${pin}:active`, 86400); // Auto-delete room after 24 hours
        
        socket.emit('room_created', pin);
    });

    // PLAYER: Join a Room
    socket.on('join_room', async ({ pin, name }) => {
        // NEW: Check if the room actually exists in Redis first!
        const roomExists = await redis.get(`room:${pin}:active`);
        
        if (!roomExists) {
            // Reject the player with an error
            socket.emit('join_error', 'Invalid PIN. Room does not exist!');
            return;
        }

        socket.join(pin);
        await redis.sadd(`room:${pin}:players`, name);
        await redis.zadd(`room:${pin}:leaderboard`, 0, name);
        const players = await redis.smembers(`room:${pin}:players`);
        io.to(pin).emit('player_joined', players);
        
        // Tell this specific player they are allowed in
        socket.emit('join_success'); 
    });
    // HOST: Start a specific Question
    socket.on('start_quiz', ({ pin, customQuestion }) => {
        const startTime = Date.now();
        // Save answers securely in Redis
        redis.set(`room:${pin}:correctAnswer`, customQuestion.correctAnswer);
        redis.set(`room:${pin}:maxTime`, customQuestion.timeLimit * 1000);

        // Send a safe version to the players
        const safeQuestion = {
            text: customQuestion.text,
            options: customQuestion.options,
            timeLimit: customQuestion.timeLimit
        };

        io.to(pin).emit('quiz_started', { question: safeQuestion, startTime });
    });

    // PLAYER: Submit Answer
    socket.on('submit_answer', async ({ pin, name, answerIndex, reactionTimeMs }) => {
        const correctAnswer = parseInt(await redis.get(`room:${pin}:correctAnswer`));
        const maxTimeMs = parseInt(await redis.get(`room:${pin}:maxTime`));

        const isCorrect = (answerIndex === correctAnswer);
        const basePoints = isCorrect ? 1000 : 0;
        
        const timeFraction = Math.max(0, 0.0001 * (1 - (reactionTimeMs / maxTimeMs)));
        const compositeScore = basePoints + (isCorrect ? timeFraction : 0);

        // 1. Add points to Leaderboard
        await redis.zincrby(`room:${pin}:leaderboard`, compositeScore, name);
        
        // 2. NEW: Track cumulative time in a Redis Hash
        await redis.hincrby(`room:${pin}:times`, name, reactionTimeMs);

        io.to(pin).emit('player_answered', name);
    });

    socket.on('get_leaderboard', async ({ pin }) => {
    
        const results = await redis.zrevrange(`room:${pin}:leaderboard`, 0, -1, 'WITHSCORES');
        const leaderboard = [];
        
        for (let i = 0; i < results.length; i += 2) {
            const playerName = results[i];
            const score = Math.floor(parseFloat(results[i+1]));
            
            const totalTimeMs = await redis.hget(`room:${pin}:times`, playerName) || 0;
            
            // NEW: If they didn't answer, show '--' instead of '0.00s'
            const timeDisplay = totalTimeMs > 0 ? (parseInt(totalTimeMs) / 1000).toFixed(2) + 's' : '--';
            
            leaderboard.push({
                name: playerName,
                score: score,
                time: timeDisplay
            });
        }
        io.to(pin).emit('leaderboard_results', leaderboard);
    });
});

server.listen(3000, '0.0.0.0', () => console.log(`🚀 Game Engine running on port 3000`));