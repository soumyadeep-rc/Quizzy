# Quizzy — Real-Time Live Quiz Platform

Quizzy is a real-time, event-driven quiz platform built to eliminate the latency and inefficiency of traditional HTTP polling. Using persistent WebSocket connections (Socket.io) and a serverless Redis backend, Quizzy delivers millisecond-level synchronization between a host and thousands of simultaneous players, complete with a mathematically precise, tie-break-aware leaderboard.

**Live Demo:** [https://quizzy-src.vercel.app/](https://quizzy-src.vercel.app/)

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [System Flow](#system-flow)
- [Key Technical Features](#key-technical-features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)
- [Current Bottlenecks & Future Roadmap](#current-bottlenecks--future-roadmap)
- [License](#license)

---

## Overview

Quizzy is a stateless, horizontally-scalable microservices application. Instead of relying on the backend server to hold game state in local memory (which breaks the moment you scale to multiple instances), Quizzy offloads **all** game state — quiz content, room status, player lists, and rankings — to a serverless Redis instance. This keeps every backend container interchangeable and disposable, which is essential for horizontal scaling.

The standout engineering piece is the **Composite Scoring Algorithm**. Redis Sorted Sets (`ZSET`) only sort by a single numeric score, but Quizzy needs to rank on two dimensions at once: points earned *and* how fast the player answered. To solve this without a second query or client-side re-sorting, the backend mathematically packs both signals into a single floating-point number:

```
Composite Score = Base Points + (1 - (Reaction Time / Max Question Time))
```

Since the fractional bonus is always between 0 and 1, it never overtakes a full point value — so players are always ranked by correctness first, and reaction speed acts as a natural, built-in tie-breaker. A correct, near-instant answer might score `1000.98`, while a correct-but-slow answer scores `1000.10` — both outrank any incorrect answer, and Redis resolves the ranking in a single `O(log N)` operation.

---

## Architecture

Quizzy runs a **stateless Tri-Platform Cloud Architecture**, with each layer deployed independently:

| Layer | Platform | Responsibility |
|---|---|---|
| **Frontend** | Vercel | React + Vite SPA; Creator, Host (Projector), and Player (Mobile) views |
| **Backend** | Render | Node.js + Express + Socket.io; scoring engine, room orchestration, Pub/Sub |
| **Database** | Upstash | Serverless/Edge Redis; game state, Sets, Hashes, Sorted Sets (ZSET) |

Locally, the same three services are orchestrated via **Docker Compose**, isolating environment dependencies (like Alpine Linux versions) and using watch-polling to bridge file synchronization issues across WSL 2.

---

## System Flow

The diagram below traces a full game lifecycle — from quiz creation to the final podium — across the frontend, backend, and Redis layers.

```mermaid
flowchart TD
    subgraph Creation[" 1. Creation Phase — The Host"]
        A1[Host creates quiz via React frontend] --> A2[Backend generates unique 6-digit PIN]
        A2 --> A3[("Redis HSET: store quiz data + room status")]
    end

    subgraph Waiting[" 2. Waiting Room Phase — The Players"]
        B1[Player enters PIN] --> B2[WebSocket connection opened with backend]
        B2 --> B3[Backend validates PIN]
        B3 --> B4[("Redis SADD: add nickname, prevent duplicates")]
        B4 --> B5[("Redis ZADD: initialize player at 0 points")]
        B5 --> B6[Backend emits join-confirmation to Host screen]
    end

    subgraph Start[" 3. Synchronous Start Phase"]
        C1[Host clicks 'Start Quiz'] --> C2[("Redis: room status set to 'active'")]
        C2 --> C3[("Redis Pub/Sub: broadcast START event")]
        C3 --> C4[Every subscribed WebSocket in room fires simultaneously]
        C4 --> C5[Timers start in perfect sync across all clients]
    end

    subgraph Answering[" 4. Answering & Scoring Phase"]
        D1[Player submits answer + reaction time via WebSocket] --> D2[Backend verifies answer against Redis Hash]
        D2 -->|Correct| D3[Calculate Composite Score:<br/>Base Points + Time-Fraction Bonus]
        D2 -->|Incorrect| D6[No score awarded]
        D3 --> D4[("Redis ZINCRBY: update leaderboard score")]
        D3 --> D5[("Redis HINCRBY: track cumulative reaction time")]
    end

    subgraph Results[" 5. Results Phase"]
        E1[Master timer hits zero] --> E2[("Redis ZREVRANGE 0 -1: pull full ranked leaderboard")]
        E2 --> E3[Backend emits final rankings via WebSocket]
        E3 --> E4[Host screen renders the final podium]
    end

    A3 --> B1
    B6 --> C1
    C5 --> D1
    D4 --> E1
    D5 --> E1
    D6 --> E1
```

---

## Key Technical Features

### 1. Real-Time Synchronization
Socket.io maintains persistent, full-duplex TCP connections between every client and the backend, entirely bypassing HTTP polling. When a host launches a question, every connected player receives the payload at the exact same millisecond via Redis Pub/Sub — critical for a fair, synchronized timer across all devices.

### 2. Composite Scoring Algorithm
- **Correct answer:** 1000 base points
- **Tie-breaker bonus:** `1 - (Reaction Time / Max Question Time)`
- **Final score:** `Base Points + Tie-Breaker` (e.g. `1000.85`)

Because the result is a single float, Redis Sorted Sets can rank all players with one command, at `O(log N)` complexity, with mathematically perfect tie resolution — no secondary sort or app-level logic required.

### 3. State Management with Redis
| Redis Structure | Command(s) | Purpose |
|---|---|---|
| Hash | `HSET` | Store quiz questions/answers; track cumulative reaction time (`HINCRBY`) |
| Set | `SADD` | Enforce unique player nicknames per room |
| Sorted Set | `ZADD`, `ZINCRBY`, `ZREVRANGE` | Real-time leaderboard with O(log N) ranked updates |
| Pub/Sub | `PUBLISH` / `SUBSCRIBE` | Broadcast synchronized START events to all room subscribers |

### 4. Optimized Client Rendering
The frontend enforces strict viewport boundaries (`h-[100dvh]`) to eliminate scroll drift and keep all interactive elements above the fold on mobile — critical during timed gameplay. Leaderboards fetch and render limited slices rather than the full player list to avoid network choking at scale.

### 5. Cyberpunk HUD Aesthetic
A custom, locally-hosted `Mechsuit.otf` font paired with a dark theme, tactile click effects, and custom clip-paths gives the UI a distinct sci-fi/HUD feel across all three views (Creator, Host, Player).

---

## Tech Stack

**Frontend**
- React + Vite
- `socket.io-client` for persistent bi-directional connections
- Tailwind CSS v4
- Custom font: `Mechsuit.otf`

**Backend**
- Node.js + Express
- Socket.io (WebSocket server)
- `ioredis` client
- `/ping` health-check route

**Database**
- Upstash — Serverless/Edge Redis (game state, Pub/Sub, Sets, Hashes, ZSETs)

**Infrastructure**
- Docker & Docker Compose (containerized monorepo)
- Alpine Linux base images
- Watch-polling config for WSL 2 cross-platform file sync

---

## Project Structure

```
Quizzy/
├── docker-compose.yml       # Orchestrates Node.js + Redis together
├── .gitignore                # Ignores node_modules and env files
│
├── backend/
│   ├── Dockerfile             # Node.js Alpine container blueprint
│   ├── package.json           # Server dependencies & scripts
│   └── src/
│       ├── redisClient.js     # Redis (Upstash) connection setup
│       └── server.js          # Express + Socket.io + Pub/Sub + scoring engine + /ping route
│
└── frontend/
    ├── package.json
    ├── vite.config.js         # React, Vite, Tailwind config
    ├── public/
    │   └── fonts/
    │       └── Mechsuit.otf   # Custom cyberpunk font
    └── src/
        ├── App.jsx            # Monolithic UI: Host (Builder/Leaderboard) + Player (Mobile) views
        ├── index.css          # Dark theme, tactile effects, strict viewport scaling
        └── socket.js          # Socket.io client config (uses VITE_BACKEND_URL)
```

---

## Environment Variables

### Backend (Render)
| Variable | Description |
|---|---|
| `REDIS_URL` | Upstash connection string, e.g. `rediss://default:password@endpoint.upstash.io:port` |
| `PORT` | Automatically injected by the cloud provider |

### Frontend (Vercel)
| Variable | Description |
|---|---|
| `VITE_BACKEND_URL` | Live backend URL, e.g. `https://your-backend.onrender.com` |

---

## Getting Started

### Local Development (Docker Compose)

```bash
# Clone the repository
git clone https://github.com/<your-username>/quizzy.git
cd quizzy

# Spin up Node.js + Redis together
docker compose up --build
```

### Manual Setup

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend (in a separate terminal)
cd frontend
npm install
npm run dev
```

Make sure `REDIS_URL` (backend) and `VITE_BACKEND_URL` (frontend) are set in your local `.env` files before starting either service.

---

## Current Bottlenecks & Future Roadmap

- **Horizontal Scaling** — Support traffic spikes of 15,000+ concurrent users by running additional Node.js containers behind an Application Load Balancer.
- **Distributed Syncing** — Integrate `@socket.io/redis-adapter` so Redis can act as a central message bus for synchronized broadcasting across multiple backend instances.
- **Pub/Sub Amplification Effect** — Beyond ~1,000,000 users, Redis's single-threaded Pub/Sub would become a bottleneck; the architecture will transition to a distributed message broker like **Apache Kafka**.

---

## License

Distributed under the [MIT_LICENSE](https://github.com/soumyadeep-rc/Quizzy/blob/main/LICENSE).

---

*Built with React, Node.js, Socket.io, and Redis — engineered for millisecond-precision, high-concurrency real-time gameplay.*
