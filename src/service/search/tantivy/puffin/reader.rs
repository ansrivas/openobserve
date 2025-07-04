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

use std::sync::Arc;

use anyhow::{Result, anyhow, ensure};
use bytes::Buf;

use super::*;

#[derive(Debug)]
pub struct PuffinBytesReader {
    account: String,
    source: Arc<object_store::ObjectMeta>,
    metadata: Option<PuffinMeta>,
}

impl PuffinBytesReader {
    pub fn new(account: String, source: object_store::ObjectMeta) -> Self {
        Self {
            account,
            source: Arc::new(source),
            metadata: None,
        }
    }
}

impl PuffinBytesReader {
    pub async fn read_blob_bytes(
        &self,
        blob_metadata: &BlobMetadata,
        range: Option<core::ops::Range<u64>>,
    ) -> Result<bytes::Bytes> {
        let raw_data = infra::cache::storage::get_range(
            &self.account,
            &self.source.location,
            blob_metadata.get_offset(range),
        )
        .await?;

        let decompressed = match blob_metadata.compression_codec {
            Some(CompressionCodec::Lz4) => {
                return Err(anyhow!("Lz4 compression is not supported"));
            }
            Some(CompressionCodec::Zstd) => {
                return Err(anyhow!("Zstd compression is not supported"));
            }
            None => raw_data,
        };

        Ok(decompressed)
    }

    pub async fn get_metadata(&mut self) -> Result<Option<PuffinMeta>> {
        self.parse_footer().await?;
        Ok(self.metadata.clone())
    }

    pub async fn parse_footer(&mut self) -> Result<()> {
        if self.metadata.is_some() {
            return Ok(());
        }

        if self.source.size < MIN_FILE_SIZE {
            return Err(anyhow!(
                "Unexpected bytes size: minimal size {} vs actual size {}",
                MIN_FILE_SIZE,
                self.source.size
            ));
        }

        // check MAGIC
        let magic =
            infra::cache::storage::get_range(&self.account, &self.source.location, 0..MAGIC_SIZE)
                .await?;
        ensure!(magic.to_vec() == MAGIC, anyhow!("Header MAGIC mismatch"));

        let puffin_meta = PuffinFooterBytesReader::new(self.account.clone(), self.source.clone())
            .parse()
            .await?;
        self.metadata = Some(puffin_meta);
        Ok(())
    }
}

/// Footer layout: HeadMagic Payload PayloadSize Flags FootMagic
///                [4]       [?]     [4]         [4]   [4]
struct PuffinFooterBytesReader {
    account: String,
    source: Arc<object_store::ObjectMeta>,
    flags: PuffinFooterFlags,
    payload_size: u64,
    metadata: Option<PuffinMeta>,
}

impl PuffinFooterBytesReader {
    fn new(account: String, source: Arc<object_store::ObjectMeta>) -> Self {
        Self {
            account,
            source,
            flags: PuffinFooterFlags::empty(),
            payload_size: 0,
            metadata: None,
        }
    }
}

impl PuffinFooterBytesReader {
    async fn parse(mut self) -> Result<PuffinMeta> {
        // read footer
        if self.source.size < FOOTER_SIZE {
            return Err(anyhow!(
                "Unexpected footer size: expected size {} vs actual size {}",
                FOOTER_SIZE,
                self.source.size
            ));
        }
        let footer = infra::cache::storage::get_range(
            &self.account,
            &self.source.location,
            (self.source.size - FOOTER_SIZE)..self.source.size,
        )
        .await?;

        // check the footer magic
        ensure!(
            footer
                .slice((FOOTER_SIZE - MAGIC_SIZE) as usize..FOOTER_SIZE as usize)
                .to_vec()
                == MAGIC,
            anyhow!("Footer MAGIC mismatch")
        );

        // check the flags
        let mut flags = [0u8; 4];
        footer
            .slice(
                (FOOTER_SIZE - MAGIC_SIZE - FLAGS_SIZE) as usize
                    ..(FOOTER_SIZE - MAGIC_SIZE) as usize,
            )
            .copy_to_slice(&mut flags);
        self.flags = PuffinFooterFlags::from_bits(u32::from_le_bytes(flags))
            .ok_or_else(|| anyhow!("Error parsing Puffin flags from bytes"))?;

        // check the payload size
        let mut payload_size = [0u8; 4];
        footer
            .slice(0..FOOTER_PAYLOAD_SIZE_SIZE as usize)
            .copy_to_slice(&mut payload_size);
        self.payload_size = i32::from_le_bytes(payload_size) as u64;

        // read the payload
        if self.source.size < FOOTER_SIZE + self.payload_size {
            return Err(anyhow!(
                "Unexpected payload size: expected size {} vs actual size {}",
                FOOTER_SIZE + self.payload_size,
                self.source.size
            ));
        }
        let payload = infra::cache::storage::get_range(
            &self.account,
            &self.source.location,
            (self.source.size - FOOTER_SIZE - self.payload_size - MAGIC_SIZE)
                ..(self.source.size - FOOTER_SIZE),
        )
        .await?;

        // check the footer magic
        ensure!(
            payload.slice(0..MAGIC_SIZE as usize).to_vec() == MAGIC,
            anyhow!("Footer MAGIC mismatch")
        );

        self.metadata = Some(self.parse_payload(&payload.slice(MAGIC_SIZE as usize..))?);
        self.validate_payload()?;

        Ok(self.metadata.unwrap())
    }

    fn parse_payload(&self, bytes: &[u8]) -> Result<PuffinMeta> {
        if self.flags.contains(PuffinFooterFlags::COMPRESSED) {
            let decoder = zstd::Decoder::new(bytes)?;
            serde_json::from_reader(decoder)
                .map_err(|e| anyhow!("Error decompress footer payload {}", e.to_string()))
        } else {
            serde_json::from_slice(bytes)
                .map_err(|e| anyhow!("Error serializing footer {}", e.to_string()))
        }
    }

    fn validate_payload(&self) -> Result<()> {
        let puffin_metadata = self.metadata.as_ref().expect("metadata is not set");

        let mut offset = MAGIC_SIZE;
        for blob in &puffin_metadata.blobs {
            ensure!(
                blob.offset == offset,
                anyhow!("Blob payload offset mismatch")
            );
            offset += blob.length;
        }

        let payload_ends_at = puffin_metadata
            .blobs
            .last()
            .map_or(MAGIC_SIZE, |blob| blob.offset + blob.length);
        let footer_size = MAGIC_SIZE + self.payload_size + FOOTER_SIZE;
        ensure!(
            payload_ends_at == (self.source.size - footer_size),
            anyhow!("Payload chunk offset mismatch")
        );
        Ok(())
    }
}
