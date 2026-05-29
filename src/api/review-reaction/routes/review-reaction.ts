/**
 * review-reaction router
 * Custom reaction API is on review routes: GET/POST /reviews/:id/reactions, /reviews/:id/reaction.
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::review-reaction.review-reaction');
