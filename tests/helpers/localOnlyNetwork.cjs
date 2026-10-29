// Test-only preload: refuse remote TCP before loading any application modules.
const net = require('node:net');
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const options = Array.isArray(args[0]) ? args[0][0] : net._normalizeArgs(args)[0];
  if (!['127.0.0.1', '::1'].includes(options.host) || options.path) {
    throw new Error('LOCAL_JOURNEY_EXTERNAL_CONNECTION_BLOCKED');
  }
  return connect.apply(this, args);
};
