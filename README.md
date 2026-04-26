# Quizzy - Real-time Live Quiz Platform

A high-performance, containerized live quiz application built with React, Node.js, and Redis. This platform utilizes WebSockets for real-time player interaction and Redis Sorted Sets for high-concurrency leaderboard management, including sub-millisecond tie-breaking logic.

## Architecture Overview

The system is designed as a microservices-based monorepo, orchestrated via Docker Compose.

1. **Frontend**: A React SPA built with Vite and styled with Tailwind CSS. It handles three distinct user flows: Creator (Quiz Building), Host (Projector View), and Player (Mobile Interface).
2. **Backend**: An Express.js server integrated with Socket.io. It serves as the real-time coordinator, managing room states and broadcasting events.
3. **Database**: Redis serves as the primary data store. It manages active room metadata, player sets, and ranked leaderboards using Sorted Sets (ZSET).

## Key Technical Features

### 1. Real-time Synchronization
The application uses Socket.io to maintain full-duplex communication channels. This ensures that when a host launches a question, all connected players receive the payload simultaneously, and player join events are reflected instantly on the host lobby.

### 2. Composite Scoring Algorithm
To handle high-concurrency environments where multiple players might answer correctly at nearly the same time, the system implements a composite scoring logic:
- Correct Answer: 1000 points.
- Tie-Breaker: (1 - (Reaction Time / Max Question Time)).
- Final Score: Base Points + Tie-Breaker.
This results in a floating-point score (e.g., 1000.85) which Redis uses to rank players with sub-millisecond precision.

### 3. State Management with Redis
- **Sets (SADD)**: Used to track unique player nicknames within a specific room PIN.
- **Sorted Sets (ZSET)**: Used for the leaderboard. Scores are stored as weights, allowing O(log(N)) updates and retrievals.
- **Hashes (HSET)**: Used to track cumulative reaction times for players across multiple rounds.

## Project Structure

Quizzy/<br/>
├── backend/<br/>
│   ├── src/<br/>
│   │   ├── redisClient.js   # Redis connection configuration<br/>
│   │   └── server.js        # Socket.io logic and scoring engine<br/>
│   ├── Dockerfile           # Node.js alpine environment<br/>
│   └── package.json<br/>
├── frontend/<br/>
│   ├── src/<br/>
│   │   ├── App.jsx          # Main application logic and UI views<br/>
│   │   └── socket.js        # Socket.io client configuration<br/>
│   ├── package.json<br/>
│   └── vite.config.js<br/>
├── docker-compose.yml       # Orchestration for Node and Redis services<br/>
└── .gitignore               # Root-level ignore for node_modules and env<br/>

## Setup and Installation

### Prerequisites

- Docker Desktop with WSL 2 integration enabled.
- Node.js (for local frontend development).

### Deployment Steps

- Initialize the Environment: Navigate to the root directory and ensure Docker is running.
- Build and Start Containers: ```docker compose up --build```<br/>
This command pulls the Redis Alpine image, builds the backend Node image, and establishes the internal Docker network.

- Start the Frontend:<br/>
```cd frontend```<br/>
```npm install```<br/>
```npm run dev```<br/>

- Access the Application: <br/>
Host/Creator: ```http://localhost:5173```<br/>

## Development Notes
### WSL 2 Networking
- The application is configured to use the IPv4 loopback address (127.0.0.1) to ensure seamless communication between the Windows browser and the WSL 2 Docker daemon.

### File Watching
- The backend uses Nodemon with the legacy watch flag ```-L``` to ensure file changes made in the Windows environment are correctly detected within the Linux container.

## Future Roadmap
1. Implementation of persistent PostgreSQL storage for historical quiz data.<br/>
2. Enhanced security via JWT-based host authentication.<br/>
3. Support for media-rich question types (images/video).<br/>
