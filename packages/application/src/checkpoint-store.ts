import type { TurnId } from "@xiadie/xiadie-core";

declare const checkpointOwnerBrand: unique symbol;
export type CheckpointOwner = symbol & {
  readonly [checkpointOwnerBrand]: true;
};

export interface CheckpointStore {
  save(turnId: TurnId): CheckpointOwner;
  complete(turnId: TurnId, owner: CheckpointOwner): void;
  has(turnId: TurnId): boolean;
}

export class InMemoryCheckpointStore implements CheckpointStore {
  private readonly owners = new Map<TurnId, CheckpointOwner>();

  save(turnId: TurnId): CheckpointOwner {
    const owner = Symbol(`checkpoint-owner:${turnId}`) as CheckpointOwner;
    this.owners.set(turnId, owner);
    return owner;
  }

  complete(turnId: TurnId, owner: CheckpointOwner): void {
    if (this.owners.get(turnId) === owner) this.owners.delete(turnId);
  }

  has(turnId: TurnId): boolean {
    return this.owners.has(turnId);
  }
}
