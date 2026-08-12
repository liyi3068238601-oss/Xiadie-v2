export type ModelId = `${string}/${string}`;

export const parseModel = (value: string | undefined): ModelId => {
  if (value === undefined || value.trim().length === 0) throw new Error("xiadie_model_missing");
  const model = value.trim();
  if (!/^[a-z0-9][a-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(model)) {
    throw new Error("xiadie_model_invalid");
  }
  return model as ModelId;
};
