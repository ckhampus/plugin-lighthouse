'use strict';

const camelCase = require('lodash.camelcase');

const METRIC_NAMES = require('./metrics');

class Aggregator {
  constructor(statsHelpers) {
    this.statsHelpers = statsHelpers;
    this.stats = {};
    this.groups = {};
  }

  addToAggregate(data, group) {
    const stats = this.stats;
    const groups = this.groups;
    const statsHelpers = this.statsHelpers;

    if (groups[group] === undefined) {
      groups[group] = {};
    }

    METRIC_NAMES.forEach(function(metric) {
      let value;

      if (metric == 'critical-request-chains') {
        value = parseInt(data.audits[metric].displayValue);
      } else {
        value = parseInt(data.audits[metric].rawValue);
      }

      statsHelpers.pushGroupStats(stats, groups[group], metric, value);
    });
  }

  summarize() {
    const statsHelpers = this.statsHelpers;

    if (
      Object.keys(this.stats).length === 0 ||
      Object.keys(this.groups).length === 0
    )
      return undefined;

    const summary = {
      groups: {}
    };
    const tmp = {};
    for (let group of Object.keys(this.groups)) {
      for (let stat of Object.keys(this.stats)) {
        statsHelpers.setStatsSummary(tmp, camelCase(stat), this.stats[stat]);
      }
      summary.groups[group] = tmp;
    }

    return summary;
  }
}

module.exports = Aggregator;
