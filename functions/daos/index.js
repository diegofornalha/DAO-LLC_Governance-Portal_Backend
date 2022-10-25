const functions = require("firebase-functions")
const { getFirestore } = require('firebase-admin/firestore');

const db = getFirestore();

exports.create = functions.https.onCall( async (data, context) => {
    const json = JSON.parse(data)
    const memberIDs = []

    json.members.forEach(member => {
        memberIDs.push(member.id)
    })

    if (json.members.some(member => member.id === context.auth.uid)) {
        let dao = await db.collection('daos').add({
            name: json.name,
            memberIDs: memberIDs,
            memberInfo: json.members
        })
    
        if (dao == null) {
            return {
                status: 'error'
            }
        }
    
        return {
            status: 'created'
        }
    } else {
        return {
            status: 'error',
            msg: "The user creating the DAO must be listed as an initial member of the DAO."
        }
    }
})