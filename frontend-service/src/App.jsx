import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Layout,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
  message
} from 'antd';
import { api, deploymentMode } from './api';

const { Header, Content, Footer } = Layout;
const { Title, Text, Paragraph } = Typography;

function resultData(system, key) {
  return system?.results?.[key]?.ok ? system.results[key].data : null;
}

function statusTag(status) {
  if (status === 'ok') return <Tag color="success">HEALTHY</Tag>;
  if (status === 'degraded') return <Tag color="warning">DEGRADED</Tag>;
  return <Tag color="error">DOWN</Tag>;
}

function ArchitectureCard() {
  const isPrivate = deploymentMode === 'private';
  return (
    <Card title={`Deployment architecture · ${isPrivate ? 'CASE 1 PRIVATE BACKEND' : 'CASE 2 PUBLIC API'}`}>
      <Alert
        type={isPrivate ? 'info' : 'success'}
        showIcon
        message={
          isPrivate
            ? 'Only the Frontend/BFF is published. Raw Order/Catalog API routes are not exposed to external clients.'
            : 'Internet traffic enters through HTTPS ngrok → Gateway. Frontend and backend APIs are separate destinations behind the gateway.'
        }
      />
      <pre className="architecture-pre">
        {isPrivate
          ? `Internet\n   |\n   v\nFrontend + BFF (public :3000)\n   |  private service-net\n   +------> Order Service ------> Catalog Service\n              |                       |\n        order-data-net         catalog-data-net\n              |                       |\n          PostgreSQL                 Redis`
          : `Internet\n   | HTTPS :443\n   v\nngrok edge\n   | edge-net\n   v\nGateway\n   +------> Frontend\n   +------> Order API ------> Catalog Service\n   +------> Catalog API\n              |                  |\n        order-data-net     catalog-data-net\n              |                  |\n          PostgreSQL            Redis`}
      </pre>
    </Card>
  );
}

export default function App() {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [system, setSystem] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();

  const orderInfo = resultData(system, 'orderInfo');
  const catalogInfo = resultData(system, 'catalogInfo');
  const orderDeps = resultData(system, 'orderDependencies');
  const catalogDeps = resultData(system, 'catalogDependencies');
  const orderStats = resultData(system, 'orderStats');
  const catalogStats = resultData(system, 'catalogStats');

  async function refreshAll() {
    setLoading(true);
    const [productsResult, ordersResult, systemResult] = await Promise.allSettled([
      api.products(),
      api.orders(),
      api.system()
    ]);
    if (productsResult.status === 'fulfilled') setProducts(productsResult.value);
    if (ordersResult.status === 'fulfilled') setOrders(ordersResult.value);
    if (systemResult.status === 'fulfilled') setSystem(systemResult.value);
    setLoading(false);
  }

  useEffect(() => {
    refreshAll();
    const timer = window.setInterval(() => api.system().then(setSystem).catch(() => {}), 10000);
    return () => window.clearInterval(timer);
  }, []);

  async function submitOrder(values) {
    try {
      const order = await api.createOrder({
        customer_name: values.customer_name,
        customer_email: values.customer_email,
        product_id: values.product_id,
        quantity: values.quantity
      });
      messageApi.success(`Order created. Remaining stock: ${order.remaining_stock}`);
      form.resetFields(['quantity']);
      await refreshAll();
    } catch (error) {
      messageApi.error(error.message);
    }
  }

  const productOptions = products.map((product) => ({
    value: product.id,
    label: `${product.name} · $${product.price} · stock ${product.stock}`
  }));

  const dependencyRows = useMemo(() => {
    const rows = [];
    for (const [source, payload] of [
      ['order-service', orderDeps],
      ['catalog-service', catalogDeps]
    ]) {
      for (const dependency of payload?.dependencies || []) {
        rows.push({
          key: `${source}-${dependency.name}`,
          source,
          target: dependency.target,
          status: dependency.status,
          latency: dependency.latency_ms,
          network:
            dependency.name === 'postgres'
              ? 'order-data-net'
              : dependency.name === 'redis'
                ? 'catalog-data-net'
                : 'service-net'
        });
      }
    }
    return rows;
  }, [orderDeps, catalogDeps]);

  const productColumns = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    { title: 'Product', dataIndex: 'name' },
    { title: 'Price', dataIndex: 'price', render: (value) => `$${Number(value).toFixed(2)}` },
    { title: 'Stock', dataIndex: 'stock', render: (value) => <Tag color={value > 5 ? 'green' : 'orange'}>{value}</Tag> }
  ];

  const orderColumns = [
    { title: 'Customer', dataIndex: 'customer_name' },
    { title: 'Email', dataIndex: 'customer_email' },
    { title: 'Product', render: (_, row) => row.product?.name },
    { title: 'Qty', dataIndex: 'quantity', width: 70 },
    { title: 'Total', dataIndex: 'total', render: (value) => `$${Number(value).toFixed(2)}` },
    { title: 'Stock left', dataIndex: 'remaining_stock' }
  ];

  const serviceColumns = [
    { title: 'Service', dataIndex: 'service' },
    { title: 'Runtime', dataIndex: 'runtime' },
    { title: 'Port', dataIndex: 'container_port' },
    { title: 'Networks', dataIndex: 'networks', render: (items) => (items || []).map((item) => <Tag key={item}>{item}</Tag>) },
    { title: 'Persistence', dataIndex: 'persistence' }
  ];

  const serviceRows = [orderInfo, catalogInfo].filter(Boolean).map((item) => ({ ...item, key: item.service }));

  const items = [
    {
      key: 'overview',
      label: 'Overview',
      children: (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Row gutter={[16, 16]}>
            <Col xs={12} md={6}><Card><Statistic title="Products" value={catalogStats?.product_count ?? products.length} /></Card></Col>
            <Col xs={12} md={6}><Card><Statistic title="Units in stock" value={catalogStats?.total_stock ?? 0} /></Card></Col>
            <Col xs={12} md={6}><Card><Statistic title="Orders" value={orderStats?.order_count ?? orders.length} /></Card></Col>
            <Col xs={12} md={6}><Card><Statistic title="Gross total" prefix="$" precision={2} value={orderStats?.gross_total ?? 0} /></Card></Col>
          </Row>
          <ArchitectureCard />
          <Card title="Why only two business services?">
            <Paragraph>
              <Text strong>Order Service</Text> owns orders in PostgreSQL. <Text strong>Catalog Service</Text> owns product and stock state in Redis.
              Order may call Catalog through REST, but it is intentionally not attached to Catalog's datastore network.
            </Paragraph>
          </Card>
        </Space>
      )
    },
    {
      key: 'catalog',
      label: 'Catalog',
      children: (
        <Card title="Catalog Service · Redis owner">
          <Table rowKey="id" loading={loading} columns={productColumns} dataSource={products} pagination={false} />
        </Card>
      )
    },
    {
      key: 'orders',
      label: 'Orders',
      children: (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Card title="Checkout">
            <Form form={form} layout="vertical" onFinish={submitOrder} initialValues={{ quantity: 1 }}>
              <Row gutter={16}>
                <Col xs={24} md={6}><Form.Item name="customer_name" label="Customer name" rules={[{ required: true }]}><Input placeholder="Nguyen Van An" /></Form.Item></Col>
                <Col xs={24} md={6}><Form.Item name="customer_email" label="Email" rules={[{ required: true }, { type: 'email' }]}><Input placeholder="an@example.com" /></Form.Item></Col>
                <Col xs={24} md={8}><Form.Item name="product_id" label="Product" rules={[{ required: true }]}><Select options={productOptions} placeholder="Select product" /></Form.Item></Col>
                <Col xs={24} md={4}><Form.Item name="quantity" label="Quantity" rules={[{ required: true }]}><InputNumber min={1} max={100} style={{ width: '100%' }} /></Form.Item></Col>
              </Row>
              <Button type="primary" htmlType="submit">Create order</Button>
            </Form>
          </Card>
          <Card title="Persisted orders · PostgreSQL">
            <Table rowKey="id" loading={loading} columns={orderColumns} dataSource={orders} pagination={false} scroll={{ x: 900 }} />
          </Card>
        </Space>
      )
    },
    {
      key: 'networking',
      label: 'Networking',
      children: (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Alert
            showIcon
            type={deploymentMode === 'private' ? 'info' : 'success'}
            message={deploymentMode === 'private' ? 'Private mode: browser → BFF → private services' : 'Public mode: HTTPS ngrok → gateway → frontend or public API'}
            description={deploymentMode === 'private'
              ? 'There is no generic /api proxy. The BFF exposes only /shop business operations.'
              : 'The gateway routes / to frontend, /api/order to Order and /api/catalog to Catalog. Frontend is not in the API request path.'}
          />
          <Card title="Runtime service metadata">
            <Table rowKey="service" columns={serviceColumns} dataSource={serviceRows} pagination={false} scroll={{ x: 900 }} />
          </Card>
          <Card title="Live dependency probes">
            <Table
              rowKey="key"
              dataSource={dependencyRows}
              pagination={false}
              columns={[
                { title: 'Source', dataIndex: 'source' },
                { title: 'Target', dataIndex: 'target' },
                { title: 'Network', dataIndex: 'network', render: (value) => <Tag>{value}</Tag> },
                { title: 'Status', dataIndex: 'status', render: statusTag },
                { title: 'Latency', dataIndex: 'latency', render: (value) => `${value ?? '-'} ms` }
              ]}
            />
          </Card>
        </Space>
      )
    }
  ];

  return (
    <Layout className="app-layout">
      {contextHolder}
      <Header className="app-header">
        <div>
          <Title level={3} className="header-title">Mini Shop · Docker Compose Architecture Demo</Title>
          <Text className="header-subtitle">Order + Catalog · {deploymentMode === 'private' ? 'Case 1: private backend' : 'Case 2: public APIs through HTTPS edge'}</Text>
        </div>
        <Button onClick={refreshAll} loading={loading}>Refresh</Button>
      </Header>
      <Content className="app-content">
        <Tabs items={items} size="large" />
      </Content>
      <Footer className="app-footer">Docker Compose · service ownership · network boundaries · private/public exposure</Footer>
    </Layout>
  );
}
