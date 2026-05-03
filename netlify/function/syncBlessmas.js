const admin = require('firebase-admin');

exports.handler = async function(event, context) {
    // 1. Firebase Configuration (Updated for Blessmas)
    const databaseURL = "https://intracore-cyber-syn-default-rtdb.firebaseio.com";
    const branchPath = "cafes/blessmas/wifi_vouchers";
    
    // We removed the authSecret because your database is currently open 
    // and passing a Web API key causes a Firebase rejection error.
    const fetchUrl = `${databaseURL}/${branchPath}.json`;

exports.handler = async (event, context) => {
    const db = admin.database();
    const vouchersRef = db.ref('cafes/blessmas/wifi_vouchers');
    
    try {
        // 1. Get all vouchers
        const snapshot = await vouchersRef.once('value');
        if (!snapshot.exists()) return { statusCode: 200, body: "NO_NEW_TOKENS" };

        const vouchers = snapshot.val();
        let mikrotikPayload = "";
        let updates = {};
        let hasNewTokens = false;

        // 2. Loop through and find un-synced tokens
        for (const [key, data] of Object.entries(vouchers)) {
            if (data.synced !== true) {
                hasNewTokens = true;
                
                // Format the uptime limit safely
                let safeTime = "0"; // 0 means unlimited in our router script
                if (data.uptimeLimit && data.uptimeLimit.toLowerCase() !== 'unlimited') {
                    safeTime = data.uptimeLimit.toLowerCase().replace(/\s+/g, '').replace(/days|day/, 'd').replace(/hours|hour/, 'h').replace(/minutes|minute/, 'm');
                }

                // Add to the payload string (Format: TOKEN,LIMIT)
                mikrotikPayload += `${data.code},${safeTime}\n`;

                // Prepare Firebase update to mark as synced
                updates[`${key}/synced`] = true;
                updates[`${key}/syncedAt`] = Date.now();
            }
        }

        // 3. Update Firebase and send text to MikroTik
        if (hasNewTokens) {
            await vouchersRef.update(updates);
            return { statusCode: 200, body: mikrotikPayload };
        } else {
            return { statusCode: 200, body: "NO_NEW_TOKENS" };
        }

    } catch (error) {
        console.error("Firebase Error:", error);
        return { statusCode: 500, body: "ERROR" };
    }
};
