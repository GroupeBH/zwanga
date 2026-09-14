module.exports = function (api) {
  const production = api.env('production');
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ...(production ? ['./scripts/babel-production-logs.js'] : []),
      'react-native-reanimated/plugin',
    ],
  };
};
