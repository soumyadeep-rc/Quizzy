const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const redis = require('./redisClient');
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");

const app = express();
app.use(cors());

app.get('/ping', (req, res) => {
    res.status(200).send('Server is awake!');
});

// 1. Create the HTTP and Socket Server globally
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// 2. Setup Redis Pub/Sub Clients
const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();

// 3. The Async Initialization Wrapper
async function startServer() {
    try {
        // Connect Pub/Sub clients first
        await Promise.all([pubClient.connect(), subClient.connect()]);
        
        // Attach the Redis Adapter
        io.adapter(createAdapter(pubClient, subClient));

        // Socket Logic
        io.on('connection', (socket) => {
            console.log(`⚡ Player connected: ${socket.id}`);

            // HOST: Create a Room
            socket.on('create_room', async () => {
                const pin = Math.floor(100000 + Math.random() * 900000).toString();
                socket.join(pin);
                
                await redis.del(`room:${pin}:players`);
                await redis.del(`room:${pin}:leaderboard`);
                await redis.del(`room:${pin}:times`); 
                
                await redis.set(`room:${pin}:active`, "true");
                await redis.expire(`room:${pin}:active`, 86400);
                
                socket.emit('room_created', pin);
            });

            // PLAYER: Join a Room
            socket.on('join_room', async ({ pin, name }) => {
                const roomExists = await redis.get(`room:${pin}:active`);
                if (!roomExists) {
                    socket.emit('join_error', 'Invalid PIN. Room does not exist!');
                    return;
                }

                const isAdded = await redis.sadd(`room:${pin}:players`, name);
                if (isAdded === 0) {
                    socket.emit('join_error', 'Nickname is already taken! Please choose another.');
                    return; 
                }

                socket.join(pin);
                await redis.zadd(`room:${pin}:leaderboard`, 0, name);
                
                const players = await redis.smembers(`room:${pin}:players`);
                io.to(pin).emit('player_joined', players);
                socket.emit('join_success'); 
            });

            // HOST: Start a specific Question
            socket.on('start_quiz', ({ pin, customQuestion }) => {
                const startTime = Date.now();
                redis.set(`room:${pin}:correctAnswer`, customQuestion.correctAnswer);
                redis.set(`room:${pin}:maxTime`, customQuestion.timeLimit * 1000);

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

                await redis.zincrby(`room:${pin}:leaderboard`, compositeScore, name);
                await redis.hincrby(`room:${pin}:times`, name, reactionTimeMs);

                io.to(pin).emit('player_answered', name);
            });

            // GET LEADERBOARD
            socket.on('get_leaderboard', async ({ pin }) => {
                const results = await redis.zrevrange(`room:${pin}:leaderboard`, 0, 19, 'WITHSCORES');
                const leaderboard = [];
                
                for (let i = 0; i < results.length; i += 2) {
                    const playerName = results[i];
                    const score = Math.floor(parseFloat(results[i+1]));
                    
                    const totalTimeMs = await redis.hget(`room:${pin}:times`, playerName) || 0;
                    const timeDisplay = totalTimeMs > 0 ? (parseInt(totalTimeMs) / 1000).toFixed(2) + 's' : '--';
                    
                    leaderboard.push({ name: playerName, score: score, time: timeDisplay });
                }
                io.to(pin).emit('leaderboard_results', leaderboard);
            });
        });

        // 4. Start the server ONLY AFTER Redis Pub/Sub is ready
        const PORT = process.env.PORT || 5000;
        server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Game Engine running on port ${PORT}`));
        
    } catch (error) {
        console.error("❌ Failed to start server:", error);
    }
}

// 5. ACTUALLY EXECUTE THE FUNCTION!
startServer();