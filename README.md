# Quizzy - Real-time Live Quiz Platform

A high-performance, distributed live quiz application built with React, Node.js, and Redis. This platform utilizes WebSockets for real-time player interaction and Redis Sorted Sets for high-concurrency leaderboard management, including sub-millisecond tie-breaking logic and dynamic viewport scaling.

## Architecture Overview

The system has been migrated from a local Docker Compose setup to a highly scalable, distributed cloud architecture.

1. **Frontend (Vercel)**: A React SPA built with Vite and styled with Tailwind CSS. It features a custom, responsive Cyberpunk/HUD interface and handles three distinct user flows: Creator, Host (Projector View), and Player (Mobile Interface).
2. **Backend (Render)**: An Express.js server integrated with Socket.io. It serves as the real-time coordinator, managing room states, broadcasting events, and executing composite scoring calculations. 
3. **Database (Upstash)**: A managed Serverless Redis instance serves as the primary data store, handling high-throughput concurrent write operations for active room metadata, player sets, and ranked leaderboards.

## Key Technical Features

### 1. Real-time Synchronization
The application uses Socket.io to maintain full-duplex TCP communication channels. This bypasses traditional HTTP polling, ensuring that when a host launches a question, all connected players receive the payload simultaneously with millisecond latency.

### 2. Composite Scoring Algorithm
To handle high-concurrency environments where multiple players submit answers in the same millisecond, the system implements a composite scoring logic:
- Correct Answer: 1000 points.
- Tie-Breaker: (1 - (Reaction Time / Max Question Time)).
- Final Score: Base Points + Tie-Breaker.
This results in a floating-point score (e.g., 1000.85) which Redis uses to rank players with extreme precision.

### 3. State Management with Redis
- **Sets (SADD)**: Tracks unique player nicknames within a specific room PIN to prevent duplicates.
- **Sorted Sets (ZSET)**: Powers the leaderboard. Scores are stored as weights, allowing O(log(N)) updates and instantaneous retrieval of the top N players using ZREVRANGE.
- **Hashes (HSET)**: Tracks cumulative reaction times for players across multiple rounds.

### 4. Optimized Client Rendering
The UI enforces strict Flexbox boundaries (100dvh) to eliminate scrollbars during active gameplay, ensuring all interactive elements remain above the fold on mobile devices. Leaderboards dynamically fetch and render limited slices to prevent network choking.

## Project Structure

Quizzy/<br/>
├── backend/<br/>
│   ├── src/<br/>
│   │   ├── redisClient.js   # Cloud Redis connection logic<br/>
│   │   └── server.js        # Socket.io logic, scoring engine, and HTTP ping route<br/>
│   ├── Dockerfile           # Production Node.js alpine environment<br/>
│   └── package.json         # Production start scripts (Vanilla Node)<br/>
├── frontend/<br/>
│   ├── public/<br/>
│   │   └── fonts/           # Custom typography (Mechsuit.otf)<br/>
│   ├── src/<br/>
│   │   ├── App.jsx          # Main application logic and UI views<br/>
│   │   ├── index.css        # Global styles and custom clip-paths<br/>
│   │   └── socket.js        # Socket.io client configuration<br/>
│   ├── package.json<br/>
│   └── vite.config.js<br/>
└── .gitignore               # Root-level ignore<br/>

## Environment Variables

To run this application in a production environment, the following variables must be configured:

### Backend (Render)
- `REDIS_URL`: The connection string provided by Upstash (e.g., rediss://default:password@endpoint.upstash.io:port)
- `PORT`: Automatically injected by the cloud provider.

### Frontend (Vercel)
- `VITE_BACKEND_URL`: The live URL of the deployed backend server (e.g., https://your-backend.onrender.com)

## Future Roadmap

1. Transition from Redis Adapter to Apache Kafka for scaling beyond 1 million concurrent users.
2. Implementation of persistent PostgreSQL storage for historical quiz data analytics.
3. Enhanced security via JWT-based host authentication.
4. Support for media-rich question types (images/video).
