import os
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://shopuser:shoppass@postgres:5432/shopdb")
pool: asyncpg.Pool | None = None


class CustomerCreate(BaseModel):
    name: str
    email: str


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


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    yield
    if pool:
        await pool.close()


app = FastAPI(title="Customer Service", version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "customer-service"}


@app.post("/customers", status_code=201)
async def create_customer(customer: CustomerCreate):
    assert pool is not None
    try:
        row = await pool.fetchrow(
            "INSERT INTO customers(name, email) VALUES($1, $2) RETURNING id, name, email, created_at",
            customer.name,
            customer.email,
        )
    except asyncpg.UniqueViolationError as exc:
        raise HTTPException(status_code=409, detail="Email already exists") from exc
    return dict(row)


@app.get("/customers")
async def list_customers():
    assert pool is not None
    rows = await pool.fetch("SELECT id, name, email, created_at FROM customers ORDER BY id")
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
