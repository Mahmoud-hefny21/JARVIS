import {createServer} from 'vite';

// Own the server in the runner: Windows shell/npm process-tree termination can
// hang after every assertion has passed. Closing Vite also closes its watchers.
export default async function setup() {
  const server = await createServer({configFile: 'apps/desktop/vite.config.ts'});
  try {
    await server.listen();
  } catch (error) {
    await server.close();
    throw error;
  }
  return async () => { await server.close(); };
}
