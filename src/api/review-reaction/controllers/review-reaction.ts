/**
 * review-reaction controller
 * Default CRUD; reaction mutations are handled by review controller (POST /reviews/:id/reaction).
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::review-reaction.review-reaction');
