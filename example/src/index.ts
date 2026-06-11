import { WorkerEntrypoint } from "cloudflare:workers";
import { defineGaitEmitter } from "cf-gait-workflow";

export const Deme1 = defineGaitEmitter((e, ctx) => {
  console.log(e, ctx);
});

export const Demo2 = class extends WorkerEntrypoint {};

export class Demo3 extends WorkerEntrypoint {}

export default class extends WorkerEntrypoint {
  async fetch(request: Request): Promise<Response> {
    console.log(this.ctx.exports.Deme1);
    console.log(this.ctx.exports.Demo2);
    console.log(this.ctx.exports.Demo2);
    return Response.json({});
  }
}
