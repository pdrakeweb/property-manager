/** Generic localStorage CRUD store for a typed list. */
export function makeStore<T extends { id: string }>(key: string) {
  function load(): T[] {
    try { return JSON.parse(localStorage.getItem(key) ?? '[]') as T[] }
    catch { return [] }
  }
  function save(items: T[]): void {
    localStorage.setItem(key, JSON.stringify(items))
  }
  return {
    getAll: (): T[] => load(),
    getById: (id: string): T | undefined => load().find(x => x.id === id),
    add: (item: T): void => { const a = load(); a.push(item); save(a) },
    update: (item: T): void => {
      const a = load()
      const i = a.findIndex(x => x.id === item.id)
      if (i >= 0) { a[i] = item; save(a) }
    },
    upsert: (item: T): void => {
      const a = load()
      const i = a.findIndex(x => x.id === item.id)
      if (i >= 0) a[i] = item; else a.push(item)
      save(a)
    },
    remove: (id: string): void => save(load().filter(x => x.id !== id)),
  }
}
