const admin = require('firebase-admin');

// Hardcoded JSON (Not recommended for production!)
const serviceAccount = {
  "type": "service_account",
  "project_id": "intracore-cyber-syn",
apiKey: "AIzaSyB7Ofntn3k7ingeYINtCr6SNQB69lct4VA",
  authDomain: "intracore-cyber-syn.firebaseapp.com",
  databaseURL: "https://intracore-cyber-syn-default-rtdb.firebaseio.com",
  projectId: "intracore-cyber-syn",
  storageBucket: "intracore-cyber-syn.firebasestorage.app",
  messagingSenderId: "415471049270",
  appId: "1:415471049270:web:151584cf1ec0b3dd425697",
  measurementId: "G-24H4T6WB4P"
};

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://intracore-cyber-syn-default-rtdb.firebaseio.com"
    });
}

// 2. The Main Function Handler
exports.handler = async (event, context) => {
    const db = admin.database();
    
    // Updated path for the Blessmas deployment
    const vouchersRef = db.ref('cafes/blessmas/wifi_vouchers');
    
    try {
        // Step A: Get all vouchers
        const snapshot = await vouchersRef.once('value');
        if (!snapshot.exists()) return { statusCode: 200, body: "NO_NEW_TOKENS" };

        const vouchers = snapshot.val();
        let mikrotikPayload = "";
        let updates = {};
        let hasNewTokens = false;

        // Step B: Loop through and find un-synced tokens
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

        // Step C: Update Firebase and send text to MikroTik
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
