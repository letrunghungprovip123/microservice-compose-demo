# Architecture Notes

## Frontend + 3 backend microservices

### frontend-service — React + Ant Design + Nginx
- Host port: `3000` -> container port `80`
- Network: `service-net`
- Browser calls only the frontend origin.
- Nginx reverse-proxies `/api/customer/*`, `/api/catalog/*`, `/api/order/*` to Docker service names.
- This makes frontend -> backend communication visible without adding CORS configuration to each backend.

### customer-service — FastAPI
- Port container: `8001`
- Persistence: PostgreSQL
- Network: `service-net`, `data-net`
- API: create/list/get customers

### catalog-service — Express
- Port container: `8002`
- Persistence/cache demo: Redis with AOF + named volume
- Network: `service-net`, `cache-net`
- API: list/get/reserve product stock

### order-service — FastAPI
- Port container: `8003`
- Network: `service-net` only
- Calls customer and catalog through REST
- Stores created orders in memory on purpose, to demo ephemeral state

## Infrastructure

### postgres
Only attached to `data-net`.

### redis
Only attached to `cache-net`.

### adminer
Optional profile `tools`; attached to `data-net`.

## Why the network design matters

`order-service` cannot directly reach PostgreSQL or Redis. This intentionally enforces the idea that one microservice should call another service's API instead of bypassing it to touch its datastore.

```text
Browser
  |
localhost:3000
  |
frontend-service
  |
  | service-net
  v
customer-service <------ order-service ----> catalog-service
      |                                      |
      | data-net                             | cache-net
      v                                      v
  PostgreSQL                                Redis
```

## Deliberate simplifications

- The frontend Nginx acts only as a simple reverse proxy for the demo, not a full API gateway.
- No auth, tracing, message queue, saga, circuit breaker or service mesh.
- Order data is in-memory to keep the code short and create a useful persistence demo.
- `catalog-service` decrements stock directly; this is not a production-grade distributed transaction design.
