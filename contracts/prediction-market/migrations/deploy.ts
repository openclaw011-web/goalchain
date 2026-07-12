// Migrations — deploy script for Anchor
// Usage: anchor deploy

const anchor = require("@coral-xyz/anchor");

module.exports = async function (provider: any) {
  anchor.setProvider(provider);
  // Deploy config is managed in Anchor.toml
  console.log("Deploying prediction-market program to Devnet...");
};
