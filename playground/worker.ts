import { env } from "cloudflare:workers";
import {
  defineGaitEmitter,
  defineGaitWorkflowEntrypoint,
} from "cf-gait-workflow";

export const GaitEmitter = defineGaitEmitter((e, ctx) => {
  console.log(e, ctx);
});

export const Workflow = defineGaitWorkflowEntrypoint(async (event, gait) => {
  await gait.sleep("Test", 12);
});

export default {
  async fetch(): Promise<Response> {
    const instance = await env.GAIT_EMITTER.create();
    return Response.json({
      id: instance.id,
      status: await instance.status(),
    });
  },
} satisfies ExportedHandler;
