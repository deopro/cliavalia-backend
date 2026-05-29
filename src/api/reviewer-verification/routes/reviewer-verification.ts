import { factories } from "@strapi/strapi";

export default factories.createCoreRouter("api::reviewer-verification.reviewer-verification", {
  config: {
    find: { auth: false, policies: [], middlewares: [] },
    findOne: { auth: false, policies: [], middlewares: [] },
    create: {
      // Authenticated users only - controller checks ctx.state.user
      policies: [],
      middlewares: [],
    },
    update: { auth: false, policies: [], middlewares: [] },
    delete: { auth: false, policies: [], middlewares: [] },
  },
});
