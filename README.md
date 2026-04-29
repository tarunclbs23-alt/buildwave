# BuildWave: Mini-Jenkins Pipeline System

BuildWave is a robust mini-Jenkins CI/CD pipeline system featuring a webhook listener, a job scheduler with a priority queue, and a pipeline engine. It parses YAML-based `Jenkinsfile` configurations to execute build stages as a Directed Acyclic Graph (DAG) and track their progress. It handles multiple repository builds concurrently and provides real-time updates through a React-based frontend Kanban dashboard using Server-Sent Events (SSE).

## Features

- **Webhook Listener**: Receives push event webhooks (e.g., from GitHub/GitLab) to trigger builds.
- **Priority Queue & Job Scheduler**: Efficiently manages and schedules incoming build requests.
- **DAG Pipeline Engine**: Parses `Jenkinsfile.yaml` to resolve stage dependencies and executes stages concurrently as a Directed Acyclic Graph.
- **Real-Time Kanban Dashboard**: A sleek, React-based UI that provides live tracking of build statuses and stage-level progress using Server-Sent Events (SSE).
- **Concurrency**: Handles multiple repository builds and independent pipeline stages concurrently.

## Tech Stack

### Backend
- **Node.js & Express**: Core server and API routing.
- **js-yaml**: Parsing YAML-based `Jenkinsfile` configurations.
- **uuid**: Generating unique build and job IDs.
- **cors**: Managing cross-origin resource sharing.
- **SSE (Server-Sent Events)**: Streaming real-time build updates to the frontend.

### Frontend
- **React 19 & Vite**: Fast, modern frontend framework and bundler.
- **Vanilla CSS**: Custom styling for a modern, sleek Kanban dashboard.
- **SSE Client**: Receiving real-time updates from the backend.

## Project Structure

```
buildwave/
├── backend/
│   ├── src/             # Backend source code (server, engine, scheduler)
│   ├── jenkinsfiles/    # Sample Jenkinsfile.yaml configurations for testing
│   ├── package.json
│   └── index.js
├── frontend/
│   ├── src/             # React frontend source code
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
└── README.md
```

## Getting Started

### Prerequisites
- Node.js (v18 or higher recommended)
- npm or yarn

### Running the Backend

1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the backend server:
   ```bash
   node src/server.js
   ```
   *Note: Ensure you run the correct entry point file, e.g., `src/server.js` or `index.js`, depending on your setup.* The server will start and listen for webhooks and API requests (typically on port 3000).

### Running the Frontend

1. Open a new terminal and navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
4. Open your browser and navigate to the URL provided by Vite (typically `http://localhost:5173`) to view the BuildWave Kanban dashboard.

## Usage

1. **Trigger a Build**: You can simulate a webhook payload by sending a POST request to the backend's webhook endpoint (e.g., `http://localhost:3000/webhook`) with the necessary repository and branch information.
2. **Monitor**: Watch the React frontend as it receives live SSE updates. The Kanban board will automatically transition the build through states (e.g., Pending, Running, Success/Failed) and display stage-level progress in real time.

## License

ISC License
