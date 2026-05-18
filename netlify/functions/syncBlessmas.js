exports.handler = async function(event, context) {
    const databaseURL = "https://intracore-cyber-syn-default-rtdb.firebaseio.com";
    const wifiPath = "cafes/blessmas/wifi_vouchers";
    const smsPath = "cafes/blessmas/commands/sms";

    try {
        // ==========================================
        // 1. PROCESS SMS QUEUE (The Heartbeat)
        // ==========================================
        // First, check if there are any pending SMS jobs waiting to be sent
        const smsResponse = await fetch(`${databaseURL}/${smsPath}.json`);
        const smsJobs = await smsResponse.json();

        if (smsJobs && !smsJobs.error) {
            for (const [jobId, job] of Object.entries(smsJobs)) {
                if (job.status === 'pending') {
                    // Trigger the SMS Engine at the bottom of this file
                    const success = await sendBlessmasSMS(job.to, job.message);
                    
                    if (success) {
                        // If sent successfully, update Firebase so it doesn't send again
                        await fetch(`${databaseURL}/${smsPath}/${jobId}.json`, {
                            method: 'PATCH',
                            body: JSON.stringify({ status: 'sent', sentAt: Date.now() }),
                            headers: { 'Content-Type': 'application/json' }
                        });
                    }
                }
            }
        }

        // ==========================================
        // 2. PROCESS WI-FI TOKENS (For the Router)
        // ==========================================
        const fetchUrl = `${databaseURL}/${wifiPath}.json`;
        const response = await fetch(fetchUrl);
        const vouchers = await response.json();

        if (!vouchers || vouchers.error) {
            return { statusCode: 200, body: "NO_NEW_TOKENS" };
        }

        let outputString = "";
        let hasNewTokens = false;

        for (const [id, voucher] of Object.entries(vouchers)) {
            // Check for active and unsynced tokens
            if (voucher.status === 'active' && !voucher.synced) {
                const code = voucher.code;
                const uptime = (voucher.uptimeLimit && voucher.uptimeLimit.toLowerCase() !== 'unlimited') ? voucher.uptimeLimit : '0';
                
                outputString += `${code},${uptime}\n`;
                hasNewTokens = true;

                // Mark the token as synced in Firebase
                const updateUrl = `${databaseURL}/${wifiPath}/${id}.json`;
                await fetch(updateUrl, {
                    method: 'PATCH',
                    body: JSON.stringify({ synced: true }), 
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        if (!hasNewTokens) {
            return { statusCode: 200, body: "NO_NEW_TOKENS" };
        }

        // Hand the clean token data back to the MikroTik
        return {
            statusCode: 200,
            headers: { "Content-Type": "text/plain" },
            body: outputString
        };

    } catch (error) {
        console.error("Error fetching data:", error);
        return { statusCode: 500, body: "ERROR" };
    }
};

// ==========================================
// 3. THE SMS POP ENGINE (Helper Function)
// ==========================================
async function sendBlessmasSMS(phone, messageBody) {
    const SMS_POP_TOKEN = "56|arLEaElnvhnn5OQyiDedClFxf6mj768dVK83pRyYf8d79119"; 
    
    try {
        console.log(`Preparing to send SMS to ${phone}...`);
        
        const response = await fetch('https://smspop.co.zw/api/campaigns', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${SMS_POP_TOKEN}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                name: 'Blessmas automated token',
                message: messageBody,
                sender_id: "Intracore",
                contact_import_method: 'manual',
                manual_contacts: phone
            })
        });

        if (response.ok) {
            console.log(`🟢 SUCCESS: SMS sent to ${phone}`);
            return true;
        } else {
            const errorText = await response.text();
            console.error(`🔴 API REJECTED THE SMS:`, errorText);
            return false;
        }
    } catch (error) {
        console.error(`🔴 NETWORK CRASH WHILE SENDING SMS:`, error.message);
        return false;
    }
}
