from fastapi import FastAPI
from ..backend.app.api.v1.routers import auth, upload

app = FastAPI(title="Nexus Quantum I2A2 API")

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(upload.router, prefix="/api/v1", tags=["files"])

@app.get("/")
def read_root():
    return {"message": "Welcome to the Nexus Quantum I2A2 API"}