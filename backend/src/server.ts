import { createServer } from "http";
import { app } from "./app";
import { env } from "./config/env";
import { initSocket } from "./config/socket";
import { startOrphanPurgeJob } from "./modules/media/orphanPurge.job";
import { ensureSiteSettings } from "./modules/siteContent/siteContent.service";
import { startScheduledReleaseJob } from "./modules/order/scheduledRelease.job";

const httpServer = createServer(app);

initSocket(httpServer);

if (env.PRINT_AGENT_KEY && env.PRINT_AGENT_KEY.length < 24) {
  console.warn("PRINT_AGENT_KEY is set but shorter than 24 characters — consider a longer secret.");
}

httpServer.listen(env.PORT, () => {
  console.log(`Server listening on port ${env.PORT}`);
  // First boot creates the single site-settings row with placeholders; later boots change
  // nothing. A failure is only logged: GET /store creates the row lazily if it is still missing.
  ensureSiteSettings().catch((error) => console.error("[site] could not ensure site settings", error));
  startOrphanPurgeJob();
  // After Socket.io is up, so a release's order:submitted emit reaches reception. Its first
  // pass releases anything that fell due while the server was down.
  startScheduledReleaseJob();
});
