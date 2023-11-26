// Copyright 2023 Zinc Labs Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

use crate::common::infra::errors::Error as OpenObserveError;
use ldap3::{result::Result as LdapResult, LdapConnAsync, LdapError, Scope, SearchEntry};
use leon::Template;
use std::collections::HashMap;

pub struct Ldap {
    /// Base URL of the LDAP server.
    pub url: String,

    pub bind_dn: String,
    pub bind_password: String,

    pub user_search_base: String,
    pub user_search_filter: String,
    // pub search_filter: String,
    // pub search_base_dns: String,
}

impl Ldap {
    pub fn new(
        url: String,

        bind_dn: String,
        bind_password: String,
        user_search_base: String,
        user_search_filter: String,
    ) -> Ldap {
        Ldap {
            url,
            bind_dn,
            bind_password,
            user_search_base,
            user_search_filter,
        }
    }

    /// Authenticate a user against the LDAP server.
    pub async fn authenticate(
        &self,
        username: &str,
        password: &str,
    ) -> Result<(), OpenObserveError> {
        let user_dn = format!("uid={},{}", username, self.bind_dn); // DN of the user

        // Establish LDAP connection
        let (conn, mut ldap) = LdapConnAsync::new(&self.url).await?;
        ldap3::drive!(conn);

        let bind = ldap.simple_bind(&user_dn, password).await?;
        log::info!("");
        bind.success()?;
        ldap.unbind().await?;
        log::info!("LDAP authentication successful for {}", username);
        Ok(())
    }

    /// List all the ldap groups, a user belongs to
    pub async fn list(&self, username: &str) -> Result<Vec<String>, OpenObserveError> {
        // Establish LDAP connection asynchronously
        let (conn, mut ldap) = LdapConnAsync::new(&self.url).await?;
        ldap3::drive!(conn);
        ldap.simple_bind(&self.bind_dn, &self.bind_password)
            .await?
            .success()?;

        // let user = "user4";
        let user = username;
        // Step 1: Find the DN of the user

        let template = Template::parse(&self.user_search_filter).unwrap();
        let mut values = HashMap::new();
        values.insert("id", username);
        let user_search_filter = template.render(&values).unwrap();
        let (user_entries, _) = ldap
            .search(
                "ou=users,dc=myorg,dc=com",
                Scope::Subtree,
                &user_search_filter,
                vec!["dn"],
            )
            .await?
            .success()?;

        let groups = if let Some(user_entry) = user_entries.into_iter().next() {
            let user_dn = SearchEntry::construct(user_entry).dn;

            // Step 2: Search for groups containing the user
            let group_search_filter = format!("(member={})", user_dn);
            let (group_entries, _) = ldap
                .search(
                    "ou=groups,dc=myorg,dc=com",
                    Scope::Subtree,
                    &group_search_filter,
                    vec!["cn"],
                )
                .await?
                .success()?;

            let groups: Vec<Vec<String>> = group_entries
                .into_iter()
                .map(|entry| {
                    let search_entry = SearchEntry::construct(entry);
                    search_entry.attrs.get("cn").unwrap_or(&Vec::new()).clone()
                })
                .collect();
            groups
            // for entry in group_entries {
            //     let entry = SearchEntry::construct(entry);
            //     println!(
            //         "For user: {user} Group: {:?}",
            //         entry.attrs.get("cn").unwrap_or(&Vec::new())
            //     );
            // }
        } else {
            println!("User not found");
            return Err(OpenObserveError::LDAPError(LdapError::AddNoValues));
        };

        ldap.unbind().await?;
        Ok(groups.into_iter().flatten().collect())
    }
}
