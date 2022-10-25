const functions = require("firebase-functions");
const { getAuth } = require('firebase-admin/auth')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')
const fcl = require("@onflow/fcl");
const crypto = require("crypto");

const db = getFirestore();
const appID = "DAO LLC Governance Portal (v0.1)"

exports.generateNonce = functions.https.onCall( async (data, context) => {
    const nonce = crypto.randomBytes(32).toString('hex');
    const now = Timestamp.now()
    const expires = now.toMillis() + 60000

    await db.collection('nonce-tokens').add({
        nonce: nonce,
        appID: appID,
        expires: expires,
    })

    return {
        nonce: nonce,
        appID: appID
    }
})

exports.removedExpiredNonce = 

exports.generateAuthToken = functions.https.onCall( async (data, context) => {
    let nonceDoc = await db.collection('nonce-tokens').where('nonce', '=', data.nonce).get()
    const now = Timestamp.now().toMillis()

    if (nonceDoc.empty) {
        return {
            status: "error",
            msg: "Invalid Nonce"
        }
    }

    var nonceExpired = false
    nonceDoc.forEach(nonce => {
        if (nonce.data().expires < now) {
            nonceExpired = true
        }
        nonce.ref.delete()
    })

    if (nonceExpired) {
        return {
            status: "error",
            msg: "Expired Nonce"
        }
    }

    const isValid = await fcl.AppUtils.verifyAccountProof(appID, data)

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