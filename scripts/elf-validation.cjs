const MACHINES = { 'armeabi-v7a': [1, 40], 'arm64-v8a': [2, 183], x86: [1, 3], x86_64: [2, 62] };

function validateElf(elf, abi) {
  const expected = MACHINES[abi];
  if (!expected) throw new Error(`Architecture inconnue : ${abi}`);
  const [bits, machine] = expected;
  const is64 = bits === 2, headerSize = is64 ? 64 : 52;
  if (elf.length < headerSize || elf.readUInt32BE(0) !== 0x7f454c46 ||
      elf[4] !== bits || elf[5] !== 1 || elf.readUInt16LE(18) !== machine) {
    throw new Error('format ELF incompatible');
  }
  const number64 = offset => {
    const value = elf.readBigUInt64LE(offset);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('offset ELF hors limites');
    return Number(value);
  };
  const offset = is64 ? number64(32) : elf.readUInt32LE(28);
  const stride = elf.readUInt16LE(is64 ? 54 : 42);
  const count = elf.readUInt16LE(is64 ? 56 : 44);
  if (!count || count > 4096 || stride < (is64 ? 56 : 32) || offset < headerSize ||
      offset + count * stride > elf.length) throw new Error('table de segments ELF invalide');
  let loads = 0;
  for (let i = 0; i < count; i++) {
    const entry = offset + i * stride;
    if (elf.readUInt32LE(entry) !== 1) continue; // PT_LOAD
    loads++;
    const fileOffset = is64 ? number64(entry + 8) : elf.readUInt32LE(entry + 4);
    const address = is64 ? number64(entry + 16) : elf.readUInt32LE(entry + 8);
    const fileSize = is64 ? number64(entry + 32) : elf.readUInt32LE(entry + 16);
    const memorySize = is64 ? number64(entry + 40) : elf.readUInt32LE(entry + 20);
    const alignment = is64 ? number64(entry + 48) : elf.readUInt32LE(entry + 28);
    const page = is64 ? 16384 : 4096;
    if (alignment < page || !Number.isInteger(Math.log2(alignment)) ||
        fileOffset % alignment !== address % alignment) {
      throw new Error(`segment LOAD non aligné ${page / 1024} Ko`);
    }
    if (fileSize > memorySize || fileOffset + fileSize > elf.length) throw new Error('segment LOAD tronqué');
  }
  if (!loads) throw new Error('aucun segment LOAD');
}

module.exports = { MACHINES, validateElf };
