import type { NodeEvent } from "./types.ts";

export class NodeEventBus {
  private listeners = new Set<(e: NodeEvent) => void>();

  subscribe(fn: (e: NodeEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  publish(event: NodeEvent) {
    for (const l of this.listeners) l(event);
  }
}

