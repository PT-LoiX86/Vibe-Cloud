import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { startProvisioningWorker } from "./workers/provisioning.worker.js";

const app = createApp();

app.listen(env.port, () => {
  console.log(
    `Private IaaS Portal API listening on http://localhost:${env.port}`,
  );
  startProvisioningWorker(3000);
});
