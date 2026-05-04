exports.handler = async function(event, context) {
    // Pointed to the new Blessmas database!
    const databaseURL = "https://intracore-cyber-syn-default-rtdb.firebaseio.com";
    const branchPath = "cafes/blessmas/wifi_vouchers";
    
    const fetchUrl = `${databaseURL}/${branchPath}.json`;

    try {
        const response = await fetch(fetchUrl);
        const vouchers = await response.json();

        if (!vouchers || vouchers.error) {
            return { statusCode: 200, body: "NO_NEW_TOKENS" };
        }

        let outputString = "";
        let hasNewTokens = false;

        for (const [id, voucher] of Object.entries(vouchers)) {
            // Using your Blessmas logic for "synced" instead of "injected"
            if (voucher.status === 'active' && !voucher.synced) {
                const code = voucher.code;
                const uptime = (voucher.uptimeLimit && voucher.uptimeLimit.toLowerCase() !== 'unlimited') ? voucher.uptimeLimit : '0';
                
                outputString += `${code},${uptime}\n`;
                hasNewTokens = true;

                const updateUrl = `${databaseURL}/${branchPath}/${id}.json`;
                await fetch(updateUrl, {
                    method: 'PATCH',
                    body: JSON.stringify({ synced: true }), // Changed to synced
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        if (!hasNewTokens) {
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
