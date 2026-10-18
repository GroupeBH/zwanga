const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { createContactPager } = loader()('features/invite/contactPager.ts');
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const contact = i => ({ id: `synthetic-${i}`, name: `Contact ${i}`, phoneNumbers: [{ number: `000${String(i).padStart(4, '0')}` }] });
function bookReader(book, calls) {
  return async query => {
    calls.push(query);
    assert.deepEqual(query.fields, ['phoneNumbers']);
    assert.ok(query.pageSize > 0 && query.pageSize <= 50);
    const matches = query.name ? book.filter(c => c.name.toLowerCase().includes(query.name)) : book;
    return { data: matches.slice(query.pageOffset, query.pageOffset + query.pageSize), hasNextPage: query.pageOffset + query.pageSize < matches.length, hasPreviousPage: query.pageOffset > 0 };
  };
}

test('contacts load bounded pages, without images, duplicates or truncated final results', async () => {
  const calls = [], pager = createContactPager(bookReader(Array.from({ length: 123 }, (_, i) => contact(i)), calls));
  const signal = new AbortController().signal;
  const a = await pager('', 0, signal), b = await pager('', a.nextOffset, signal), c = await pager('', b.nextOffset, signal);
  assert.deepEqual([a.items.length, b.items.length, c.items.length], [50, 50, 23]);
  assert.equal(c.nextOffset, null); assert.equal(new Set([...a.items, ...b.items, ...c.items].map(c => c.id)).size, 123);
  assert.equal(calls.length, 3);
});

test('name and formatted-number searches find contacts beyond the displayed page', async () => {
  const book = Array.from({ length: 501 }, (_, i) => contact(i));
  book[500] = { ...contact(500), name: 'Last Synthetic', phoneNumbers: [{ number: '+000 (999) 888' }] };
  const calls = [], pager = createContactPager(bookReader(book, calls)), signal = new AbortController().signal;
  const named = await pager('Last Synthetic', 0, signal);
  assert.equal(named.items[0].id, 'synthetic-500'); assert.equal(calls.length, 1);
  const numbered = await pager('999888', 0, signal);
  assert.equal(numbered.items[0].id, 'synthetic-500'); assert.equal(numbered.nextOffset, null);
  assert.ok(calls.length > 2);
});

test('empty/no-number native pages are skipped without declaring the whole book empty', async () => {
  const calls = [], book = Array.from({ length: 100 }, (_, i) => ({ id: `empty-${i}`, name: 'No number' })).concat([contact(100)]);
  const result = await createContactPager(bookReader(book, calls))('', 0, new AbortController().signal);
  assert.deepEqual(result.items.map(c => c.id), ['synthetic-100']); assert.equal(result.nextOffset, null);
});

test('cancelled native reads cannot publish results or overlap with a newer search', async () => {
  let resolve, calls = 0, running = 0, max = 0;
  const pager = createContactPager(async () => {
    calls++; running++; max = Math.max(max, running);
    try { return await new Promise(done => { resolve = done; }); } finally { running--; }
  });
  const old = new AbortController(), next = new AbortController();
  const first = pager('', 0, old.signal), rejected = assert.rejects(first, { name: 'AbortError' });
  await flush(); old.abort();
  const second = pager('new', 0, next.signal); await flush(); assert.equal(calls, 1);
  resolve({ data: [contact(1)], hasNextPage: false }); await flush();
  assert.equal(calls, 2); resolve({ data: [{ ...contact(2), name: 'new' }], hasNextPage: false });
  await rejected; assert.equal((await second).items[0].id, 'synthetic-2'); assert.equal(max, 1);
});

test('native failure is recoverable on retry', async () => {
  let fail = true;
  const pager = createContactPager(async () => { if (fail) throw Error('native'); return { data: [contact(1)], hasNextPage: false }; });
  await assert.rejects(pager('', 0, new AbortController().signal)); fail = false;
  assert.equal((await pager('', 0, new AbortController().signal)).items.length, 1);
});

test('contact hook debounces search, pauses on blur and rechecks denied permission on return', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hooks = hookHarness(), calls = [];
  let status = 'granted';
  const useInviteContacts = loader({ react: hooks.react, 'expo-contacts': {
    getPermissionsAsync: async () => ({ status, canAskAgain: false }),
    requestPermissionsAsync: () => { throw Error('must not re-prompt'); },
    getContactsAsync: bookReader([contact(1)], calls),
  } })('hooks/invite/useInviteContacts.ts').useInviteContacts;
  const render = (active = true) => hooks.render(() => useInviteContacts(active));
  render(); await flush(); render(); t.mock.timers.tick(0); await flush();
  assert.equal(render().contacts.length, 1);
  render().changeSearch('Cont'); render(); t.mock.timers.tick(200);
  render().changeSearch('Contact'); render(); t.mock.timers.tick(349); assert.equal(calls.length, 1);
  t.mock.timers.tick(1); await flush(); assert.equal(calls.length, 2);
  render().changeSearch('Another'); render(); render(false); t.mock.timers.tick(1000); await flush();
  assert.equal(calls.length, 2);
  status = 'denied'; render(true); await flush(); render();
  assert.equal(render().permission, 'denied'); hooks.unmount();
});
