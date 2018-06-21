'use strict';

const fs = require('fs');
const path = require('path');
const lighthouse = require('lighthouse');
const chromeLauncher = require('chrome-launcher');
const camelCase = require('lodash.camelcase');
const Aggregator = require('./aggregator');

const METRIC_NAMES = require('./metrics');
const DEFAULT_METRICS_PAGESUMMARY = METRIC_NAMES.map(camelCase);

const flags = {
  chromeFlags: ['--no-sandbox', '--disable-gpu', '--headless']
};

const perfConfig = Object.assign(
  require('lighthouse/lighthouse-core/config/perf.json'),
  {
    passes: [
      {
        passName: 'defaultPass',
        recordTrace: true,
        pauseAfterLoadMs: 5250,
        networkQuietThresholdMs: 5250,
        cpuQuietThresholdMs: 5250,
        useThrottling: true,
        gatherers: []
      }
    ],
    audits: METRIC_NAMES
  }
);

function launchChromeAndRunLighthouse(url, flags = {}, config = null) {
  return chromeLauncher.launch(flags).then(chrome => {
    flags.port = chrome.port;
    return lighthouse(url, flags, config).then(results => {
      delete results.artifacts;
      return chrome.kill().then(() => results);
    });
  });
}

module.exports = {
  concurrency: 1,
  name() {
    return 'lighthouse';
  },
  open(context, options) {
    this.make = context.messageMaker('lighthouse').make;
    this.log = context.intel.getLogger('sitespeedio.plugin.lighthouse');
    context.filterRegistry.registerFilterForType(
      DEFAULT_METRICS_PAGESUMMARY,
      'lighthouse.pageSummary'
    );

    flags.extraHeaders = Object.assign(
      {},
      ...options.requestheader.map(header => {
        const [key, value] = header.split(':');
        return { [key]: value };
      })
    );

    this.pug = fs.readFileSync(
      path.resolve(__dirname, 'pug', 'index.pug'),
      'utf8'
    );
    this.aggregator = new Aggregator(context.statsHelpers);
  },
  processMessage(message, queue) {
    const make = this.make;
    const log = this.log;
    const aggregator = this.aggregator;

    // if (message.url) {
    //   console.log(message);
    // }

    switch (message.type) {
      case 'sitespeedio.setup': {
        queue.postMessage(
          make('html.pug', {
            id: 'lighthouse',
            name: 'Lighthouse',
            pug: this.pug,
            type: 'pageSummary'
          })
        );
        break;
      }
      case 'browsertime.har': {
        const url = message.url;
        const group = message.group;
        log.info(`Collecting Lighthouse result for ${url}`);
        return launchChromeAndRunLighthouse(url, flags, perfConfig)
          .then(results => {
            aggregator.addToAggregate(results, group);
            const summary = aggregator.summarize();
            if (summary) {
              for (let group of Object.keys(summary.groups)) {
                queue.postMessage(
                  make('lighthouse.pageSummary', summary.groups[group], {
                    url,
                    group
                  })
                );
              }
            }
            log.info('Finished collecting Lighthouse result');
          })
          .catch(err => {
            log.error('Error creating Lighthouse result ', err);
            queue.postMessage(
              make('error', err, {
                url
              })
            );
          });
      }
    }
  }
};
