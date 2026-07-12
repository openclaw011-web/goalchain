use anchor_lang::prelude::*;

/// -----------------------------------------------------------------------
/// Constants
/// -----------------------------------------------------------------------
pub const MAX_MATCH_ID_LEN: usize = 64;
pub const MAX_OUTCOMES: usize = 3;
pub const MAX_OUTCOME_NAME_LEN: usize = 32;

/// Sentinel value for "winning outcome not yet set"
pub const OUTCOME_NOT_SET: u8 = u8::MAX;

/// -----------------------------------------------------------------------
/// MarketConfig - Global program configuration
///
/// PDA seeds: [b"config"]
/// Stores the admin authority and protocol fee.
/// -----------------------------------------------------------------------
#[account]
pub struct MarketConfig {
    /// Admin pubkey — can create/lock/settle/cancel markets
    pub admin: Pubkey,
    /// Protocol fee in basis points (e.g., 250 = 2.50%)
    pub fee_bps: u16,
}

impl MarketConfig {
    pub const LEN: usize = 8 + 32 + 2;
}

/// -----------------------------------------------------------------------
/// MarketType - The kind of prediction being made
/// -----------------------------------------------------------------------
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum MarketType {
    /// Predict which team wins: [Team_A, Draw, Team_B]
    MatchWinner,
    /// Predict over/under a goal threshold: [Over_X, Under_X]
    OverUnderGoals,
    /// Predict the first goal scorer: [Player_option_1, Player_option_2, ...]
    FirstScorer,
}

/// -----------------------------------------------------------------------
/// MarketStatus - Lifecycle state of a market
/// -----------------------------------------------------------------------
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug)]
pub enum MarketStatus {
    /// Open for bets
    Open,
    /// Locked — no new bets, waiting for resolution
    Locked,
    /// Settled — outcome verified via TxLINE oracle
    Settled,
    /// Cancelled — match abandoned, refunds available
    Cancelled,
}

/// -----------------------------------------------------------------------
/// Market - A single prediction market
///
/// PDA seeds: [b"market", market_id (8 LE bytes)]
///
/// The market PDA also holds the escrowed SOL (via its lamport balance).
/// When users place bets, SOL is transferred to this account.
/// When winners claim, SOL is transferred from this account via PDA signer.
/// -----------------------------------------------------------------------
#[account]
pub struct Market {
    /// Unique numeric identifier for this market
    pub market_id: u64,
    /// Match identifier (e.g., "FIFA-WC-2026-MATCH-001")
    pub match_id: String,
    /// Type of prediction market
    pub market_type: MarketType,
    /// Current lifecycle status
    pub status: MarketStatus,
    /// Human-readable outcome names (e.g., ["Brazil", "Draw", "Argentina"])
    pub outcomes: Vec<String>,
    /// Index of the winning outcome (OUTCOME_NOT_SET = 255 if unsettled)
    pub winning_outcome: u8,
    /// Total lamports deposited across all outcomes
    pub total_pool: u64,
    /// Pool lamports per outcome index (parallel to outcomes)
    pub outcome_pools: Vec<u64>,
    /// Unix timestamp after which no new bets are accepted
    pub lock_time: i64,
    /// Unix timestamp after which the market can be settled
    pub resolve_time: i64,
    /// PDA bump seed for signing SOL transfers
    pub bump: u8,
}

impl Market {
    /// Calculate the exact account size (in bytes) for a market with
    /// the given match_id and outcome strings. Called at `init` time.
    pub fn space(match_id: &str, outcomes: &[String]) -> usize {
        // 8-byte Anchor discriminator
        let mut size = 8;
        // market_id: u64
        size += 8;
        // match_id: Borsh String (4-byte len prefix + chars)
        size += 4 + match_id.len();
        // market_type: single-byte enum variant
        size += 1;
        // status: single-byte enum variant
        size += 1;
        // outcomes: Borsh Vec<String> (4-byte len prefix + each element: 4 + len)
        size += 4;
        for outcome in outcomes {
            size += 4 + outcome.len();
        }
        // winning_outcome: u8
        size += 1;
        // total_pool: u64
        size += 8;
        // outcome_pools: Borsh Vec<u64> (4-byte len prefix + 8 per element)
        size += 4 + outcomes.len() * 8;
        // lock_time: i64
        size += 8;
        // resolve_time: i64
        size += 8;
        // bump: u8
        size += 1;
        size
    }
}

/// -----------------------------------------------------------------------
/// Bet - Records a single user's wager
///
/// PDA seeds: [b"bet", market_key, bettor_key, [outcome_index]]
/// -----------------------------------------------------------------------
#[account]
pub struct Bet {
    /// The market PDA this bet belongs to
    pub market: Pubkey,
    /// Wallet address of the bettor
    pub bettor: Pubkey,
    /// Which outcome was chosen (index into market.outcomes)
    pub outcome_index: u8,
    /// Amount of lamports wagered
    pub amount: u64,
    /// Has this bet been claimed (winnings) or refunded (cancellation)?
    pub claimed: bool,
    /// PDA bump seed
    pub bump: u8,
}

impl Bet {
    pub const LEN: usize = 8 + 32 + 32 + 1 + 8 + 1 + 1;
}

/// ====================================================================
/// Events — emitted for frontend / indexer tracking
/// ====================================================================

#[event]
pub struct ConfigInitializedEvent {
    pub admin: Pubkey,
    pub fee_bps: u16,
}

#[event]
pub struct MarketCreatedEvent {
    pub market_id: u64,
    pub match_id: String,
    pub market_type: MarketType,
    pub outcomes: Vec<String>,
    pub lock_time: i64,
    pub resolve_time: i64,
}

#[event]
pub struct BetPlacedEvent {
    pub market_id: u64,
    pub market: Pubkey,
    pub bettor: Pubkey,
    pub outcome_index: u8,
    pub amount: u64,
}

#[event]
pub struct MarketLockedEvent {
    pub market_id: u64,
    pub market: Pubkey,
}

#[event]
pub struct MarketSettledEvent {
    pub market_id: u64,
    pub market: Pubkey,
    pub winning_outcome: u8,
    pub total_pool: u64,
}

#[event]
pub struct WinningsClaimedEvent {
    pub market_id: u64,
    pub market: Pubkey,
    pub bettor: Pubkey,
    pub amount: u64,
}

#[event]
pub struct MarketCancelledEvent {
    pub market_id: u64,
    pub market: Pubkey,
}

#[event]
pub struct BetRefundedEvent {
    pub market_id: u64,
    pub market: Pubkey,
    pub bettor: Pubkey,
    pub amount: u64,
}
