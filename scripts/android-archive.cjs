const fs = require('node:fs');
const { Buffer } = require('node:buffer');
const zlib = require('node:zlib');

/** Central-directory reads only; do not load a several-hundred-MB app bundle into memory. */
function openArchive(filename) {
  const fd = fs.openSync(filename, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const read = (length, offset) => {
      if (offset < 0 || offset + length > size) throw new Error('Archive ZIP tronquée.');
      const buffer = Buffer.alloc(length);
      if (fs.readSync(fd, buffer, 0, length, offset) !== length) throw new Error('Lecture ZIP incomplète.');
      return buffer;
    };
    const tail = read(Math.min(size, 65557), Math.max(0, size - 65557));
    let eocd = tail.length - 22;
    while (eocd >= 0 && (tail.readUInt32LE(eocd) !== 0x06054b50 ||
      eocd + 22 + tail.readUInt16LE(eocd + 20) !== tail.length)) eocd--;
    if (eocd < 0) throw new Error('Répertoire ZIP introuvable.');
    const count = tail.readUInt16LE(eocd + 10), length = tail.readUInt32LE(eocd + 12), offset = tail.readUInt32LE(eocd + 16);
    if (count === 0xffff || length > 32 * 1024 * 1024 || offset === 0xffffffff) throw new Error('ZIP64 non pris en charge par ce contrôle.');
    const directory = read(length, offset), entries = [];
    let cursor = 0;
    for (let i = 0; i < count; i++) {
      if (cursor + 46 > directory.length || directory.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Répertoire ZIP invalide.');
      const nameLength = directory.readUInt16LE(cursor + 28), extraLength = directory.readUInt16LE(cursor + 30), commentLength = directory.readUInt16LE(cursor + 32);
      const end = cursor + 46 + nameLength + extraLength + commentLength;
      if (end > directory.length) throw new Error('Entrée ZIP tronquée.');
      entries.push({ name: directory.toString('utf8', cursor + 46, cursor + 46 + nameLength),
        method: directory.readUInt16LE(cursor + 10), compressed: directory.readUInt32LE(cursor + 20),
        size: directory.readUInt32LE(cursor + 24), offset: directory.readUInt32LE(cursor + 42) });
      cursor = end;
    }
    return { entries, close: () => fs.closeSync(fd), content(entry) {
      if (entry.size > 32 * 1024 * 1024 || entry.compressed > 32 * 1024 * 1024) throw new Error('Bibliothèque trop volumineuse pour ce contrôle.');
      const local = read(30, entry.offset);
      if (local.readUInt32LE(0) !== 0x04034b50) throw new Error('En-tête ZIP local invalide.');
      const data = read(entry.compressed, entry.offset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28));
      if (entry.method === 0) return data;
      if (entry.method === 8) return zlib.inflateRawSync(data, { maxOutputLength: 32 * 1024 * 1024 });
      throw new Error('Compression ZIP non prise en charge.');
    } };
  } catch (error) { fs.closeSync(fd); throw error; }
}

module.exports = { openArchive };
