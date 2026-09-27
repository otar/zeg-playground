// The Vitest configuration of `npm run test:mutation` (stryker.config.js, D-75).
// It contains only the unit project of vitest.config.js.
import config from './vitest.config.js';

export default {
  test: {
    projects: config.test.projects.filter((project) => project.test.name === 'unit'),
  },
};
