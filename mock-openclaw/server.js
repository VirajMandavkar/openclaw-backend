const express = require('express');
const app = express();

app.use(express.json());

// Mock OpenClaw API endpoints
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/api/status', (req, res) => {
  res.json({
    version: '1.0.0',
    uptime: process.uptime(),
    container: 'openclaw-mock'
  });
});

app.post('/api/execute', (req, res) => {
  const { command, args } = req.body;

  // Simulate command execution
  res.json({
    success: true,
    command,
    args,
    output: `Executed: ${command} with args ${JSON.stringify(args)}`,
    executedAt: new Date().toISOString()
  });
});

app.get('/api/files', (req, res) => {
  res.json({
    files: [
      { name: 'test1.txt', size: 1024 },
      { name: 'test2.txt', size: 2048 }
    ]
  });
});

// Echo endpoint to test header propagation
app.get('/api/echo', (req, res) => {
  res.json({
    headers: req.headers,
    method: req.method,
    path: req.path,
    query: req.query
  });
});

// Catch-all to log any unexpected requests
app.use((req, res) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
    method: req.method
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Mock OpenClaw API listening on port ${PORT}`);
  console.log(`Container ID: ${process.env.HOSTNAME || 'unknown'}`);
  console.log(`Started at: ${new Date().toISOString()}`);
});
