// Tiny synchronous event bus for decoupled system communication.
// e.g. a zombie death emits 'zombie:death' which Score, Audio and loot listen to,
// none of which know about each other.
export class EventBus {
  constructor() { this.handlers = new Map(); }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    const set = this.handlers.get(type);
    if (set) set.delete(fn);
  }

  emit(type, payload) {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of set) {
      try { fn(payload); }
      catch (e) { console.error(`event handler for "${type}" threw`, e); }
    }
  }
}
