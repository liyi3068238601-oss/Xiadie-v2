export interface TaskContextInput {
  relevantFacts: string[];
  artifacts: string[];
  constraints: string[];
}

export const buildTaskContext = (input: TaskContextInput): TaskContextInput => ({
  relevantFacts: [...input.relevantFacts],
  artifacts: [...input.artifacts],
  constraints: [...input.constraints],
});
