import os
import time
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

SERVICE_NAME = os.getenv("SERVICE_NAME", "customer-service")
DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql://shopuser:shoppass@postgres:5432/shopdb"
)
pool: asyncpg.Pool | None = None


class CustomerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=200)


async def init_db() -> None:
    global pool
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=5)
    async with pool.acquire() as conn:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS customers (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )


async def postgres_status() -> dict:
    started = time.perf_counter()
    try:
        if pool is None:
            raise RuntimeError("database pool is not initialized")
        await pool.fetchval("SELECT 1")
        return {
            "name": "postgres",
            "target": "postgres:5432",
            "status": "ok",
            "latency_ms": round((time.perf_counter() - started) * 1000, 2),
        }
    except Exception as exc:
        return {
            "name": "postgres",
            "target": "postgres:5432",
            "status": "down",
            "latency_ms": round((time.perf_counter() - started) * 1000, 2),
            "error": str(exc),
        }


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    yield
    if pool:
        await pool.close()


app = FastAPI(
    title="Customer Service",
    version="2.0.0",
    description="Customer microservice backed by PostgreSQL.",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    dependency = await postgres_status()
    healthy = dependency["status"] == "ok"
    return JSONResponse(
        {
            "status": "ok" if healthy else "degraded",
            "service": SERVICE_NAME,
            "dependency": dependency,
        },
        status_code=200 if healthy else 503,
    )


@app.get("/info")
async def info():
    return {
        "service": SERVICE_NAME,
        "version": "2.0.0",
        "runtime": "Python / FastAPI",
        "container_port": 8001,
        "persistence": "PostgreSQL named volume",
        "networks": ["service-net", "data-net"],
        "depends_on": ["postgres:5432"],
        "responsibility": "Own customer data and expose customer APIs",
    }


@app.get("/dependencies")
async def dependencies():
    dependency = await postgres_status()
    return {
        "service": SERVICE_NAME,
        "status": "ok" if dependency["status"] == "ok" else "degraded",
        "dependencies": [dependency],
    }


@app.get("/stats")
async def stats():
    assert pool is not None
    count = await pool.fetchval("SELECT COUNT(*) FROM customers")
    return {"service": SERVICE_NAME, "customer_count": int(count)}


@app.post("/customers", status_code=201)
async def create_customer(customer: CustomerCreate):
    assert pool is not None
    name = customer.name.strip()
    email = customer.email.strip().lower()

    if not name:
        raise HTTPException(status_code=422, detail="Name cannot be empty")
    if "@" not in email:
        raise HTTPException(status_code=422, detail="Email is invalid")

    try:
        row = await pool.fetchrow(
            "INSERT INTO customers(name, email) VALUES($1, $2) RETURNING id, name, email, created_at",
            name,
            email,
        )
    except asyncpg.UniqueViolationError as exc:
        raise HTTPException(status_code=409, detail="Email already exists") from exc
    return dict(row)


@app.get("/customers")
async def list_customers():
    assert pool is not None
    rows = await pool.fetch(
        "SELECT id, name, email, created_at FROM customers ORDER BY id"
    )
    return [dict(row) for row in rows]


@app.get("/customers/{customer_id}")
async def get_customer(customer_id: int):
    assert pool is not None
    row = await pool.fetchrow(
        "SELECT id, name, email, created_at FROM customers WHERE id=$1", customer_id
    )
    if not row:
        raise HTTPException(status_code=404, detail="Customer not found")
    return dict(row)
