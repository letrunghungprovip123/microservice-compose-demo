import os
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

CUSTOMER_SERVICE_URL = os.getenv("CUSTOMER_SERVICE_URL", "http://customer-service:8001")
CATALOG_SERVICE_URL = os.getenv("CATALOG_SERVICE_URL", "http://catalog-service:8002")

app = FastAPI(title="Order Service", version="1.0.0")
orders: list[dict] = []


class OrderCreate(BaseModel):
    customer_id: int = Field(gt=0)
    product_id: int = Field(gt=0)
    quantity: int = Field(gt=0)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "order-service"}


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
                raise HTTPException(status_code=409, detail="Not enough stock")
            reserve_response.raise_for_status()
        except HTTPException:
            raise
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=503, detail=f"Downstream service unavailable: {exc}") from exc

    customer = customer_response.json()
    product = product_response.json()
    order = {
        "id": str(uuid.uuid4()),
        "customer": {"id": customer["id"], "name": customer["name"]},
        "product": {"id": product["id"], "name": product["name"], "unit_price": product["price"]},
        "quantity": payload.quantity,
        "total": round(product["price"] * payload.quantity, 2),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    orders.append(order)
    return order
