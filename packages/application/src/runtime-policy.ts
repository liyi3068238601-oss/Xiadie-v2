export interface RuntimePolicy {
  allowedTaskTypes: string[];
  allowedTools: string[];
  workspaceRoot: string;
}
