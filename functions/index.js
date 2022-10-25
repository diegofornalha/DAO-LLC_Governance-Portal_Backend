const { initializeApp } = require('firebase-admin/app')
const fcl = require("@onflow/fcl");

fcl.config({
  "accessNode.api": "https://rest-testnet.onflow.org",
  "flow.network": "testnet"
})

initializeApp();

exports.auth = require("./auth/index.js")
exports.daos = require("./daos/index.js")