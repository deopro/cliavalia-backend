'use strict';

const settingsController = require('../controllers/settings');
const routes = require('../routes');

module.exports = {
  register({ strapi }) {
    // Plugin registered
  },
  bootstrap({ strapi }) {
    // Plugin bootstrapped
  },
  controllers: {
    settings: settingsController,
  },
  routes,
};
