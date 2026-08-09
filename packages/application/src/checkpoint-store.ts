import type { TurnId } from "@xiadie/xiadie-core";

export type CheckpointOwner = symbol;

export interface CheckpointStore {
  save(turnId: TurnId, owner: CheckpointOwner): void;
  complete(turnId: TurnId, owner: CheckpointOwner): void;
}

export class InMemoryCheckpointStore implements CheckpointStore {
  private readonly owners = new Map<TurnId, CheckpointOwner>();

  save(turnId: TurnId, owner: CheckpointOwner): void {
    this.owners.set(turnId, owner);
  }

  complete(turnId: TurnId, owner: CheckpointOwner): void {
    if (this.owners.get(turnId) === owner) this.owners.delete(turnId);
  }

  has(turnId: TurnId): boolean {
    return this.owners.has(turnId);
  }
}
