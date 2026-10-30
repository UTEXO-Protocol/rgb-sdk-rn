/** A failed command must not poison the queue. Composite operations enqueue once. */
export class SerialExecutor {
  private tail: Promise<void> = Promise.resolve();

  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}
