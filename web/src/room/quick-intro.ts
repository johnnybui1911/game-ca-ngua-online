const STORAGE_KEY = 'ca_quick_intro_seen';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Whether the first-quick-match card was already shown on this device. `storage` is injectable for
 * tests; null or a throwing storage (private mode) means the card is remembered for this page only.
 */
export function createQuickIntro(storage: StorageLike | null) {
  let seen = false;
  const stored = (): boolean => {
    try {
      return storage?.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  };
  return {
    shouldShow: (): boolean => !seen && !stored(),
    markSeen(): void {
      seen = true;
      try {
        storage?.setItem(STORAGE_KEY, '1');
      } catch {
        // private mode: the card stays dismissed for this page only
      }
    },
  };
}

function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export const quickIntro = createQuickIntro(browserStorage());
