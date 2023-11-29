use std::path::Path;
use std::time::Duration;

use moka::future::Cache as MokaCache;
use tracing::debug;

#[derive(Clone)]
pub struct Cache {
    inner: MokaCache<String, Vec<u8>>,
}

impl Cache {
    pub fn new(max_capacity: u64, ttl: u64) -> Self {
        let inner = MokaCache::builder()
            .max_capacity(max_capacity)
            .time_to_live(Duration::from_secs(ttl))
            .build();
        Self { inner }
    }

    pub async fn get(&self, key: &str) -> Option<Vec<u8>> {
        debug!(key = %key, "cache: get");
        self.inner.get(key).await
    }

    pub async fn insert(&self, key: String, value: Vec<u8>) {
        debug!(key = %key, "cache: insert");
        self.inner.insert(key, value).await;
    }

    pub async fn invalidate(&self, path: &Path) {
        let key = path.to_string_lossy().into_owned();
        debug!(path = %path.display(), key = %key, "cache: invalidate");
        self.inner.invalidate(&key).await;
    }

    pub async fn invalidate_parent(&self, path: &Path) {
        if let Some(parent) = path.parent() {
            self.invalidate(parent).await;
        }
    }

    pub fn invalidate_all(&self) {
        debug!("cache: invalidate all");
        self.inner.invalidate_all();
    }
}
