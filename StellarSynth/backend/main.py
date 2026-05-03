from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from modules.community import router as community_router
from modules.news import router as news_router
from modules.stella import router as stella_router
from modules.predict import router as predict_router
from modules.dashboard import router as dashboard_router
from modules.apikeys import router as apikeys_router

# Create all database tables (if not already created)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="StellarSynth API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, replace with frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(community_router.router, prefix="/api/community", tags=["Community"])
app.include_router(news_router.router, prefix="/api/news", tags=["News"])
app.include_router(stella_router.router, prefix="/api/stella", tags=["Stella"])
app.include_router(predict_router.router, prefix="/api/predict", tags=["Predict"])
app.include_router(dashboard_router.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(apikeys_router.router, prefix="/api/apikeys", tags=["API Keys"])

@app.get("/")
def read_root():
    return {"message": "Welcome to StellarSynth API"}
