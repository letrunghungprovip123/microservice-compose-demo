import asyncio
import os
import time
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

SERVICE_NAME = os.getenv("SERVICE_NAME", "order-service")
CUSTOMER_SERVICE_URL = os.getenv(
    "CUSTOMER_SERVICE_URL", "http://customer-service:8001"
)
CATALOG_SERVICE_URL = os.getenv(
    "CATALOG_SERVICE_URL", "http://catalog-service:8002"
)

app = FastAPI(
    title="Order Service",
    version="2.0.0",
    description="Order microservice orchestrating Customer and Catalog via REST.",
)
orders: list[dict] = []


class OrderCreate(BaseModel):
    customer_id: int = Field(gt=0)
    product_id: int = Field(gt=0)
    quantity: int = Field(gt=0, le=100)


async def probe_dependency(name: str, base_url: str) -> dict:
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(f"{base_url}/health")
            response.raise_for_status()
            payload = response.json()
        return {
            "name": name,
            "target": base_url,
            "status": "ok" if payload.get("status") == "ok" else "degraded",
            "latency_ms": round((time.perf_counter() - started) * 1000, 2),
        }
    except Exception as exc:
        return {
            "name": name,
            "target": base_url,
            "status": "down",
            "latency_ms": round((time.perf_counter() - started) * 1000, 2),
            "error": str(exc),
        }


@app.get("/health")
async def health():
    return {"status": "ok", "service": SERVICE_NAME}


@app.get("/info")
async def info():
    return {
        "service": SERVICE_NAME,
        "version": "2.0.0",
        "runtime": "Python / FastAPI + HTTPX",
        "container_port": 8003,
        "persistence": "In-memory by design",
        "networks": ["service-net"],
        "depends_on": ["customer-service:8001", "catalog-service:8002"],
        "responsibility": "Validate customer/product, reserve stock and create orders",
    }


@app.get("/dependencies")
async def dependencies():
    customer, catalog = await asyncio.gather(
        probe_dependency("customer-service", CUSTOMER_SERVICE_URL),
        probe_dependency("catalog-service", CATALOG_SERVICE_URL),
    )
    dependencies_list = [customer, catalog]
    return {
        "service": SERVICE_NAME,
        "status": (
            "ok"
            if all(item["status"] == "ok" for item in dependencies_list)
            else "degraded"
        ),
        "dependencies": dependencies_list,
    }


@app.get("/stats")
async def stats():
    gross_total = round(sum(float(order["total"]) for order in orders), 2)
    units = sum(int(order["quantity"]) for order in orders)
    return {
        "service": SERVICE_NAME,
        "order_count": len(orders),
        "units_ordered": units,
        "gross_total": gross_total,
    }


@app.get("/orders")
async def list_orders():
    return orders


@app.post("/orders", status_code=201)
async def create_order(payload: OrderCreate):
    timeout = httpx.Timeout(5.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            customer_response = await client.get(
                f"{CUSTOMER_SERVICE_URL}/customers/{payload.customer_id}"
            )
            if customer_response.status_code == 404:
                raise HTTPException(status_code=400, detail="Customer does not exist")
            customer_response.raise_for_status()

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
                detail=f"Downstream service unavailable: {exc}",
            ) from exc

    customer = customer_response.json()
    product = product_response.json()
    reservation = reserve_response.json()
    order = {
        "id": str(uuid.uuid4()),
        "customer": {"id": customer["id"], "name": customer["name"]},
        "product": {
            "id": product["id"],
            "name": product["name"],
            "unit_price": product["price"],
        },
        "quantity": payload.quantity,
        "total": round(product["price"] * payload.quantity, 2),
        "remaining_stock": reservation.get("remainingStock"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    orders.append(order)
    return order
