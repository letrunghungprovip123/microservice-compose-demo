import asyncio
import os
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import asyncpg
import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

SERVICE_NAME = os.getenv("SERVICE_NAME", "order-service")
DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql://shopuser:shoppass@postgres:5432/shopdb"
)
CATALOG_SERVICE_URL = os.getenv(
    "CATALOG_SERVICE_URL", "http://catalog-service:8002"
)

pool: asyncpg.Pool | None = None


class OrderCreate(BaseModel):
    customer_name: str = Field(min_length=1, max_length=120)
    customer_email: str = Field(min_length=3, max_length=200)
    product_id: int = Field(gt=0)
    quantity: int = Field(gt=0, le=100)


def row_to_order(row: asyncpg.Record) -> dict:
    return {
        "id": row["id"],
        "customer_name": row["customer_name"],
        "customer_email": row["customer_email"],
        "product": {
            "id": row["product_id"],
            "name": row["product_name"],
            "unit_price": float(row["unit_price"]),
        },
        "quantity": row["quantity"],
        "total": float(row["total"]),
        "remaining_stock": row["remaining_stock"],
        "created_at": row["created_at"].isoformat(),
    }


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global pool
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=5)
    async with pool.acquire() as connection:
        await connection.execute(
            """
            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY,
                customer_name TEXT NOT NULL,
                customer_email TEXT NOT NULL,
                product_id INTEGER NOT NULL,
                product_name TEXT NOT NULL,
                unit_price DOUBLE PRECISION NOT NULL,
                quantity INTEGER NOT NULL,
                total DOUBLE PRECISION NOT NULL,
                remaining_stock INTEGER NOT NULL,
                created_at TIMESTAMPTZ NOT NULL
            )
            """
        )
    yield
    await pool.close()
    pool = None


app = FastAPI(
    title="Order Service",
    version="3.0.0",
    description="Order microservice owning order data in PostgreSQL and calling Catalog via REST.",
    lifespan=lifespan,
)


async def postgres_status() -> dict:
    started = time.perf_counter()
    try:
        if pool is None:
            raise RuntimeError("database pool is not initialized")
        async with pool.acquire() as connection:
            await connection.fetchval("SELECT 1")
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


async def catalog_status() -> dict:
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(f"{CATALOG_SERVICE_URL}/health")
            response.raise_for_status()
            payload = response.json()
        return {
            "name": "catalog-service",
            "target": CATALOG_SERVICE_URL,
            "status": "ok" if payload.get("status") == "ok" else "degraded",
            "latency_ms": round((time.perf_counter() - started) * 1000, 2),
        }
    except Exception as exc:
        return {
            "name": "catalog-service",
            "target": CATALOG_SERVICE_URL,
            "status": "down",
            "latency_ms": round((time.perf_counter() - started) * 1000, 2),
            "error": str(exc),
        }


@app.get("/health")
async def health():
    database = await postgres_status()
    if database["status"] != "ok":
        raise HTTPException(status_code=503, detail={"status": "degraded", "dependency": database})
    return {"status": "ok", "service": SERVICE_NAME, "dependency": database}


@app.get("/info")
async def info():
    return {
        "service": SERVICE_NAME,
        "version": "3.0.0",
        "runtime": "Python / FastAPI + HTTPX + asyncpg",
        "container_port": 8003,
        "persistence": "PostgreSQL named volume",
        "networks": ["service-net", "order-data-net"],
        "depends_on": ["catalog-service:8002", "postgres:5432"],
        "responsibility": "Own orders, persist them, and reserve catalog stock through the Catalog API",
    }


@app.get("/dependencies")
async def dependencies():
    database, catalog = await asyncio.gather(postgres_status(), catalog_status())
    items = [database, catalog]
    return {
        "service": SERVICE_NAME,
        "status": "ok" if all(item["status"] == "ok" for item in items) else "degraded",
        "dependencies": items,
    }


@app.get("/stats")
async def stats():
    if pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    async with pool.acquire() as connection:
        row = await connection.fetchrow(
            """
            SELECT
                COUNT(*)::int AS order_count,
                COALESCE(SUM(quantity), 0)::int AS units_ordered,
                COALESCE(SUM(total), 0)::double precision AS gross_total
            FROM orders
            """
        )
    return {
        "service": SERVICE_NAME,
        "order_count": row["order_count"],
        "units_ordered": row["units_ordered"],
        "gross_total": round(float(row["gross_total"]), 2),
    }


@app.get("/orders")
async def list_orders():
    if pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    async with pool.acquire() as connection:
        rows = await connection.fetch("SELECT * FROM orders ORDER BY created_at DESC")
    return [row_to_order(row) for row in rows]


@app.get("/orders/{order_id}")
async def get_order(order_id: str):
    if pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    async with pool.acquire() as connection:
        row = await connection.fetchrow("SELECT * FROM orders WHERE id = $1", order_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return row_to_order(row)


@app.post("/orders", status_code=201)
async def create_order(payload: OrderCreate):
    customer_name = payload.customer_name.strip()
    customer_email = payload.customer_email.strip().lower()
    if not customer_name:
        raise HTTPException(status_code=400, detail="customer_name cannot be blank")
    if "@" not in customer_email:
        raise HTTPException(status_code=400, detail="customer_email is invalid")

    timeout = httpx.Timeout(5.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            product_response = await client.get(
                f"{CATALOG_SERVICE_URL}/products/{payload.product_id}"
            )
            if product_response.status_code == 404:
                raise HTTPException(status_code=400, detail="Product does not exist")
            product_response.raise_for_status()

            reserve_response = await client.post(
                f"{CATALOG_SERVICE_URL}/products/{payload.product_id}/reserve",
                json={"quantity": payload.quantity},
            )
            if reserve_response.status_code == 409:
                detail = reserve_response.json()
                raise HTTPException(
                    status_code=409,
                    detail={
                        "message": "Not enough stock",
                        "available": detail.get("available"),
                    },
                )
            reserve_response.raise_for_status()
        except HTTPException:
            raise
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=503,
                detail=f"Catalog service unavailable: {exc}",
            ) from exc

    product = product_response.json()
    reservation = reserve_response.json()
    order_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc)
    total = round(float(product["price"]) * payload.quantity, 2)

    if pool is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        async with pool.acquire() as connection:
            row = await connection.fetchrow(
                """
                INSERT INTO orders (
                    id, customer_name, customer_email, product_id, product_name,
                    unit_price, quantity, total, remaining_stock, created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING *
                """,
                order_id,
                customer_name,
                customer_email,
                int(product["id"]),
                product["name"],
                float(product["price"]),
                payload.quantity,
                total,
                int(reservation["remainingStock"]),
                created_at,
            )
    except Exception as exc:
        # Demo limitation: stock reservation and PostgreSQL insert are not one distributed transaction.
        raise HTTPException(
            status_code=503,
            detail=f"Order persistence failed after stock reservation: {exc}",
        ) from exc

    return row_to_order(row)
