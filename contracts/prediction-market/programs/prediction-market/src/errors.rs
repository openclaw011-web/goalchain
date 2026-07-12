use anchor_lang::prelude::*;

/// Comprehensive error codes for the Prediction Market program.
#[error_code]
pub enum PredictionMarketError {
    // ── Market state errors ─────────────────────────────────────
    #[msg("Market is not in Open status — cannot place bets")]
    MarketNotOpen,

    #[msg("Market is not in Locked status — cannot settle")]
    MarketNotLocked,

    #[msg("Market is already locked")]
    MarketAlreadyLocked,

    #[msg("Market is already settled")]
    MarketAlreadySettled,

    #[msg("Market is already cancelled")]
    MarketAlreadyCancelled,

    #[msg("Market is not cancelled — cannot refund")]
    MarketNotCancelled,

    #[msg("Cannot cancel a settled market")]
    CannotCancelSettledMarket,

    // ── Betting errors ─────────────────────────────────────────
    #[msg("Betting window is closed — past lock_time")]
    BettingLocked,

    #[msg("Invalid outcome index — out of range")]
    InvalidOutcome,

    #[msg("Invalid number of outcomes (must be 2 or 3)")]
    InvalidOutcomeCount,

    #[msg("Outcome name cannot be empty")]
    InvalidOutcomeName,

    #[msg("Outcome name exceeds maximum length of 32 characters")]
    OutcomeNameTooLong,

    #[msg("Bet has already been claimed or refunded")]
    BetAlreadyClaimed,

    #[msg("This bet did not win — outcome does not match")]
    NotWinningBet,

    #[msg("Only the original bettor can claim this bet")]
    NotBetOwner,

    #[msg("Insufficient funds for minimum bet amount")]
    InsufficientFunds,

    // ── Settlement errors ──────────────────────────────────────
    #[msg("Market cannot be settled before resolve_time")]
    NotResolvedYet,

    #[msg("Market is not settled yet — cannot claim")]
    MarketNotSettled,

    // ── Market creation errors ─────────────────────────────────
    #[msg("Match ID exceeds maximum length or is empty")]
    InvalidMatchId,

    #[msg("lock_time must be in the future")]
    InvalidLockTime,

    #[msg("resolve_time must be after lock_time")]
    InvalidResolveTime,

    #[msg("Market with this ID already exists (PDA collision)")]
    MarketAlreadyExists,

    // ── Authorization errors ───────────────────────────────────
    #[msg("Only the configured admin can perform this action")]
    NotAdmin,

    // ── TxLINE CPI errors ───────────────────────────────────────
    #[msg("TxLINE validate_stat CPI call failed — proof rejected")]
    TxLineCpiFailed,

    #[msg("Invalid TxLINE program ID provided")]
    InvalidTxLineProgram,

    // ── Arithmetic errors ──────────────────────────────────────
    #[msg("Arithmetic overflow or underflow")]
    Overflow,

    #[msg("Insufficient vault balance for payout")]
    InsufficientVaultBalance,

    // ── Config errors ───────────────────────────────────────────
    #[msg("Fee exceeds maximum allowed (1000 bps = 10%)")]
    InvalidFee,
}
