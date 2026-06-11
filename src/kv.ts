import { WorkerEntrypoint } from "cloudflare:workers";
import type { MaybePromise } from "./utils";

export abstract class AsyncKvStorageWorkerEntrypoint<
  Env,
  Props,
> extends WorkerEntrypoint<Env, Props> {
  abstract get<T = unknown>(key: string): MaybePromise<T | undefined>;
  abstract put<T>(key: string, value: T): MaybePromise<void>;
  abstract delete(key: string): MaybePromise<boolean>;
}

export type AsyncKvStorage = Pick<
  InstanceType<typeof AsyncKvStorageWorkerEntrypoint>,
  "get" | "put" | "delete"
>;

export type AsyncKvStorageFactory<Env, Props> = (
  ctx: ExecutionContext<Props>,
  env: Env,
) => MaybePromise<AsyncKvStorage>;

export function defineAsyncKvStorage<Env = Cloudflare.Env, Props = {}>(
  kv: AsyncKvStorage,
): typeof AsyncKvStorageWorkerEntrypoint<Env, Props>;
export function defineAsyncKvStorage<Env = Cloudflare.Env, Props = {}>(
  factory: AsyncKvStorageFactory<Env, Props>,
): typeof AsyncKvStorageWorkerEntrypoint<Env, Props>;
export function defineAsyncKvStorage<Env = Cloudflare.Env, Props = {}>(
  factoryOrKv: AsyncKvStorageFactory<Env, Props> | AsyncKvStorage,
): typeof AsyncKvStorageWorkerEntrypoint<Env, Props> {
  const factory =
    typeof factoryOrKv === "function" ? factoryOrKv : () => factoryOrKv;

  return class extends AsyncKvStorageWorkerEntrypoint<Env, Props> {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      return (await this.#resolve()).get(key);
    }

    async put<T>(key: string, value: T): Promise<void> {
      return (await this.#resolve()).put(key, value);
    }

    async delete(key: string): Promise<boolean> {
      return (await this.#resolve()).delete(key);
    }

    #storage:
      | AsyncKvStorage
      | Pick<SyncKvStorage, keyof AsyncKvStorage>
      | undefined;

    async #resolve() {
      if (!this.#storage) {
        this.#storage = await factory(this.ctx, this.env);
      }

      return this.#storage;
    }
  };
}
