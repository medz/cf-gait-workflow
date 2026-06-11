export type MaybePromise<T> = T | Promise<T>;
export type PickByValue<T, Value> = {
  [K in keyof T as [T[K]] extends [Value] ? K : never]: T[K];
};
export type Values<T> = T[keyof T];
export type Payload<T> = [NonNullable<T>] extends [never] ? {} : NonNullable<T>;
export type Constructor<T extends abstract new (...args: any) => any> = {
  new (...args: ConstructorParameters<T>): InstanceType<T>;
};
