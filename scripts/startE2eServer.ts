process.env.NODE_ENV = 'development';
process.env.PORT = String(Number(process.env.E2E_PORT) || 3998);

import '../server';
