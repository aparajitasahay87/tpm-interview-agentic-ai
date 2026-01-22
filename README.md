# TPM Interview Prep - Agentic AI Platform

Building an AI-powered interview preparation platform for Technical Program Managers, using agentic workflows, RAG, and modern AI architecture.

## 🎯 Project Goals

1. **Learn Agentic AI**: Build multi-agent systems with planning, tool use, and reflection
2. **Build in Public**: Document weekly progress through blog posts
3. **Create Value**: Help TPMs prepare for behavioral interviews

## 🏗️ Architecture

### Backend (Node.js/Express)
- **Agentic AI Workflows**: Multi-step reasoning with GPT-4
- **RAG Implementation**: Vector database (Pinecone) for example retrieval
- **Tools**: STAR parser, example retriever, rubric checker
- **Reflection Pattern**: Self-critique and revision
- **Evaluation Framework**: Measure agent quality

### Frontend (Lovable)
- **Week 1**: STAR Method Analyzer
- **Week 2**: RAG Example Viewer
- **Week 3**: Agent Reasoning Visualizer
- **Week 4**: Reflection Comparison Tool

### Tech Stack
- **Backend**: Express.js, PostgreSQL, OpenAI GPT-4, Pinecone
- **Frontend**: Lovable (React/Tailwind auto-generated)
- **Database**: PostgreSQL for data, Pinecone for vectors
- **Deployment**: TBD

## 📅 Weekly Plan

- **Week 1**: STAR Parser Tool + Basic Agent
- **Week 2**: RAG Implementation + Vector DB
- **Week 3**: Agentic Workflow + Multi-Tool Orchestration
- **Week 4**: Reflection Pattern + Evaluation Framework

## 🚀 Getting Started
```bash
# Install dependencies
cd backend
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys

# Run migrations
npm run migrate

# Start development server
npm run dev
```

## 📝 Blog Series

Follow along as I build this project:
- Week 1: [Coming soon]
- Week 2: [Coming soon]
- Week 3: [Coming soon]
- Week 4: [Coming soon]

## 📄 License

MIT
