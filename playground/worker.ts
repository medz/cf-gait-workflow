import { exports, WorkerEntrypoint } from "cloudflare:workers";
import {
  defineGaitEmitter,
  defineGaitWorkflowEntrypoint,
} from "cf-gait-workflow";

export const Emitter = defineGaitEmitter((e, ctx) => {
  console.log(e, ctx);
});

export const WORKFLOW1 = defineGaitWorkflowEntrypoint((event, gait) => {
  return 1;
});

export const WORKFLOW2 = defineGaitWorkflowEntrypoint("Emitter", () => {
  return 1;
});

export default class extends WorkerEntrypoint {
  override async fetch(request: Request): Promise<Response> {
    exports.Emitter;
    return Response.json({});
  }
}
