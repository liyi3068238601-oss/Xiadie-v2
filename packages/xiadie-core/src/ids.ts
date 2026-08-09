declare const turnIdBrand: unique symbol;

export type TurnId = string & { readonly [turnIdBrand]: true };

export const asTurnId = (value: string): TurnId => value as TurnId;
