
# Two Words 🎯

> A Pokémon Go-style social app where two words connect you to nearby people and curated content.

Users input **two words** capturing their current interest (e.g., *"play golf"*, *"learn piano"*, *"eat ramen"*), and the app curates relevant content while revealing nearby users who share similar ambitions on a real-time GPS map overlay.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React Native App                     │
│              (TypeScript + Expo/RN CLI)                 │
├──────────────────┬──────────────────────────────────────┤
│   REST (HTTPS)   │        WebSocket (Socket.IO)         │
│   Auth · CRUD    │   Location pings · Chat · Presence   │
└────────┬─────────┴──────────────┬───────────────────────┘
         │                        │
┌────────▼────────────────────────▼───────────────────────┐
│                  Node.js + Express                      │
│             (TypeScript · Socket.IO)                    │
├─────────────────────────────────────────────────────────┤
│  Middleware: JWT Auth · Rate Limit · Zod Validation     │
├──────────┬──────────────┬───────────────────────────────┤
│  Routes  │  Socket Hubs │   Services / Models           │
│  /auth   │  location    │   UserService                 │
│  /ambit  │  chat        │   AmbitionService             │
│  /disc   │              │   DiscoverService             │
│  /chats  │              │   ChatService                 │
└────┬─────┴──────┬───────┴───────────────────────────────┘
     │            │
┌────▼────────────▼───────────────────────────────────────┐
│         PostgreSQL 16 + PostGIS + pgvector              │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│   │  Users   │ │Ambitions │ │ Sessions │ │  Chats   │  │
│   │          │ │(+vector) │ │(+geom)   │ │+Messages │  │
│   └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│   Extensions: uuid-ossp · pg_trgm · postgis · vector   │
└─────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer      | Technology                                          |
| ---------- | --------------------------------------------------- |
| Frontend   | React Native · TypeScript · Expo                    |
| Backend    | Node.js · Express · Socket.IO · TypeScript          |
| Database   | PostgreSQL 16 · PostGIS 3.4 · pgvector              |
| Auth       | JWT (access + refresh tokens) · bcryptjs             |
| Validation | Zod (env + request schemas)                          |
| Realtime   | Socket.IO (location pings, chat, presence)           |
| Maps       | Mapbox GL (token required)                           |
| Infra      | Docker Compose (local dev)                           |

---

## Prerequisites

- **Node.js** ≥ 18
- **Docker** & **Docker Compose** v2+
- **Git**

---

## Quick Start

### 1. Clone & install

```bash
git clone <repo-url> two-words-app
cd two-words-app/backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — set JWT_SECRET, JWT_REFRESH_SECRET, MAPBOX_TOKEN
```

### 3. Start the database

```bash
# From project root
docker compose up -d
```

The init script will automatically create the required PostgreSQL extensions on first run.

### 4. Apply the schema

```bash
# Connect to the running container
docker exec -i twowords-db psql -U twowords -d twowords < backend/src/models/schema.sql
```

### 5. Run the backend (dev mode)

```bash
cd backend
npm run dev
```

The server starts on `http://localhost:3001` (or whichever port you set in `.env`).

---

## Project Structure

```
two-words-app/
├── docker-compose.yml          # PostgreSQL + PostGIS container
├── init-extensions.sql         # DB extension bootstrap
├── README.md
└── backend/
    ├── package.json
    ├── tsconfig.json
    ├── .env.example
    └── src/
        ├── app.ts              # Express + Socket.IO entry point
        ├── routes.ts           # All REST route definitions
        ├── config/
        │   ├── env.ts          # Zod-validated environment config
        │   └── database.ts     # pg Pool + query helpers
        ├── middleware/
        │   ├── auth.ts         # JWT auth (REST + Socket.IO)
        │   ├── validate.ts     # Zod request validation
        │   └── rateLimit.ts    # Rate limiting presets
        └── models/
            └── schema.sql      # Full production DDL
```

---

## API Overview

| Method | Endpoint                  | Description               |
| ------ | ------------------------- | ------------------------- |
| POST   | `/api/auth/register`      | Create account            |
| POST   | `/api/auth/login`         | Obtain tokens             |
| POST   | `/api/auth/refresh`       | Refresh access token      |
| GET    | `/api/auth/me`            | Get current user profile  |
| POST   | `/api/ambitions`          | Set two-word ambition     |
| GET    | `/api/ambitions/active`   | Get active ambition       |
| PUT    | `/api/ambitions/:id`      | Update ambition           |
| DELETE | `/api/ambitions/:id`      | Deactivate ambition       |
| GET    | `/api/discover/nearby`    | Find nearby users         |
| GET    | `/api/discover/content`   | Get curated content links |
| GET    | `/api/chats`              | List conversations        |
| POST   | `/api/chats`              | Start a conversation      |
| GET    | `/api/chats/:id/messages` | Get chat messages         |
| POST   | `/api/chats/:id/messages` | Send a message            |

---

## Socket.IO Events

| Event             | Direction | Description                         |
| ----------------- | --------- | ----------------------------------- |
| `location:ping`   | Client →  | Send current GPS coordinates        |
| `location:nearby` | → Client  | Receive nearby users with ambitions |
| `chat:message`    | Both      | Send / receive chat messages        |
| `chat:typing`     | Both      | Typing indicator                    |
| `user:online`     | → Client  | User came online                    |
| `user:offline`    | → Client  | User went offline                   |

---

## License

MIT
