//! # Prediction Market — Anchor Program
//!
//! A Solana prediction market for World Cup match outcomes, integrated with
//! **TxLINE** — a sports-data oracle — via Cross-Program Invocation (CPI).
//!
//! ## Market Types
//! - `MatchWinner` — Pick the winning team (Team A / Draw / Team B)
//! - `OverUnderGoals` — Predict over/under a goal threshold
//! - `FirstScorer` — Predict which player scores first
//!
//! ## Lifecycle
//! 1. **Open** — bets accepted (SOL held in market PDA escrow)
//! 2. **Locked** — admin locks (no new bets)
//! 3. **Settled** — [`settle_market`] calls TxLINE's `validate_stat` via CPI;
//!    on success the winning outcome is recorded
//! 4. **Cancelled** — match abandoned; bettors call [`refund_bet`]
//!
//! ## TxLINE Integration (Devnet)
//! - Program ID: `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`
//! - Instruction: `validate_stat` — verifies a Merkle-signed match outcome
//! - The settle instruction performs a CPI; if the proof is invalid the
//!   instruction fails and the market remains Locked.
//!
//! ## Escrow Model
//! The **market PDA itself** holds all escrowed SOL via its lamport balance.
//! Bets increase the balance; payouts (via PDA signer) decrease it.
//! This avoids a separate vault account and simplifies the data model.

use anchor_lang::prelude::*;

pub mod state;
pub mod errors;

use state::*;
use errors::PredictionMarketError;

declare_id!("C5vNdxLcaMriywhQJzv3Dv8PKDfkfnKWHvqCVnqgEQE5");

/// TxLINE Devnet program ID
pub const TXLINE_DEVNET: Pubkey =
    anchor_lang::solana_program::pubkey!("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");

/// Maximum protocol fee: 10% (1000 basis points)
pub const MAX_FEE_BPS: u16 = 1000;

#[program]
pub mod prediction_market {
    use super::*;

    // ------------------------------------------------------------------
    //  InitializeConfig
    // ------------------------------------------------------------------
    /// Deploy the global [`MarketConfig`] singleton.
    ///
    /// | Account     | R/W | Signer? |
    /// |-------------|-----|---------|
    /// | `config`    | W   | No      |
    /// | `admin`     | W   | Yes     |
    /// | `system_program` | - | No |
    ///
    /// * `fee_bps` — protocol fee in basis points (max 1000 = 10 %)
    pub fn initialize_config(ctx: Context<InitializeConfig>, fee_bps: u16) -> Result<()> {
        require!(fee_bps <= MAX_FEE_BPS, PredictionMarketError::InvalidFee);

        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.fee_bps = fee_bps;

        emit!(ConfigInitializedEvent {
            admin: config.admin,
            fee_bps,
        });

        msg!("[prediction-market] Config initialized — admin={}, fee_bps={}", config.admin, fee_bps);
        Ok(())
    }

    // ------------------------------------------------------------------
    //  CreateMarket
    // ------------------------------------------------------------------
    /// Create a new prediction market. Only callable by the admin.
    ///
    /// | Account     | R/W | Signer? |
    /// |-------------|-----|---------|
    /// | `market`    | W   | No      | (PDA)
    /// | `config`    | R   | No      |
    /// | `admin`     | W   | Yes     |
    /// | `system_program` | - | No |
    /// | `clock`     | R   | No      |
    ///
    /// * `market_id` — unique numeric ID
    /// * `match_id` — string like `"FIFA-WC-2026-MATCH-001"`
    /// * `market_type` — [`MarketType`] variant
    /// * `outcomes` — 2–3 human-readable outcome names (≤32 chars each)
    /// * `lock_time` — unix ts after which betting closes
    /// * `resolve_time` — unix ts after which settlement is allowed
    pub fn create_market(
        ctx: Context<CreateMarket>,
        market_id: u64,
        match_id: String,
        market_type: MarketType,
        outcomes: Vec<String>,
        lock_time: i64,
        resolve_time: i64,
    ) -> Result<()> {
        // ── Validate match_id ───────────────────────────────────
        require!(
            !match_id.is_empty() && match_id.len() <= MAX_MATCH_ID_LEN,
            PredictionMarketError::InvalidMatchId
        );

        // ── Validate outcomes ───────────────────────────────────
        require!(
            (2..=MAX_OUTCOMES).contains(&outcomes.len()),
            PredictionMarketError::InvalidOutcomeCount
        );
        for (i, name) in outcomes.iter().enumerate() {
            require!(!name.is_empty(), PredictionMarketError::InvalidOutcomeName);
            require!(
                name.len() <= MAX_OUTCOME_NAME_LEN,
                PredictionMarketError::OutcomeNameTooLong
            );
            msg!("  outcome[{}] = \"{}\"", i, name);
        }

        // ── Validate timestamps ─────────────────────────────────
        let clock = Clock::get()?;
        require!(
            lock_time > clock.unix_timestamp,
            PredictionMarketError::InvalidLockTime
        );
        require!(
            resolve_time > lock_time,
            PredictionMarketError::InvalidResolveTime
        );

        // ── Write market state ──────────────────────────────────
        let market = &mut ctx.accounts.market;
        market.market_id = market_id;
        market.match_id = match_id.clone();
        market.market_type = market_type;
        market.status = MarketStatus::Open;
        market.outcomes = outcomes.clone();
        market.winning_outcome = OUTCOME_NOT_SET;
        market.total_pool = 0;
        market.outcome_pools = vec![0u64; outcomes.len()];
        market.lock_time = lock_time;
        market.resolve_time = resolve_time;
        market.bump = ctx.bumps.market;

        msg!(
            "[prediction-market] Market created — id={}, match=\"{}\", type={:?}, outcomes={}",
            market_id, match_id, market.market_type, outcomes.join(", ")
        );

        emit!(MarketCreatedEvent {
            market_id,
            match_id,
            market_type: market.market_type.clone(),
            outcomes,
            lock_time,
            resolve_time,
        });

        Ok(())
    }

    // ------------------------------------------------------------------
    //  PlaceBet
    // ------------------------------------------------------------------
    /// Place a bet by transferring SOL into the market's PDA escrow.
    /// The market must be **Open** and the current time must be before
    /// `lock_time`.
    ///
    /// | Account     | R/W | Signer? |
    /// |-------------|-----|---------|
    /// | `market`    | W   | No      |
    /// | `bet`       | W   | No      | (PDA)
    /// | `bettor`    | W   | Yes     |
    /// | `system_program` | - | No |
    /// | `clock`     | R   | No      |
    ///
    /// * `amount` — lamports to wager
    /// * `outcome_index` — index into the market's `outcomes` array
    pub fn place_bet(
        ctx: Context<PlaceBet>,
        amount: u64,
        outcome_index: u8,
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;

        // ── Validations ─────────────────────────────────────────
        require!(
            market.status == MarketStatus::Open,
            PredictionMarketError::MarketNotOpen
        );
        require!(
            (outcome_index as usize) < market.outcomes.len(),
            PredictionMarketError::InvalidOutcome
        );
        require!(amount > 0, PredictionMarketError::InsufficientFunds);

        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp < market.lock_time,
            PredictionMarketError::BettingLocked
        );

        // ── Transfer SOL from bettor → market PDA escrow ────────
        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(
                &ctx.accounts.bettor.key(),
                &market.key(),
                amount,
            ),
            &[
                ctx.accounts.bettor.to_account_info(),
                market.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // ── Record the bet ──────────────────────────────────────
        let bet = &mut ctx.accounts.bet;
        bet.market = market.key();
        bet.bettor = ctx.accounts.bettor.key();
        bet.outcome_index = outcome_index;
        bet.amount = amount;
        bet.claimed = false;
        bet.bump = ctx.bumps.bet;

        // ── Update pools ────────────────────────────────────────
        market.total_pool = market
            .total_pool
            .checked_add(amount)
            .ok_or(PredictionMarketError::Overflow)?;
        market.outcome_pools[outcome_index as usize] = market.outcome_pools[outcome_index as usize]
            .checked_add(amount)
            .ok_or(PredictionMarketError::Overflow)?;

        msg!(
            "[prediction-market] Bet placed — market={}, bettor={}, outcome[{}]=\"{}\", {} lamports",
            market.market_id,
            ctx.accounts.bettor.key(),
            outcome_index,
            market.outcomes[outcome_index as usize],
            amount,
        );

        emit!(BetPlacedEvent {
            market_id: market.market_id,
            market: market.key(),
            bettor: ctx.accounts.bettor.key(),
            outcome_index,
            amount,
        });

        Ok(())
    }

    // ------------------------------------------------------------------
    //  LockMarket
    // ------------------------------------------------------------------
    /// Transition a market from **Open → Locked**.
    /// No further bets are accepted after this point.
    pub fn lock_market(ctx: Context<LockMarket>) -> Result<()> {
        let market = &mut ctx.accounts.market;

        require!(
            market.status == MarketStatus::Open,
            PredictionMarketError::MarketNotOpen
        );

        market.status = MarketStatus::Locked;

        msg!("[prediction-market] Market locked — id={}", market.market_id);

        emit!(MarketLockedEvent {
            market_id: market.market_id,
            market: market.key(),
        });

        Ok(())
    }

    // ------------------------------------------------------------------
    //  SettleMarket   ⭐ — THE CROWN JEWEL
    //
    //  Integrates with TxLINE's validate_stat instruction via CPI to
    //  cryptographically verify the match outcome before settling.
    // ------------------------------------------------------------------
    /// Settle a locked market by verifying the match result through
    /// the **TxLINE** sports-data oracle.
    ///
    /// ## TxLINE CPI Detail
    ///
    /// This instruction performs a Cross-Program Invocation into the
    /// TxLINE program (`6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`
    /// on Devnet) calling the `validate_stat` instruction.
    ///
    /// **TxLINE account expectations** (based on standard Anchor oracle
    /// patterns — adjust if the deployed TxLINE IDL differs):
    ///
    /// | # | Account             | R/W | Description                      |
    /// |---|---------------------|-----|----------------------------------|
    /// | 0 | `txline_state`      | R   | TxLINE program state account     |
    /// | 1 | `txline_proof`      | W   | Merkle proof to consume          |
    ///
    /// **Instruction data layout:**
    /// ```ignore
    /// [0..8)    — Anchor discriminator (sha256("global:validate_stat"))
    /// [8..40)   — match_id (32 bytes, hash of the match identifier)
    /// [40]      — winning_outcome (1 byte)
    /// ```
    ///
    /// If the CPI succeeds the market transitions to **Settled** and
    /// `winning_outcome` is recorded.  If it fails (invalid proof),
    /// the entire instruction reverts and the market stays Locked.
    ///
    /// | Account           | R/W | Signer? |
    /// |-------------------|---|---------|
    /// | `market`          | W | No      |
    /// | `config`          | R | No      |
    /// | `admin`           | - | Yes     |
    /// | `txline_program`  | - | No      |
    /// | `txline_state`    | R | No      |
    /// | `txline_proof_account` | W | No |
    /// | `clock`           | R | No      |
    ///
    /// * `winning_outcome` — index into the market's outcomes array
    /// * `match_id_bytes` — 32-byte hash of the match ID (for TxLINE)
    pub fn settle_market(
        ctx: Context<SettleMarket>,
        winning_outcome: u8,
        match_id_bytes: [u8; 32],
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;

        // ── State validation ────────────────────────────────────
        require!(
            market.status == MarketStatus::Locked,
            PredictionMarketError::MarketNotLocked
        );
        require!(
            (winning_outcome as usize) < market.outcomes.len(),
            PredictionMarketError::InvalidOutcome
        );

        // ── Time validation ─────────────────────────────────────
        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp >= market.resolve_time,
            PredictionMarketError::NotResolvedYet
        );

        // ── Validate TxLINE program ID ──────────────────────────
        require!(
            ctx.accounts.txline_program.key() == TXLINE_DEVNET,
            PredictionMarketError::InvalidTxLineProgram
        );

        // =========================================================
        //   TXLINE CPI — validate_stat
        // =========================================================
        //
        // Build and invoke the TxLINE validate_stat instruction.
        //
        // The instruction discriminator is the first 8 bytes of
        // SHA-256("global:validate_stat") — the standard Anchor
        // instruction discriminator derivation.  Replace with the
        // actual discriminator if TxLINE uses a different convention.
        // =========================================================

        // 8-byte Anchor instruction discriminator
        let discriminator = anchor_lang::solana_program::hash::hash(b"global:validate_stat")
            .to_bytes()[..8]
            .to_vec();

        // Instruction data: discriminator || match_id_hash || outcome
        let mut instruction_data = discriminator;
        instruction_data.extend_from_slice(&match_id_bytes);
        instruction_data.push(winning_outcome);

        // Account metas expected by TxLINE
        let cpi_account_metas = vec![
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(
                ctx.accounts.txline_state.key(),
                false,
            ),
            anchor_lang::solana_program::instruction::AccountMeta::new(
                ctx.accounts.txline_proof_account.key(),
                false,
            ),
        ];

        let cpi_ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: ctx.accounts.txline_program.key(),
            accounts: cpi_account_metas,
            data: instruction_data,
        };

        // Perform the CPI — if this fails the entire instruction
        // reverts and the market stays Locked.
        anchor_lang::solana_program::program::invoke(
            &cpi_ix,
            &[
                ctx.accounts.txline_program.to_account_info(),
                ctx.accounts.txline_state.to_account_info(),
                ctx.accounts.txline_proof_account.to_account_info(),
            ],
        )
        .map_err(|e| {
            msg!(
                "[prediction-market] TxLINE validate_stat CPI REJECTED — {:?}",
                e
            );
            PredictionMarketError::TxLineCpiFailed
        })?;

        // ── CPI succeeded — outcome verified ────────────────────
        market.winning_outcome = winning_outcome;
        market.status = MarketStatus::Settled;

        msg!(
            "[prediction-market] Market SETTLED via TxLINE — id={}, winning_outcome={} (\"{}\"), pool={} lamports",
            market.market_id,
            winning_outcome,
            market.outcomes[winning_outcome as usize],
            market.total_pool,
        );

        emit!(MarketSettledEvent {
            market_id: market.market_id,
            market: market.key(),
            winning_outcome,
            total_pool: market.total_pool,
        });

        Ok(())
    }

    // ------------------------------------------------------------------
    //  ClaimWinnings
    // ------------------------------------------------------------------
    /// Claim proportional winnings from a settled market.
    ///
    /// ## Payout formula
    ///
    /// ```text
    /// payout = (bet_amount × total_pool) / winning_outcome_pool
    /// ```
    ///
    /// This is a **proportional** distribution: winners split the
    /// entire pool in proportion to their contribution to the winning
    /// outcome's sub-pool.
    ///
    /// The protocol fee (`fee_bps` %) is effectively retained in the
    /// market account (the payout is still proportional to the full
    /// `total_pool`, so the fee dilutes everyone equally).
    ///
    /// | Account     | R/W | Signer? |
    /// |-------------|-----|---------|
    /// | `market`    | W   | No      |
    /// | `bet`       | W   | No      |
    /// | `winner`    | W   | Yes     |
    /// | `system_program` | - | No |
    pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
        let market = &ctx.accounts.market;
        let bet = &ctx.accounts.bet;
        let winner = &ctx.accounts.winner;

        // ── Validations ─────────────────────────────────────────
        require!(
            market.status == MarketStatus::Settled,
            PredictionMarketError::MarketNotSettled
        );
        require!(
            bet.outcome_index == market.winning_outcome,
            PredictionMarketError::NotWinningBet
        );
        require!(!bet.claimed, PredictionMarketError::BetAlreadyClaimed);
        require!(
            bet.bettor == winner.key(),
            PredictionMarketError::NotBetOwner
        );
        require!(
            bet.market == market.key(),
            PredictionMarketError::InvalidOutcome
        );

        // ── Calculate proportional payout ───────────────────────
        let winning_pool = market.outcome_pools[market.winning_outcome as usize];
        require!(winning_pool > 0, PredictionMarketError::InsufficientFunds);
        require!(
            bet.amount <= winning_pool,
            PredictionMarketError::Overflow
        );

        // payout = (bet.amount * total_pool) / winning_pool
        let payout = (bet.amount as u128)
            .checked_mul(market.total_pool as u128)
            .ok_or(PredictionMarketError::Overflow)?
            .checked_div(winning_pool as u128)
            .ok_or(PredictionMarketError::Overflow)? as u64;

        require!(payout > 0, PredictionMarketError::InsufficientFunds);

        // ── SOL transfer (market PDA → winner) ──────────────────
        let market_key = market.key();
        let market_seeds = &[
            b"market",
            &market.market_id.to_le_bytes()[..],
            &[market.bump][..],
        ];
        let signer_seeds = &[&market_seeds[..]];

        anchor_lang::solana_program::program::invoke_signed(
            &anchor_lang::solana_program::system_instruction::transfer(
                &market_key,
                &winner.key(),
                payout,
            ),
            &[
                market.to_account_info(),
                winner.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            signer_seeds,
        )?;

        // ── Mark claimed ────────────────────────────────────────
        let bet_mut = &mut ctx.accounts.bet;
        bet_mut.claimed = true;

        msg!(
            "[prediction-market] Winnings claimed — market={}, bettor={}, amount={} lamports",
            market.market_id,
            winner.key(),
            payout,
        );

        emit!(WinningsClaimedEvent {
            market_id: market.market_id,
            market: market.key(),
            bettor: winner.key(),
            amount: payout,
        });

        Ok(())
    }

    // ------------------------------------------------------------------
    //  CancelMarket
    // ------------------------------------------------------------------
    /// Cancel a market (e.g., match abandoned).  Only possible if the
    /// market has **not** been settled.  Bettors can then call
    /// [`refund_bet`] to get their stake back.
    pub fn cancel_market(ctx: Context<CancelMarket>) -> Result<()> {
        let market = &mut ctx.accounts.market;

        require!(
            market.status != MarketStatus::Settled,
            PredictionMarketError::CannotCancelSettledMarket
        );
        require!(
            market.status != MarketStatus::Cancelled,
            PredictionMarketError::MarketAlreadyCancelled
        );

        market.status = MarketStatus::Cancelled;

        msg!("[prediction-market] Market cancelled — id={}", market.market_id);

        emit!(MarketCancelledEvent {
            market_id: market.market_id,
            market: market.key(),
        });

        Ok(())
    }

    // ------------------------------------------------------------------
    //  RefundBet
    // ------------------------------------------------------------------
    /// Claim a full refund on a cancelled market.  Each bettor must
    /// call this individually (pull-based refund model).
    pub fn refund_bet(ctx: Context<RefundBet>) -> Result<()> {
        let market = &ctx.accounts.market;
        let bet = &ctx.accounts.bet;
        let bettor = &ctx.accounts.bettor;
        let refund_amount = bet.amount;

        // ── Validations ─────────────────────────────────────────
        require!(
            market.status == MarketStatus::Cancelled,
            PredictionMarketError::MarketNotCancelled
        );
        require!(!bet.claimed, PredictionMarketError::BetAlreadyClaimed);
        require!(
            bet.bettor == bettor.key(),
            PredictionMarketError::NotBetOwner
        );
        require!(
            bet.market == market.key(),
            PredictionMarketError::InvalidOutcome
        );
        require!(
            bet.amount <= market.to_account_info().lamports(),
            PredictionMarketError::InsufficientVaultBalance
        );

        // ── Return the original stake ───────────────────────────
        let market_key = market.key();
        let market_seeds = &[
            b"market",
            &market.market_id.to_le_bytes()[..],
            &[market.bump][..],
        ];
        let signer_seeds = &[&market_seeds[..]];

        anchor_lang::solana_program::program::invoke_signed(
            &anchor_lang::solana_program::system_instruction::transfer(
                &market_key,
                &bettor.key(),
                bet.amount,
            ),
            &[
                market.to_account_info(),
                bettor.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            signer_seeds,
        )?;

        // ── Mark refunded ───────────────────────────────────────
        let bet_mut = &mut ctx.accounts.bet;
        bet_mut.claimed = true;

        msg!(
            "[prediction-market] Bet refunded — market={}, bettor={}, amount={} lamports",
            market.market_id,
            bettor.key(),
            refund_amount,
        );

        emit!(BetRefundedEvent {
            market_id: market.market_id,
            market: market.key(),
            bettor: bettor.key(),
            amount: refund_amount,
        });

        Ok(())
    }
}

// ==================================================================
//  Account Validation Structs
// ==================================================================

// ── InitializeConfig ───────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    /// Global config PDA — created once.
    #[account(
        init,
        payer = admin,
        space = MarketConfig::LEN,
        seeds = [b"config"],
        bump,
    )]
    pub config: Account<'info, MarketConfig>,

    /// Admin signer (pays rent for config).
    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// ── CreateMarket ───────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(
    market_id: u64,
    match_id: String,
    market_type: MarketType,
    outcomes: Vec<String>,
    lock_time: i64,
    resolve_time: i64
)]
pub struct CreateMarket<'info> {
    /// Market PDA — created here.  Holds all escrowed SOL.
    #[account(
        init,
        payer = admin,
        space = Market::space(&match_id, &outcomes),
        seeds = [b"market", &market_id.to_le_bytes()[..]],
        bump,
    )]
    pub market: Account<'info, Market>,

    /// Config singleton — ensures caller is the admin.
    #[account(
        seeds = [b"config"],
        bump,
        constraint = config.admin == admin.key() @ PredictionMarketError::NotAdmin,
    )]
    pub config: Account<'info, MarketConfig>,

    /// Admin signer (pays rent for market).
    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}

// ── PlaceBet ───────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(amount: u64, outcome_index: u8)]
pub struct PlaceBet<'info> {
    /// Market — receives SOL and updates pools.
    #[account(
        mut,
        seeds = [b"market", &market.market_id.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    /// Bet PDA — records this wager.
    #[account(
        init,
        payer = bettor,
        space = Bet::LEN,
        seeds = [
            b"bet",
            market.key().as_ref(),
            bettor.key().as_ref(),
            &[outcome_index],
        ],
        bump,
    )]
    pub bet: Account<'info, Bet>,

    /// Bettor — signs, pays rent, and sends SOL.
    #[account(mut)]
    pub bettor: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}

// ── LockMarket ─────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct LockMarket<'info> {
    #[account(
        mut,
        seeds = [b"market", &market.market_id.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        seeds = [b"config"],
        bump,
        constraint = config.admin == admin.key() @ PredictionMarketError::NotAdmin,
    )]
    pub config: Account<'info, MarketConfig>,

    pub admin: Signer<'info>,
}

// ── SettleMarket ───────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(winning_outcome: u8, match_id_bytes: [u8; 32])]
pub struct SettleMarket<'info> {
    /// Market to settle — transitions from Locked → Settled.
    #[account(
        mut,
        seeds = [b"market", &market.market_id.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    /// Config singleton — ensures caller is admin.
    #[account(
        seeds = [b"config"],
        bump,
        constraint = config.admin == admin.key() @ PredictionMarketError::NotAdmin,
    )]
    pub config: Account<'info, MarketConfig>,

    /// Admin signer.
    pub admin: Signer<'info>,

    // ── TxLINE Oracle Accounts ──────────────────────────────────

    /// The TxLINE program executable.
    /// Devnet: `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`.
    /// The program ID is validated inside the instruction handler.
    #[account(executable)]
    pub txline_program: AccountInfo<'info>,

    /// TxLINE program state account (read-only).
    /// Passed as-is to the `validate_stat` CPI.
    /// /// CHECK: validated by the TxLINE program during CPI.
    pub txline_state: AccountInfo<'info>,

    /// TxLINE Merkle proof account that will be consumed by the
    /// `validate_stat` CPI.  Must contain a valid signed proof of
    /// the match outcome.
    /// /// CHECK: writable, consumed by TxLINE CPI.
    #[account(mut)]
    pub txline_proof_account: AccountInfo<'info>,

    /// Clock sysvar for resolve_time check.
    pub clock: Sysvar<'info, Clock>,
}

// ── ClaimWinnings ─────────────────────────────────────────────────

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
    /// Settled market — payout source (via lamport balance).
    #[account(
        mut,
        seeds = [b"market", &market.market_id.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    /// The winning bet to claim.
    #[account(mut)]
    pub bet: Account<'info, Bet>,

    /// Winner — must be the original `bet.bettor`.
    #[account(mut)]
    pub winner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// ── CancelMarket ──────────────────────────────────────────────────

#[derive(Accounts)]
pub struct CancelMarket<'info> {
    #[account(
        mut,
        seeds = [b"market", &market.market_id.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        seeds = [b"config"],
        bump,
        constraint = config.admin == admin.key() @ PredictionMarketError::NotAdmin,
    )]
    pub config: Account<'info, MarketConfig>,

    pub admin: Signer<'info>,
}

// ── RefundBet ─────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct RefundBet<'info> {
    /// Cancelled market — refund source.
    #[account(
        mut,
        seeds = [b"market", &market.market_id.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    /// Bet to refund.
    #[account(mut)]
    pub bet: Account<'info, Bet>,

    /// Bettor receiving the refund — must be the original `bet.bettor`.
    #[account(mut)]
    pub bettor: Signer<'info>,

    pub system_program: Program<'info, System>,
}
