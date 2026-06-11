import { WorkerEntrypoint } from "cloudflare:workers";
import { defineGaitEmitter } from "cf-gait-workflow";

export const Emitter = defineGaitEmitter((e, ctx) => {
  console.log(e, ctx);
});

export default class extends WorkerEntrypoint {
  async fetch(request: Request): Promise<Response> {
    return Response.json({});
  }
}
