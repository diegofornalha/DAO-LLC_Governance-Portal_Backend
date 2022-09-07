const functions = require("firebase-functions");
const { initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore } = require('firebase-admin/firestore')
const fcl = require("@onflow/fcl");
const crypto = require("crypto");
const { database } = require("firebase-functions/v1/firestore");

fcl.config({
  "accessNode.api": "https://rest-testnet.onflow.org",
  "flow.network": "testnet"
})

const app = initializeApp();
const db = getFirestore();

exports.generateNonce = functions.https.onCall( async (data, context) => {
    const nonce = crypto.randomBytes(32).toString('hex');

    await db.collection('nonce-tokens').add({
        nonce: nonce
    })

    return {
        nonce: nonce
    }
})

exports.generateAuthToken = functions.https.onCall( async (data, context) => {
    let nonceDoc = await db.collection('nonce-tokens').where('nonce', '=', data.nonce).get()
    if (nonceDoc.empty) {
        return {
            status: "error",
            msg: "Invalid Nonce"
        }
    }

    nonceDoc.forEach(nonce => {
        nonce.ref.delete()
    })

    const isValid = await fcl.AppUtils.verifyAccountProof("DAO LLC Governance Portal (v0.1)", data)

    if (!isValid) {
        return {
            status: "error",
            msg: "Invalid Account Proof"
        }
    }

    let token = await getAuth().createCustomToken(data.address)

    return {
        status: "success",
        token: token
    }
})