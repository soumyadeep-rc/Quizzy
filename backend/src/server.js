const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const redis = require('./redisClient');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Remove the hardcoded QUESTION!

io.on('connection', (socket) => {
    console.log(`⚡ Player connected: ${socket.id}`);

    // HOST: Create a Room
    socket.on('create_room', async () => {
        const pin = Math.floor(100000 + Math.random() * 900000).toString();
        socket.join(pin);
        await redis.del(`room:${pin}:players`);
        await redis.del(`room:${pin}:leaderboard`);
        socket.emit('room_created', pin);
    });

    // PLAYER: Join a Room
    socket.on('join_room', async ({ pin, name }) => {
        socket.join(pin);
        await redis.sadd(`room:${pin}:players`, name);
        const players = await redis.smembers(`room:${pin}:players`);
        io.to(pin).emit('player_joined', players);
    });

    // HOST: Start the Custom Quiz
    socket.on('start_quiz', ({ pin, customQuestion }) => {
        const startTime = Date.now();
        // Save the current correct answer in Redis securely so players can't inspect the network tab to cheat!
        redis.set(`room:${pin}:correctAnswer`, customQuestion.correctAnswer);
        redis.set(`room:${pin}:maxTime`, customQuestion.timeLimit * 1000);

        // Strip the correct answer out before broadcasting to players
        const safeQuestion = {
            text: customQuestion.text,
            options: customQuestion.options,
            timeLimit: customQuestion.timeLimit
        };

        io.to(pin).emit('quiz_started', { question: safeQuestion, startTime });
    });

    // PLAYER: Submit Answer
    socket.on('submit_answer', async ({ pin, name, answerIndex, reactionTimeMs }) => {
        // Fetch the correct answer and max time from Redis
        const correctAnswer = parseInt(await redis.get(`room:${pin}:correctAnswer`));
        const maxTimeMs = parseInt(await redis.get(`room:${pin}:maxTime`));

        const isCorrect = (answerIndex === correctAnswer);
        const basePoints = isCorrect ? 1000 : 0;
        
        // COMPOSITE SCORING! 
        const timeFraction = Math.max(0, 1 - (reactionTimeMs / maxTimeMs));
        const compositeScore = basePoints + (isCorrect ? timeFraction : 0);

        await redis.zincrby(`room:${pin}:leaderboard`, compositeScore, name);
        io.to(pin).emit('player_answered', name);
    });

    // HOST: Get Final Leaderboard
    socket.on('get_leaderboard', async ({ pin }) => {
        const results = await redis.zrevrange(`room:${pin}:leaderboard`, 0, 9, 'WITHSCORES');
        const leaderboard = [];
        for (let i = 0; i < results.length; i += 2) {
            leaderboard.push({
                name: results[i],
                score: Math.floor(parseFloat(results[i+1])) // Hide the tie-breaker decimals!
            });
        }
        io.to(pin).emit('leaderboard_results', leaderboard);
    });
});

server.listen(3000, '0.0.0.0', () => console.log(`🚀 Game Engine running on port 3000`));