# BuildWave Project Journey

This document serves as a comprehensive recap of exactly what you have built in the **BuildWave** project, how we achieved it, and the mechanics of the system as it stands today. 

You have successfully engineered a **simulated CI/CD (Continuous Integration / Continuous Deployment) pipeline system**, heavily inspired by industry-standard tools like Jenkins and GitHub Actions.

---

## 1. What We Built (The Architecture)

BuildWave is an end-to-end simulated pipeline engine divided into two main parts: a **Node.js/Express Backend** and a **React Frontend Dashboard**. 

Here are the core features you have built:

- **Webhook Listener**: A front-door API endpoint (`POST /api/webhook`) that listens for push events directly from GitHub.
- **Job Scheduler & Priority Queue**: A system that takes incoming webhook requests, assigns them a priority (e.g., `main` branch gets highest priority), and places them in a persistent Postgres database queue.
- **Pipeline Engine (The DAG Engine)**: An intelligent engine that reads a `Jenkinsfile.yaml`, parses the stages, resolves dependencies, and executes them as a Directed Acyclic Graph (DAG). It supports parallel execution (running multiple stages at the exact same time) and simulates execution times and real-world failure rates.
- **Server-Sent Events (SSE)**: A real-time streaming connection that pushes live updates from the Backend directly to the Frontend, eliminating the need for the frontend to constantly refresh or poll the server.
- **Kanban Dashboard**: A sleek, modern React interface that visualizes jobs moving through columns (Queued → Running → Completed) and shows live progress bars for individual pipeline stages.

---

## 2. How We Did It (The Step-by-Step Journey)

### Phase 1: The Core Engine
We started by writing the core logic in Node.js. 
- We created a `pipelineEngine.js` that knows how to read YAML files using the `js-yaml` library.
- We implemented a state machine that transitions jobs through various states (Pending → Running → Completed/Failed).
- We added an `eventBus` to broadcast messages whenever a stage starts or finishes, allowing decoupled communication across the backend.

### Phase 2: The Real-Time Dashboard
To make it visual, we built a React application using Vite.
- We designed a Kanban-style board using Vanilla CSS to give it a premium, modern feel.
- We hooked up the `useSSE` hook to listen to the backend's `/api/events` endpoint, allowing the UI cards to slide between columns automatically as the backend broadcasted updates.

### Phase 3: Postgres Persistence
Initially, all jobs were stored in the server's RAM. If the server crashed, history was lost.
- We integrated **PostgreSQL** (`db.js`) to make the data persistent. Now, incoming webhooks are saved to a database table, and the scheduler reads from this database to manage the queue.

### Phase 4: The GitHub Connection (Webhook & Ngrok)
To make it a *real* CI/CD system, it needed to respond to real-world code pushes.
- We used **ngrok** to create a secure tunnel, exposing your local `localhost:3001` backend to the public internet.
- We went into your GitHub repository settings and configured a **Webhook**. We told GitHub: *"Every time code is pushed, send a JSON payload to this ngrok URL."*
- We resolved Git conflicts, fixed default branch mismatches (`main` vs `master`), and disabled Branch Protection Rules so you could push code frictionlessly.

---

## 3. The Final End-to-End Flow

Here is exactly what happens in your system today when you type `git push`:

1. **Trigger**: You type `git push origin main` in your terminal.
2. **Webhook Fired**: GitHub detects the push and fires an HTTP POST request containing commit details to your ngrok URL.
3. **Ingestion**: Ngrok forwards it to your local Node.js server. The `webhookListener.js` catches it, extracts the repo name (`buildwave`), and hands it to the Scheduler.
4. **Parsing**: The Pipeline Engine looks inside `backend/jenkinsfiles/buildwave/Jenkinsfile.yaml`, reads the stages (Checkout, Build, Test, Deploy to Production), and builds the execution graph.
5. **Execution & Streaming**: The engine begins simulating the stages. As each stage starts and finishes, it fires events through the SSE stream.
6. **Visualization**: Your React frontend receives these SSE events instantly and animates the Job Card across the screen, updating the progress bar until the pipeline shows a glorious green "Pass".

---

## Summary
You have successfully built a distributed, event-driven, full-stack application that handles third-party webhooks, manages database queues, executes complex DAG logic, and streams live data to a modern React frontend. This is a massive architectural achievement!
