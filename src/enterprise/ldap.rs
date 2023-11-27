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

use crate::common::infra::errors::{Error as OpenObserveError, LdapCustomError};
use ldap3::{result::Result as LdapResult, LdapConnAsync, LdapError, Scope, SearchEntry};
use leon::Template;
use std::collections::HashMap;

pub struct LdapAuthentication {
    /// Base URL of the LDAP server.
    pub url: String,

    pub bind_dn: String,
    pub bind_password: String,

    pub user_search_base: String,
    pub user_search_filter: String,
    // pub search_filter: String,
    // pub search_base_dns: String,
}

impl LdapAuthentication {
    pub fn new(
        url: String,

        bind_dn: String,
        bind_password: String,
        user_search_base: String,
        user_search_filter: String,
    ) -> LdapAuthentication {
        LdapAuthentication {
            url,
            bind_dn,
            bind_password,
            user_search_base,
            user_search_filter,
        }
    }

    async fn sanitize_group_query(dn: &str) -> &str {
        return "";
    }

    async fn sanitize_group_filter(dn: &str) -> &str {
        return "";
    }

    async fn sanitize_user_query(dn: &str) -> &str {
        return "";
    }

    async fn sanitize_user_dn(dn: &str) -> &str {
        return "";
    }

    /// Find user dn from username
    pub async fn get_user_dn(
        &self,
        mut ldap: ldap3::Ldap,
        username: &str,
    ) -> Result<String, OpenObserveError> {
        let template = Template::parse(&self.user_search_filter).unwrap();
        let mut values = HashMap::new();
        values.insert("id", username);
        let user_search_filter = template.render(&values).unwrap();

        println!("Searching for user with filter {:?}", &user_search_filter);
        let user_dn_attribute = vec!["dn"];
        let (user_entries, _) = ldap
            .search(
                &self.user_search_base,
                Scope::Subtree,
                &user_search_filter,
                user_dn_attribute,
            )
            .await?
            .success()?;

        let user_entries_len = user_entries.len();
        if user_entries_len < 1 {
            log::debug!("Failed search using filter  {:?}", &self.user_search_filter);
            return Err(OpenObserveError::LdapCustomError(
                LdapCustomError::UserNotFound,
            ));
        } else if user_entries_len > 1 {
            log::debug!(
                "Filter '{:?}' returned more than one user.",
                &self.user_search_filter
            );
            return Err(OpenObserveError::LdapCustomError(
                LdapCustomError::UserNotFound,
            ));
        };

        let user_dn = SearchEntry::construct(user_entries[0].clone()).dn;
        if user_dn == "" {
            log::error!("LDAP search was successful, but found no DN!");
            return Err(OpenObserveError::LdapCustomError(
                LdapCustomError::UserNotFound,
            ));
        }

        return Ok(user_dn);
    }

    /// List all the groups of a given user
    pub async fn list_user_groups(
        &self,
        mut ldap: ldap3::Ldap,
        uid: &str,
        group_filter: &str,
    ) -> Result<Vec<String>, OpenObserveError> {
        Ok(vec![])
    }

    /// Authenticate a user against the LDAP server.
    pub async fn authenticate(
        &self,
        mut ldap: ldap3::Ldap,
        username: &str,
        password: &str,
    ) -> Result<(), OpenObserveError> {
        // Establish LDAP connection
        // let (conn, mut ldap) = LdapConnAsync::new(&self.url).await?;
        // ldap3::drive!(conn);

        // Authenticate using bind-dn, ensuring that self.bind_dn and self.bind_password isnt empty
        let (user, pass) = if !self.bind_dn.is_empty() && !self.bind_password.is_empty() {
            log::debug!("Using bind-dn login for LDAP authentication");
            (self.bind_dn.as_ref(), self.bind_password.as_ref())
        } else {
            log::debug!("Using anonymous login for LDAP authentication");
            (username, password)
        };

        let bind = ldap.simple_bind(user, pass).await?;
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
        // let user = username;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_authentication() {
        let ldap_auth = LdapAuthentication::new(
            "ldap://localhost:389".to_string(),
            "cn=admin,dc=zinclabs,dc=com".to_string(),
            "admin".to_string(),
            "ou=users,dc=zinclabs,dc=com".to_string(),
            "(&(objectClass=inetOrgPerson)(uid={id}))".to_string(),
        );

        let (conn, mut ldap) = LdapConnAsync::new(&ldap_auth.url).await.unwrap();
        ldap3::drive!(conn);

        ldap_auth
            .authenticate(ldap.clone(), "user4", "user4")
            .await
            .unwrap();

        let response = ldap_auth.get_user_dn(ldap, "user4").await.unwrap();
        println!("response: {:?}", response);
        assert!(false)
    }
}
