const { compressCommand } = require('./commands/compress');
const { analyzeCommand } = require('./commands/analyze');
const { configCommand } = require('./commands/config');

module.exports = {
  compress: compressCommand,
  analyze: analyzeCommand,
  config: configCommand,
};  