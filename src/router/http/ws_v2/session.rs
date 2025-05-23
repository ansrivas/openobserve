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

use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, atomic::AtomicBool},
};

use chrono::{DateTime, Utc};
use config::RwAHashMap;

use super::{
    error::*,
    handler::{ClientId, QuerierName, TraceId},
};

#[derive(Debug, Default)]
pub struct SessionManager {
    sessions: RwAHashMap<ClientId, SessionInfo>,
    mapped_queriers: RwAHashMap<QuerierName, HashSet<TraceId>>,
}

#[derive(Debug, Clone)]
pub struct SessionInfo {
    pub querier_mappings: HashMap<TraceId, QuerierName>,
    pub cookie_expiry: Option<DateTime<Utc>>,
    pub last_active: DateTime<Utc>,
    pub is_session_drain_state: Arc<AtomicBool>,
}

impl SessionManager {
    pub async fn register_client(
        &self,
        client_id: &ClientId,
        cookie_expiry: Option<DateTime<Utc>>,
    ) {
        let r = self.sessions.read().await;
        if r.get(client_id).is_some() {
            drop(r);
            return;
        }
        drop(r);

        let session_info = SessionInfo {
            querier_mappings: HashMap::default(),
            cookie_expiry,
            last_active: Utc::now(),
            is_session_drain_state: Arc::new(AtomicBool::new(false)),
        };

        let mut write_guard = self.sessions.write().await;
        if !write_guard.contains_key(client_id) {
            write_guard.insert(client_id.clone(), session_info.clone());
        }
        drop(write_guard);
    }

    pub async fn update_session_activity(&self, client_id: &ClientId) {
        let mut write_guard = self.sessions.write().await;
        if let Some(session_info) = write_guard.get_mut(client_id) {
            session_info.last_active = chrono::Utc::now();
        }
        drop(write_guard);
    }

    pub async fn remove_trace_id(&self, client_id: &str, trace_id: &str) {
        let querier_name = {
            let mut session_write = self.sessions.write().await;
            let removed_querier_name = session_write
                .get_mut(client_id)
                .and_then(|session_info| session_info.querier_mappings.remove(trace_id));
            drop(session_write);
            removed_querier_name
        };

        if let Some(querier_name) = querier_name {
            log::debug!(
                "[WS::Session] removed querier {querier_name} from sessions-session_info-querier_mappings"
            );
            let mut mapping_write = self.mapped_queriers.write().await;
            if let Some(trace_ids) = mapping_write.get_mut(&querier_name) {
                trace_ids.remove(trace_id);
                log::debug!(
                    "[WS::Session] removed trace_id {trace_id} from mapped_queriers-trace_ids"
                );
                if trace_ids.is_empty() {
                    log::debug!(
                        "[WS::Session] no more trace_id's mapped to querier {querier_name}. removing querier from mapped_queriers"
                    );
                    mapping_write.remove(&querier_name);
                }
            }
            drop(mapping_write);
        }
    }

    pub async fn reached_max_idle_time(&self, client_id: &ClientId) -> bool {
        let r = self.sessions.read().await;
        let is_none = r.get(client_id).is_none_or(|session_info| {
            Utc::now()
                .signed_duration_since(session_info.last_active)
                .num_seconds()
                > config::get_config().websocket.session_idle_timeout_secs
        });
        drop(r);
        is_none
    }

    pub async fn unregister_client(&self, client_id: &ClientId) {
        if let Some(session_info) = self.sessions.write().await.remove(client_id) {
            let mut mapped_querier_write = self.mapped_queriers.write().await;

            for (trace_id, querier_name) in session_info.querier_mappings {
                if let Some(mut trace_ids) = mapped_querier_write.remove(&querier_name) {
                    trace_ids.retain(|tid| tid != &trace_id);
                    if !trace_ids.is_empty() {
                        trace_ids.shrink_to_fit();
                        mapped_querier_write.insert(querier_name.to_string(), trace_ids);
                    }
                }
            }
            drop(mapped_querier_write);
        }
    }

    pub async fn is_client_cookie_valid(&self, client_id: &ClientId) -> bool {
        let r = self.sessions.read().await;
        let is_valid = match r.get(client_id) {
            Some(session_info) => session_info
                .cookie_expiry
                .is_none_or(|expiry| expiry > Utc::now()),
            None => false, // not set is treated as unauthenticated
        };
        drop(r);
        is_valid
    }

    pub async fn remove_querier_connection(&self, querier_name: &str) {
        let client_ids = {
            let (mapped_read, sessions_read) =
                tokio::join!(self.mapped_queriers.read(), self.sessions.read());

            let client_ids = match mapped_read.get(querier_name) {
                Some(_) => sessions_read.keys().cloned().collect::<Vec<_>>(),
                None => {
                    drop(mapped_read);
                    drop(sessions_read);
                    return;
                }
            };
            drop(mapped_read);
            drop(sessions_read);
            client_ids
        };

        // Remove from mapped_querier
        let mut write_guard = self.mapped_queriers.write().await;
        let trace_ids = write_guard.remove(querier_name).unwrap(); // existence validated
        drop(write_guard);

        // Batch update sessions
        let mut session_write = self.sessions.write().await;
        for client_id in client_ids {
            if let Some(session_info) = session_write.get_mut(&client_id) {
                session_info
                    .querier_mappings
                    .retain(|tid, _| !trace_ids.contains(tid));
                session_info.querier_mappings.shrink_to_fit();
            }
        }
        drop(session_write);
    }

    pub async fn set_querier_for_trace(
        &self,
        client_id: &ClientId,
        trace_id: &TraceId,
        querier_name: &QuerierName,
    ) -> WsResult<()> {
        let mut w = self.sessions.write().await;
        w.get_mut(client_id)
            .ok_or(WsError::SessionNotFound(format!("client_id {}", client_id)))?
            .querier_mappings
            .insert(trace_id.clone(), querier_name.clone());
        drop(w);

        // mapped_queriers
        let mut w = self.mapped_queriers.write().await;
        w.entry(querier_name.clone())
            .or_insert_with(HashSet::new)
            .insert(trace_id.clone());
        drop(w);
        Ok(())
    }

    pub async fn get_querier_for_trace(
        &self,
        client_id: &ClientId,
        trace_id: &TraceId,
    ) -> WsResult<Option<QuerierName>> {
        let r = self.sessions.read().await;
        let querier_name = r
            .get(client_id)
            .ok_or(WsError::SessionNotFound(format!("client_id {}", client_id)))?
            .querier_mappings
            .get(trace_id)
            .cloned();
        drop(r);
        Ok(querier_name)
    }

    pub async fn get_querier_connections(&self, client_id: &ClientId) -> Vec<QuerierName> {
        let r = self.sessions.read().await;
        let querier_names = r
            .get(client_id)
            .map(|session_info| session_info.querier_mappings.values().cloned().collect())
            .unwrap_or_default();
        drop(r);
        querier_names
    }

    pub async fn get_trace_ids(&self, client_id: &ClientId) -> Vec<TraceId> {
        let r = self.sessions.read().await;
        let trace_ids = r
            .get(client_id)
            .map(|session_info| session_info.querier_mappings.keys().cloned().collect())
            .unwrap_or_default();
        drop(r);
        trace_ids
    }

    pub async fn is_session_drain_state(&self, client_id: &ClientId) -> Arc<AtomicBool> {
        let r = self.sessions.read().await;
        let is_session_drain_state = r
            .get(client_id)
            .map(|session_info| session_info.is_session_drain_state.clone())
            .unwrap_or(Arc::new(AtomicBool::new(false)));
        drop(r);
        is_session_drain_state
    }
}
