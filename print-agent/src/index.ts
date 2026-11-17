import { io, Socket } from "socket.io-client";
import { config } from "./config";
import { markPrinted, wasRecentlyPrinted } from "./recentJobs";
import type { PrintJob } from "./printProtocol";
import { renderDoc } from "./render";

type AckCallback = (err: unknown, result?: { printed: true }) => void;

interface QueuedJob {
  job: PrintJob;
  ack: AckCallback;
}

const queue: QueuedJob[] = [];
let processing = false;

// Jobs are processed strictly one at a time, in arrival order — never in parallel, so a
// second job can't start printing before the first one's ack has been sent.
async function processQueue(): Promise<void> {
  if (processing) {
    return;
  }
  processing = true;
  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) {
      continue;
    }
    const { job, ack } = item;
    try {
      if (wasRecentlyPrinted(job.jobId)) {
        ack(null, { printed: true });
        continue;
      }
      await renderDoc(job.doc);
      markPrinted(job.jobId);
      console.log(`[print-agent] printed job ${job.jobId}`);
      ack(null, { printed: true });
    } catch (error) {
      console.error(`[print-agent] job ${job.jobId} failed:`, error);
      ack({ message: error instanceof Error ? error.message : "Unknown print error" });
    }
  }
  processing = false;
}

let socket: Socket | undefined;
let retryDelayMs = 1000;
const MAX_RETRY_DELAY_MS = 30000;

function scheduleRetry(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = undefined;
  }
  const delaySeconds = Math.round(retryDelayMs / 1000);
  console.log(`[print-agent] retrying in ${delaySeconds}s...`);
  setTimeout(connect, retryDelayMs);
  retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_DELAY_MS);
}

// Socket.io does NOT keep retrying on its own when the server's auth middleware rejects the
// handshake (a connect_error, not a transport-level disconnect) — `reconnection: false` here
// and this file manages all retry/backoff itself, so that gap doesn't matter either way.
function connect(): void {
  if (!config.BACKEND_URL || !config.PRINT_AGENT_KEY) {
    console.error("[print-agent] BACKEND_URL and PRINT_AGENT_KEY must both be set in .env to connect.");
    process.exitCode = 1;
    return;
  }

  console.log(`[print-agent] connecting to ${config.BACKEND_URL} as printerId="${config.PRINTER_ID}"...`);

  socket = io(config.BACKEND_URL, {
    auth: { agentKey: config.PRINT_AGENT_KEY, printerId: config.PRINTER_ID },
    reconnection: false,
  });

  socket.on("connect", () => {
    console.log("[print-agent] connected.");
    retryDelayMs = 1000;
  });

  socket.on("connect_error", (error: Error) => {
    console.error(`[print-agent] connect failed: ${error.message}`);
    scheduleRetry();
  });

  socket.on("disconnect", (reason: string) => {
    console.log(`[print-agent] disconnected (${reason}).`);
    scheduleRetry();
  });

  socket.on("print:job", (job: PrintJob, ack: AckCallback) => {
    console.log(`[print-agent] received job ${job.jobId} (${job.printerId})`);
    queue.push({ job, ack });
    void processQueue();
  });
}

connect();
