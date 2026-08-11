import type { SelfRequest } from "@xiadie/xiadie-core";
import { snapshotSelfRequest } from "./self-request-snapshot.js";

export const assembleSelfRequest = (input: SelfRequest): SelfRequest =>
  snapshotSelfRequest(input);
