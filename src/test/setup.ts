import '@testing-library/jest-dom/vitest'

function createMemoryStorage(): Storage {
  const values = new Map<string, string>()

  return {
    get length() {
      return values.size
    },
    clear() {
      values.clear()
    },
    getItem(key) {
      return values.get(key) ?? null
    },
    key(index) {
      return Array.from(values.keys())[index] ?? null
    },
    removeItem(key) {
      values.delete(key)
    },
    setItem(key, value) {
      values.set(key, value)
    },
  }
}

const testLocalStorage = createMemoryStorage()

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: testLocalStorage,
})

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: testLocalStorage,
})

class TestStorageEvent extends Event {
  key: string | null
  newValue: string | null
  oldValue: string | null
  storageArea: Storage | null
  url: string

  constructor(type: string, eventInitDict: StorageEventInit = {}) {
    super(type)
    this.key = eventInitDict.key ?? null
    this.newValue = eventInitDict.newValue ?? null
    this.oldValue = eventInitDict.oldValue ?? null
    this.storageArea = eventInitDict.storageArea ?? null
    this.url = eventInitDict.url ?? ''
  }
}

Object.defineProperty(window, 'StorageEvent', {
  configurable: true,
  value: TestStorageEvent,
})

Object.defineProperty(globalThis, 'StorageEvent', {
  configurable: true,
  value: TestStorageEvent,
})
