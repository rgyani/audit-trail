import express from 'express';
import { initAuditConfig, auditInterceptor } from './middleware/AuditInterceptor';

const app = express();
app.use(express.json());

// Health check for Docker Compose 'service_healthy' condition
app.get('/health', (req, res) => res.status(200).send('OK'));

// Mock GraphQL Endpoint
app.post('/graphql', async (req, res) => {
  // Simulate a GraphQL execution context
  const mockContext = { 
    user: { id: 'user-123', permissions: ['trade:write'], claims: { mfa_verified: true } },
    ip: req.ip,
    headers: req.headers
  };

  // Mocking the 'resolve' flow
  const result = await auditInterceptor(
    async () => ({ data: { placeOrder: { id: "tx-999", status: "SUCCESS" } } }),
    {}, 
    req.body.variables || {}, 
    mockContext, 
    { fieldName: 'placeOrder', operation: { operation: 'mutation' } } as any
  );

  res.json(result);
});

const PORT = 4000;
initAuditConfig().then(() => {
  app.listen(PORT, () => console.log(`Gateway running on port ${PORT}`));
});