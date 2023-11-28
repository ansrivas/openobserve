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
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct LdapAuthentication {
    /// Base URL of the LDAP server.
    pub url: String,

    pub bind_dn: String,
    pub bind_password: String,

    pub user_search_base: String,
    pub user_search_filter: String,
    pub group_search_filter: String,
    pub group_search_base: String,

    pub username_attribute: Option<String>,
    pub first_name_attribute: Option<String>,
    pub last_name_attribute: Option<String>,
    pub email_attribute: Option<String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]

pub struct LdapUserAttributes {
    pub email: String,
    pub firstname: String,
    pub lastname: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct LdapUser {
    pub dn: String,

    /// The username which will be fetched based on an attribute.
    pub username: String,
    pub groups: Vec<String>,
    pub attributes: LdapUserAttributes,
}

impl LdapAuthentication {
    pub fn new(
        url: String,

        bind_dn: String,
        bind_password: String,
        user_search_base: String,
        user_search_filter: String,
        group_search_filter: String,
        group_search_base: String,
        email_attribute: Option<String>,
        first_name_attribute: Option<String>,
        last_name_attribute: Option<String>,
    ) -> LdapAuthentication {
        LdapAuthentication {
            url,
            bind_dn,
            bind_password,
            user_search_base,
            user_search_filter,
            group_search_filter,
            group_search_base,
            email_attribute: email_attribute,
            first_name_attribute: first_name_attribute,
            last_name_attribute: last_name_attribute,
            ..Default::default()
        }
    }

    async fn sanitize_group_query(dn: &str) -> &str {
        ""
    }

    async fn sanitize_group_filter(dn: &str) -> &str {
        ""
    }

    async fn sanitize_user_query(dn: &str) -> &str {
        ""
    }

    async fn sanitize_user_dn(dn: &str) -> &str {
        ""
    }

    /// Parse the incoming template. The template is expected to have an `id`
    fn parse_templates(
        &self,
        query: &str,
        values: &HashMap<&str, &str>,
    ) -> Result<String, OpenObserveError> {
        let template = Template::parse(query)?;
        template.render(values).map_err(|e| e.into())
    }

    fn get_attribute_from_entry(
        &self,
        entry: &SearchEntry,
        attribute: &str,
    ) -> Result<String, OpenObserveError> {
        let attribute = entry
            .attrs
            .get(attribute)
            .ok_or(OpenObserveError::LdapCustomError(
                LdapCustomError::AttributeNotFound(attribute.to_string()),
            ))?
            .first()
            .ok_or(OpenObserveError::LdapCustomError(
                LdapCustomError::AttributeNotFound(attribute.to_string()),
            ))?
            .clone();
        Ok(attribute)
    }
    /// Find user dn from username
    pub async fn get_user(
        &self,
        mut ldap: ldap3::Ldap,
        username: &str,
    ) -> Result<LdapUser, OpenObserveError> {
        let mut values = HashMap::new();
        values.insert("id", username);
        let user_search_filter = self.parse_templates(&self.user_search_filter, &values)?;

        println!("Searching for user with filter {:?}", &user_search_filter);
        println!("Searching in base {:?}", &self.user_search_base);

        let user_attributes = vec!["*"];
        let (user_entries, _) = ldap
            .search(
                &self.user_search_base,
                Scope::Subtree,
                &user_search_filter,
                user_attributes,
            )
            .await?
            .success()?;

        let user_entries_len = user_entries.len();
        if user_entries.is_empty() {
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
                LdapCustomError::MultipleUsersFound,
            ));
        };

        let user_entry = SearchEntry::construct(user_entries[0].clone());
        if user_entry.dn.is_empty() {
            log::error!("LDAP search was successful, but found no DN!");
            return Err(OpenObserveError::LdapCustomError(
                LdapCustomError::UserNotFound,
            ));
        }

        let email_attribute = self.email_attribute.clone().unwrap_or("mail".into());
        let ldap_user = LdapUser {
            dn: user_entry.dn.clone(),
            username: username.to_string(),
            groups: vec![],
            attributes: LdapUserAttributes {
                email: self
                    .get_attribute_from_entry(&user_entry, &email_attribute)
                    .unwrap_or_default(),
                firstname: self
                    .get_attribute_from_entry(
                        &user_entry,
                        &self
                            .first_name_attribute
                            .clone()
                            .unwrap_or("givenName".into()),
                    )
                    .unwrap_or_default(),
                lastname: self
                    .get_attribute_from_entry(
                        &user_entry,
                        &self.last_name_attribute.clone().unwrap_or("sn".into()),
                    )
                    .unwrap_or_default(),
            },
        };
        Ok(ldap_user)
    }

    /// Get all the groups of a given user
    pub async fn get_user_groups(
        &self,
        mut ldap: ldap3::Ldap,
        user_dn: &str,
    ) -> Result<Vec<String>, OpenObserveError> {
        let mut values = HashMap::new();
        values.insert("id", user_dn);
        let group_search_filter = self.parse_templates(&self.group_search_filter, &values)?;

        println!(
            "Searching for groups with filter {:?}",
            &group_search_filter
        );
        println!("Searching in base {:?}", &self.group_search_base);

        let (group_entries, _) = ldap
            .search(
                &self.group_search_base,
                Scope::Subtree,
                &group_search_filter,
                vec!["*"],
            )
            .await?
            .success()?;

        let groups: Vec<String> = group_entries
            // let groups: Vec<Vec<String>> = group_entries
            .into_iter()
            .map(|entry| {
                let search_entry = SearchEntry::construct(entry);
                search_entry.dn
                // search_entry.attrs.get("ou").unwrap_or(&Vec::new()).clone()
                // let ou = search_entry.attrs.get("dn").unwrap_or(&Vec::new()).clone();
                // let cn = search_entry.attrs.get("authorizedOrgs").unwrap_or(&Vec::new()).clone();
            })
            .collect();
        // let groups: Vec<String> = groups.into_iter().flatten().collect();
        Ok(groups)
    }

    /// Authenticate a user against the LDAP server.
    pub async fn authenticate(
        &self,
        mut ldap: ldap3::Ldap,
        username: &str,
        password: &str,
        use_bind_dn: bool,
    ) -> Result<(), OpenObserveError> {
        let (user, pass) = if use_bind_dn {
            log::debug!("Using bind-dn login for LDAP authentication");
            (self.bind_dn.as_ref(), self.bind_password.as_ref())
        } else {
            log::debug!("Using anonymous login for LDAP authentication");
            (username, password)
        };

        let bind = ldap.simple_bind(user, pass).await?;
        bind.success()?;
        log::info!("LDAP authentication successful for {}", username);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::common::meta;
    use crate::service::users;

    #[tokio::test]
    async fn test_authentication() {
        let ldap_auth = LdapAuthentication::new(
            "ldap://localhost:389".to_string(),
            "cn=admin,dc=zinclabs,dc=com".to_string(),
            "admin".to_string(),
            "ou=users,dc=zinclabs,dc=com".to_string(),
            "(&(objectClass=inetOrgPerson)(uid={id}))".to_string(),
            "(&(objectClass=groupOfUniqueNames)(uniqueMember={id}))".to_string(),
            "ou=teams,dc=zinclabs,dc=com".to_string(),
            Some("mail".to_string()),
            Some("givenName".to_string()),
            Some("sn".to_string()),
        );

        let (user, pass) = ("user3", "user31");

        let (conn, mut ldap) = LdapConnAsync::new(&ldap_auth.url).await.unwrap();
        ldap3::drive!(conn);

        let is_authenticated = ldap_auth
            .authenticate(ldap.clone(), user, pass, false)
            .await;
        println!(
            "is_authenticated invalid pass: {:?}",
            is_authenticated.is_ok()
        );

        let (user_with_dn, pass_with_dn) = ("uid=user3,ou=users,dc=zinclabs,dc=com", "user3");
        ldap_auth
            .authenticate(ldap.clone(), user_with_dn, pass_with_dn, false)
            .await
            .expect("Authentication with anonymous loging unsuccessful");

        // Now lets try to login using bind_dn
        let use_bind_dn = !ldap_auth.bind_dn.is_empty() && !ldap_auth.bind_password.is_empty();
        // This will pass, because bind_dn and bind_pass are not empty
        ldap_auth
            .authenticate(ldap.clone(), user, pass, use_bind_dn)
            .await
            .expect("Authentication successful");

        let ldap_user = ldap_auth
            .get_user(ldap.clone(), "user3")
            .await
            .expect("Failed to get user");
        println!("ldap_user: {:?}", ldap_user);

        let groups = ldap_auth
            .get_user_groups(ldap.clone(), &ldap_user.dn)
            .await
            .unwrap();

        println!("groups: {:?}", groups);

        for group in groups {
            let group = group.split(",").next().unwrap().split("=").last().unwrap();
            println!("group: {:?}", group);
            let _ = users::post_user(
                group,
                meta::user::UserRequest {
                    email: format!("{}@zinclabs.com", group),
                    password: "password".to_owned(),
                    role: meta::user::UserRole::Admin,
                    first_name: "admin".to_owned(),
                    last_name: "".to_owned(),
                },
            )
            .await
            .unwrap();
        }

        ldap.unbind().await.expect("Failed to unbind");
        assert!(false)
    }
}
