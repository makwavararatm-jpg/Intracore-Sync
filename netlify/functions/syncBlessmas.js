exports.handler = async function(event, context) {
    const databaseURL = "https://intracore-cyber-syn-default-rtdb.firebaseio.com";
    const wifiPath = "cafes/blessmas/wifi_vouchers";
    const smsPath = "cafes/blessmas/commands/sms";
    const kickPath = "cafes/blessmas/commands/kick";

    try {
        // ==========================================
        // 1. PROCESS SMS QUEUE (The Heartbeat)
        // ==========================================
        const smsResponse = await fetch(`${databaseURL}/${smsPath}.json`);
        const smsJobs = await smsResponse.json();

        if (smsJobs && !smsJobs.error) {
            for (const [jobId, job] of Object.entries(smsJobs)) {
                if (job.status === 'pending') {
                    const success = await sendBlessmasSMS(job.to, job.message);
                    
                    if (success) {
                        await fetch(`${databaseURL}/${smsPath}/${jobId}.json`, {
                            method: 'PATCH',
                            body: JSON.stringify({ status: 'sent', sentAt: Date.now() }),
                            headers: { 'Content-Type': 'application/json' }
                        });
                    }
                }
            }
        }

        let outputString = "";
        let hasAction = false;

        // ==========================================
        // 2. PROCESS KICK COMMANDS (Highest Priority)
        // ==========================================
        const kickResponse = await fetch(`${databaseURL}/${kickPath}.json`);
        const kickJobs = await kickResponse.json();

        if (kickJobs && !kickJobs.error) {
            for (const [id, kick] of Object.entries(kickJobs)) {
                if (kick.processed === false || !kick.processed) {
                    // Format: code,KICK,0 (matches the 3-value router parser)
                    outputString = `${kick.code},KICK,0\n`;
                    hasAction = true;

                    // Mark kick as processed in Firebase
                    await fetch(`${databaseURL}/${kickPath}/${id}.json`, {
                        method: 'PATCH',
                        body: JSON.stringify({ processed: true }),
                        headers: { 'Content-Type': 'application/json' }
                    });
                    break; // Stream exactly one action to prevent string pollution
                }
            }
        }

        // ==========================================
        // 3. PROCESS WI-FI TOKENS (If no kick is pending)
        // ==========================================
        if (!hasAction) {
            const fetchUrl = `${databaseURL}/${wifiPath}.json`;
            const response = await fetch(fetchUrl);
            const vouchers = await response.json();

            if (vouchers && !vouchers.error) {
                for (const [id, voucher] of Object.entries(vouchers)) {
                    if (voucher.status === 'active' && !voucher.synced) {
                        const code = voucher.code;
                        const uptime = (voucher.uptimeLimit && voucher.uptimeLimit.toLowerCase() !== 'unlimited') ? voucher.uptimeLimit : '0';
                        
                        // --- CALCULATE DATA LIMIT BYTES ---
                        let bytes = 0;
                        if (voucher.dataLimit && voucher.dataLimit.toLowerCase() !== 'unlimited') {
                            let rawData = voucher.dataLimit.toUpperCase().replace(/\s+/g, '');
                            if (rawData.includes('GB') || rawData.includes('G')) {
                                let val = parseFloat(rawData.replace(/[A-Z]/g, ''));
                                bytes = Math.floor(val * 1073741824); // GB to Bytes
                            } else if (rawData.includes('MB') || rawData.includes('M')) {
                                let val = parseFloat(rawData.replace(/[A-Z]/g, ''));
                                bytes = Math.floor(val * 1048576);  // MB to Bytes
                            }
                        }
                        
                        // Format: code,uptime,bytes
                        outputString = `${code},${uptime},${bytes}\n`;
                        hasAction = true;

                        // Mark the token as synced in Firebase
                        const updateUrl = `${databaseURL}/${wifiPath}/${id}.json`;
                        await fetch(updateUrl, {
                            method: 'PATCH',
                            body: JSON.stringify({ synced: true }), 
                            headers: { 'Content-Type': 'application/json' }
                        });
                        break; // Stream exactly one action to prevent string pollution
                    }
                }
            }
        }

        // If no kicks and no new tokens need syncing
        if (!hasAction) {
            return { statusCode: 200, body: "NO_NEW_TOKENS" };
        }

        // Hand the clean 3-part data block back to the MikroTik
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
// 4. THE SMS POP ENGINE (Helper Function)
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
