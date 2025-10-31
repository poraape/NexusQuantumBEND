from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
# from app.api.v1.routers import some_router # Placeholder for actual routers

app = FastAPI(title="NexusQuantumBEND API")

# Configure CORS to allow frontend access
origins = [
    "http://localhost:5173", # Default Vite development server port
    "http://127.0.0.1:5173",
    # Add your production frontend URL(s) here when deployed
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Placeholder for including your API routers
# app.include_router(some_router.router, prefix="/api/v1")

@app.get("/")
async def read_root():
    return {"message": "Welcome to NexusQuantumBEND API"}

# Add other necessary startup/shutdown events, database connections, etc.
