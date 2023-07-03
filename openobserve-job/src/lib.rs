use crate::infra::config::{CONFIG, INSTANCE_ID, SYSLOG_ENABLED};
use crate::infra::{cluster, ider};
use crate::meta::organization::DEFAULT_ORG;
use crate::meta::user::UserRequest;
use crate::service::{db, users};
use regex::Regex;

mod alert_manager;
mod compact;
mod file_list;
mod files;
mod metrics;
mod prom;
pub(crate) mod syslog_server;
mod telemetry;
