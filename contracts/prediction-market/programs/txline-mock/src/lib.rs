//! # TxLINE Mock — localnet stand-in for the TxLINE oracle
//!
//! The real TxLINE program only exists on Devnet, which makes the
//! settlement CPI (and everything after it: claims, payouts) untestable
//! on a local validator. This mock exposes a `validate_stat` instruction
//! with the exact same Anchor discriminator and account order that
//! `prediction-market::settle_market` invokes.
//!
//! `settle_market` forwards its `proof_data` bytes verbatim after the
//! discriminator; the tests encode `match_id ([u8;32]) ++ outcome (u8)`
//! (33 bytes), which borsh-deserializes into this mock's arguments:
//!
//! ```text
//! data:     sha256("global:validate_stat")[..8] ++ proof_data
//! accounts: [state (readonly), stat_proof (writable)]
//! ```
//!
//! `Anchor.toml`'s `[[test.genesis]]` loads this binary **at the real
//! TxLINE program id** on the test validator, so the production program
//! runs completely unmodified.
//!
//! Behaviour: the proof account must exist and carry data (a stand-in for
//! Merkle-proof verification). An empty/nonexistent proof account is
//! rejected — letting tests exercise both the "invalid proof → market
//! stays Locked" and the "valid proof → Settled → claims paid" paths.

use anchor_lang::prelude::*;

declare_id!("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");

#[program]
pub mod txline_mock {
    use super::*;

    pub fn validate_stat(
        ctx: Context<ValidateStat>,
        match_id: [u8; 32],
        outcome: u8,
    ) -> Result<()> {
        require!(
            !ctx.accounts.stat_proof.data_is_empty(),
            TxlineMockError::InvalidProof
        );
        msg!(
            "[txline-mock] validate_stat OK — match_id[0..4]={:?}, outcome={}",
            &match_id[..4],
            outcome
        );
        Ok(())
    }
}

#[derive(Accounts)]
pub struct ValidateStat<'info> {
    /// CHECK: mock oracle state account — not inspected.
    pub state: AccountInfo<'info>,

    /// CHECK: mock Merkle-proof account — must exist and carry data.
    #[account(mut)]
    pub stat_proof: AccountInfo<'info>,
}

#[error_code]
pub enum TxlineMockError {
    #[msg("Merkle proof account is empty or does not exist")]
    InvalidProof,
}
