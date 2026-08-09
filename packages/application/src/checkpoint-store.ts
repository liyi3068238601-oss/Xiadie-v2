import type { TurnId } from "@xiadie/xiadie-core";

export interface CheckpointStore {
  save(turnId: TurnId): void;
  complete(turnId: TurnId): void;
}

export class InMemoryCheckpointStore implements CheckpointStore {
  private readonly ids = new Set<TurnId>();

  save(turnId: TurnId): void {
    this.ids.add(turnId);
  }

  complete(turnId: TurnId): void {
    this.ids.delete(turnId);
  }

  has(turnId: TurnId): boolean {
    return this.ids.has(turnId);
  }
}
