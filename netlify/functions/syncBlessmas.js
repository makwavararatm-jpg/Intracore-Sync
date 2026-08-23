exports.handler = async function(event, context) {
    const databaseURL = "https://intracore-cyber-syn-default-rtdb.firebaseio.com";
    const wifiPath = "cafes/blessmas/wifi_vouchers";
    const smsPath = "cafes/blessmas/commands/sms";
    const kickPath = "cafes/blessmas/commands/kick";

    try {
        // ==========================================
        // 1. PROCESS SMS QUEUE
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
        // 2. PROCESS KICK COMMANDS (High Priority)
        // ==========================================
        const kickResponse = await fetch(`${databaseURL}/${kickPath}.json`);
        const kickJobs = await kickResponse.json();

        if (kickJobs && !kickJobs.error) {
            for (const [id, kick] of Object.entries(kickJobs)) {
                if (kick.processed === false || !kick.processed) {
                    outputString = `${kick.code},KICK,0,default`;
                    hasAction = true;

                    await fetch(`${databaseURL}/${kickPath}/${id}.json`, {
                        method: 'PATCH',
                        body: JSON.stringify({ processed: true }),
                        headers: { 'Content-Type': 'application/json' }
                    });
                    break; 
                }
            }
        }

       // ==========================================
        // 3. PROCESS WI-FI TOKENS (ANTI-JAMMING & SPEED PROFILES)
        // ==========================================
        if (!hasAction) {
            // Grab up to 5 unsynced items just in case dead/voided tokens are blocking the line
            const fetchUrl = `${databaseURL}/${wifiPath}.json?orderBy="synced"&equalTo=null&limitToFirst=5`;
            const response = await fetch(fetchUrl);
            const vouchers = await response.json();

            if (vouchers && !vouchers.error) {
                for (const [id, voucher] of Object.entries(vouchers)) {
                    
                    // 1. Immediately mark WHATEVER we grabbed as synced to clear the traffic jam
                    const updateUrl = `${databaseURL}/${wifiPath}/${id}.json`;
                    await fetch(updateUrl, {
                        method: 'PATCH',
                        body: JSON.stringify({ synced: true }), 
                        headers: { 'Content-Type': 'application/json' }
                    });

                    // 2. If it is actually an active token, prepare it for the router and stop looking
                    if (voucher.status === 'active') {
                        const code = voucher.code;
                        const uptime = (voucher.uptimeLimit && voucher.uptimeLimit.toLowerCase() !== 'unlimited') ? voucher.uptimeLimit : '0';
                        
                        // NEW: Extract the speed profile
                        const speed = voucher.speedLimit || 'default';
                        
                        let bytes = 0;
                        if (voucher.dataLimit && voucher.dataLimit.toLowerCase() !== 'unlimited') {
                            let rawData = voucher.dataLimit.toUpperCase().replace(/\s+/g, '');
                            if (rawData.includes('GB') || rawData.includes('G')) {
                                bytes = Math.floor(parseFloat(rawData.replace(/[A-Z]/g, '')) * 1073741824); 
                            } else if (rawData.includes('MB') || rawData.includes('M')) {
                                bytes = Math.floor(parseFloat(rawData.replace(/[A-Z]/g, '')) * 1048576); 
                            }
                        }
                        
                        // NEW: Output string now includes 4 items: code, uptime, bytes, speed
                        outputString = `${code},${uptime},${bytes},${speed}`;
                        hasAction = true;
                        
                        // We found our 1 valid token for this cycle, exit the loop so the router processes it
                        break; 
                    }
                }
            }
        }

        if (!hasAction) {
            return { statusCode: 200, body: "NO_NEW_TOKENS" };
        }

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
// 4. THE SMS POP ENGINE
// ==========================================
async function sendBlessmasSMS(phone, messageBody) {
    const SMS_POP_TOKEN = "56|arLEaElnvhnn5OQyiDedClFxf6mj768dVK83pRyYf8d79119"; 
    try {
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
        return response.ok;
    } catch (error) {
        return false;
    }
}
