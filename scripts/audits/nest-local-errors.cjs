/* global __dirname */
// Jest-only diagnostic: expose exception names/messages for synthetic loopback tests.
const path = require('node:path');
const backend = path.resolve(__dirname, '../../../zwanga-backend/node_modules');
const { NestApplication } = require(path.join(backend, '@nestjs/core/nest-application'));
const original = NestApplication.prototype.useLogger;
NestApplication.prototype.useLogger = function (logger) {
  return original.call(this, logger === false ? ['error'] : logger);
};
