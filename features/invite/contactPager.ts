import type { ExistingContact, ContactQuery, ContactResponse } from 'expo-contacts';

export const CONTACT_PAGE_SIZE = 50;
export type ContactPage = { items: ExistingContact[]; nextOffset: number | null };
const cancelled = () => Object.assign(new Error('Contact search cancelled'), { name: 'AbortError' });

/** At most one native read in flight and one result page retained by the caller. */
export function createContactPager(read: (query: ContactQuery) => Promise<ContactResponse>) {
  let tail: Promise<unknown> = Promise.resolve();
  const readSerial = (query: ContactQuery, signal: AbortSignal) => {
    const result = tail.then(() => {
      if (signal.aborted) throw cancelled();
      return read(query);
    });
    tail = result.catch(() => undefined);
    return result;
  };
  return async (search: string, startOffset: number, signal: AbortSignal): Promise<ContactPage> => {
    const query = search.trim().toLocaleLowerCase();
    const digits = query.replace(/\D/g, '');
    const phoneSearch = Boolean(digits) && /^[\d\s+().-]+$/.test(query);
    const items: ExistingContact[] = [];
    let offset = startOffset;
    while (items.length < CONTACT_PAGE_SIZE) {
      if (signal.aborted) throw cancelled();
      const page = await readSerial({
        fields: ['phoneNumbers'], sort: 'firstName',
        pageSize: CONTACT_PAGE_SIZE - items.length, pageOffset: offset,
        // Native name search covers the whole book. Number search scans bounded
        // native pages, including contacts outside previously displayed pages.
        ...(query && !phoneSearch ? { name: query } : {}),
      }, signal);
      if (signal.aborted) throw cancelled();
      for (const contact of page.data) {
        if (!contact.phoneNumbers?.some(phone => phone.number)) continue;
        const matches = !query || contact.name?.toLocaleLowerCase().includes(query) ||
          contact.phoneNumbers.some(phone => phone.number?.toLocaleLowerCase().includes(query) ||
            (phoneSearch && phone.number?.replace(/\D/g, '').includes(digits)));
        if (matches) items.push(contact);
      }
      offset += page.data.length;
      if (!page.hasNextPage || page.data.length === 0) return { items, nextOffset: null };
      if (items.length >= CONTACT_PAGE_SIZE) return { items, nextOffset: offset };
      // Let input/cancellation run between native pages, even with synchronous mocks.
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    return { items, nextOffset: offset };
  };
}
