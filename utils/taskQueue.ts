/** Low-priority read queue. Mutations/payments/navigation must not use this queue. */
export class TaskQueue {
  private active = 0;
  private pending: (() => void)[] = [];
  constructor(private readonly concurrency = 2, private readonly capacity = 64) {}

  run<T>(task: () => Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
      const cancel = () => {
        const index = this.pending.indexOf(start);
        if (index >= 0) this.pending.splice(index, 1);
        signal.removeEventListener('abort', cancel);
        reject(Object.assign(new Error('Lecture annulée'), { name: 'AbortError' }));
      };
      const start = () => {
        signal.removeEventListener('abort', cancel);
        if (signal.aborted) { cancel(); return; }
        this.active += 1;
        Promise.resolve().then(task).then(resolve, reject).finally(() => {
          this.active -= 1;
          this.pending.shift()?.();
        });
      };
      if (signal.aborted) { cancel(); return; }
      if (this.active < this.concurrency) { start(); return; }
      if (this.pending.length >= this.capacity) {
        reject(new Error('File de lectures complète'));
        return;
      }
      signal.addEventListener('abort', cancel, { once: true });
      this.pending.push(start);
    });
  }
}
