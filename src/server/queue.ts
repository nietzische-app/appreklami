import { config } from "./config";

type Task = () => Promise<void>;

/** Minimal in-process FIFO queue. Swap for BullMQ/SQS when scaling beyond one machine. */
class JobQueue {
  private pending: Task[] = [];
  private running = 0;

  enqueue(task: Task): void {
    this.pending.push(task);
    this.pump();
  }

  get size() {
    return this.pending.length + this.running;
  }

  private pump(): void {
    while (this.running < config.jobConcurrency && this.pending.length) {
      const task = this.pending.shift()!;
      this.running++;
      task()
        .catch((err) => console.error("[queue] task crashed:", err))
        .finally(() => {
          this.running--;
          this.pump();
        });
    }
  }
}

export const jobQueue = new JobQueue();
