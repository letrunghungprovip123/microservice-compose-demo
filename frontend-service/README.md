# Frontend Service

Một React UI nhưng có **hai runtime mode** tùy deployment.

## Case 1 — private backend

Build bằng `Dockerfile.bff`.

```text
Browser -> frontend-bff:3000 -> private Order/Catalog services
```

Runtime là Node.js/Express. Nó serve React bundle và cung cấp BFF contract:

```text
GET  /shop/products
GET  /shop/orders
POST /shop/checkout
GET  /shop/system
```

Không có generic `/api/*` proxy; `/api/*` trả 404 có chủ đích.

## Case 2 — public APIs

Build bằng `Dockerfile`.

Runtime là Nginx static server. Nó **không proxy backend API**. Public routing thuộc `gateway/nginx.conf`:

```text
/                 -> frontend-service
/api/order/*      -> order-service
/api/catalog/*    -> catalog-service
```

Vì vậy public API client không đi qua frontend service.

## Build-time mode

React đọc:

```text
VITE_DEPLOYMENT_MODE=private|public
```

- `private`: UI gọi BFF `/shop/*`.
- `public`: UI gọi Gateway `/api/order/*` và `/api/catalog/*`.
