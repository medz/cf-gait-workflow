import { exports, WorkerEntrypoint } from "cloudflare:workers";
import { defineGaitEmitter, type Binding } from "cf-gait-workflow";

export const Emitter = defineGaitEmitter((e, ctx) => {
  console.log(e, ctx);
});

export default class extends WorkerEntrypoint {
  async fetch(request: Request): Promise<Response> {
    exports.Emitter;
    return Response.json({});
  }
}
