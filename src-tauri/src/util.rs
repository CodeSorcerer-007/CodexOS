use std::collections::{HashMap, VecDeque};
use std::hash::Hash;
use std::sync::{Mutex, MutexGuard};

/// Recovers from a poisoned mutex guard without panicking, ensuring resilience
/// in long-running desktop application processes.
pub fn lock_poison_recover<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Global minimum password length for cryptographic vaults and secrets management.
pub const MIN_PASSWORD_LENGTH: usize = 12;

/// A bounded Least-Recently-Used (LRU) cache with deterministic eviction.
///
/// # Complexity
/// - Lookup (`get`): O(1) HashMap probe + O(n) VecDeque scan to update recency order.
/// - Insert (`insert`): O(n) VecDeque scan for existing-key promotion, O(1) eviction.
///
/// For the current max-100-entry AI diagnosis cache this is entirely acceptable.
/// If capacity grows significantly, replace `VecDeque` with an intrusive linked-list
/// or use the `lru` crate for true O(1) amortised operations.
pub struct BoundedLruCache<K, V> {
    capacity: usize,
    map: HashMap<K, V>,
    order: VecDeque<K>,
}

impl<K: Clone + Eq + Hash, V: Clone> BoundedLruCache<K, V> {
    pub fn new(capacity: usize) -> Self {
        Self {
            capacity: capacity.max(1),
            map: HashMap::new(),
            order: VecDeque::new(),
        }
    }

    pub fn get(&mut self, key: &K) -> Option<V> {
        if let Some(val) = self.map.get(key) {
            if let Some(pos) = self.order.iter().position(|k| k == key) {
                self.order.remove(pos);
            }
            self.order.push_back(key.clone());
            Some(val.clone())
        } else {
            None
        }
    }

    pub fn insert(&mut self, key: K, value: V) {
        if self.map.contains_key(&key) {
            if let Some(pos) = self.order.iter().position(|k| k == &key) {
                self.order.remove(pos);
            }
        } else if self.map.len() >= self.capacity {
            if let Some(oldest) = self.order.pop_front() {
                self.map.remove(&oldest);
            }
        }
        self.order.push_back(key.clone());
        self.map.insert(key, value);
    }

    pub fn len(&self) -> usize {
        self.map.len()
    }

    pub fn is_empty(&self) -> bool {
        self.map.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lock_poison_recover() {
        let mutex = Mutex::new(42);
        let _ = std::panic::catch_unwind(|| {
            let mut guard = mutex.lock().unwrap();
            *guard = 99;
            panic!("Simulate poison");
        });

        assert!(mutex.is_poisoned());
        let guard = lock_poison_recover(&mutex);
        assert_eq!(*guard, 99);
    }

    #[test]
    fn test_bounded_lru_cache_eviction() {
        let mut cache = BoundedLruCache::new(2);
        cache.insert("a", 1);
        cache.insert("b", 2);
        assert_eq!(cache.len(), 2);

        // Access "a" so "b" becomes the least recently used
        assert_eq!(cache.get(&"a"), Some(1));

        // Insert "c", which should evict "b"
        cache.insert("c", 3);
        assert_eq!(cache.len(), 2);
        assert_eq!(cache.get(&"b"), None);
        assert_eq!(cache.get(&"a"), Some(1));
        assert_eq!(cache.get(&"c"), Some(3));
    }

    #[test]
    fn test_bounded_lru_cache_update_existing() {
        let mut cache = BoundedLruCache::new(2);
        cache.insert("a", 1);
        cache.insert("a", 100);
        assert_eq!(cache.len(), 1);
        assert_eq!(cache.get(&"a"), Some(100));
    }
}
