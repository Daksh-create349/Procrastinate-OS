from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import actions, ai, analysis, documents, duplicates, health, queue, scanner
from app.config import get_settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("procrastinateos")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logger.info(f"Starting {settings.APP_NAME} v{settings.VERSION} on {settings.HOST}:{settings.PORT}")
    logger.info(f"Configured Ollama URL: {settings.OLLAMA_BASE_URL} (Model: {settings.OLLAMA_MODEL})")
    yield
    logger.info("Shutting down ProcrastinateOS Backend...")


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.VERSION,
        description="Local-first AI application helping recover forgotten work and organize digital clutter.",
        lifespan=lifespan,
    )

    # Security: Guard against DNS rebinding & arbitrary Host attacks
    @app.middleware("http")
    async def validate_local_host(request: Request, call_next):
        host_header = request.headers.get("host", "").split(":")[0].lower()
        allowed_hosts = {"127.0.0.1", "localhost", "test", "testserver"}
        if host_header and host_header not in allowed_hosts:
            logger.warning(f"Rejected non-local Host header: {host_header}")
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"detail": "Access restricted to local interface (127.0.0.1)."},
            )
        return await call_next(request)

    # Strict CORS configuration
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    # Include Routers
    app.include_router(health.router, prefix="/api")
    app.include_router(scanner.router, prefix="/api")
    app.include_router(duplicates.router, prefix="/api")
    app.include_router(documents.router, prefix="/api")
    app.include_router(analysis.router, prefix="/api")
    app.include_router(ai.router, prefix="/api")
    app.include_router(queue.router, prefix="/api")
    app.include_router(actions.router, prefix="/api")

    @app.get("/")
    async def root():
        return {
            "app": settings.APP_NAME,
            "version": settings.VERSION,
            "tagline": "Stop postponing. Let your computer do the boring work.",
            "health_endpoint": "/api/health",
            "docs": "/docs",
        }

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
