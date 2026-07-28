import express, { Request, Response } from 'express';

const app = express();
const PORT = process.env.PORT || 3005;
const SERVICE_NAME = 'Finance Service';

app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: SERVICE_NAME,
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🚀 ${SERVICE_NAME} running on port ${PORT}`);
});
