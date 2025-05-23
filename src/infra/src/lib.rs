// Copyright 2025 OpenObserve Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

#![feature(btree_extract_if)]

pub mod cache;
pub mod cluster_coordinator;
pub mod db;
pub mod dist_lock;
pub mod errors;
pub mod file_list;
pub mod local_lock;
pub mod pipeline;
pub mod queue;
pub mod scheduler;
pub mod schema;
pub mod storage;
pub mod table;

pub async fn init() -> Result<(), anyhow::Error> {
    db::init().await?;
    cache::init().await?;
    file_list::create_table().await?;
    file_list::LOCAL_CACHE.create_table().await?;
    file_list::local_cache_gc().await?;
    if !config::is_local_disk_storage() {
        storage::remote::test_config().await?;
    }
    pipeline::init().await?;
    queue::init().await?;
    scheduler::init().await?;
    schema::init().await?;
    table::init().await?;
    // because of asynchronous, we need to wait for a while
    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
    Ok(())
}
