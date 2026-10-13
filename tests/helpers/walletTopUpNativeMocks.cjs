const { randomUUID } = require('node:crypto');
// Real intent policy, native disk/UUID boundaries only. Isolated storage per test fixture.
module.exports = function walletTopUpNativeMocks() {
  const disk = new Map();
  return {
    'expo-crypto': { randomUUID },
    '@react-native-async-storage/async-storage': {
      getItem: async key => disk.get(key) ?? null,
      setItem: async (key, value) => { disk.set(key, value); },
      removeItem: async key => { disk.delete(key); },
    },
  };
};
