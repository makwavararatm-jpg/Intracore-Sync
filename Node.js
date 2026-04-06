const { RouterOSAPI } = require('node-routeros');
const admin = require('firebase-admin');

// --- 1. FIREBASE SETUP ---
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://intracore-cyber-syn-default-rtdb.firebaseio.com"
});
const db = admin.database();

// --- 2. MIKROTIK CONFIG ---
const routerConfig = {
    host: '192.168.1.217',
    user: 'intracore',
    password: '12345',
    timeout: 30 // Increased to 30s to prevent the timeout error
};

let conn = new RouterOSAPI(routerConfig);
let previousTraffic = {};
let isConnected = false;

// --- 3. RECONNECTION ENGINE ---
async function connectToRouter() {
    try {
        if (isConnected) await conn.close();
        conn = new RouterOSAPI(routerConfig);
        await conn.connect();
        isConnected = true;
        console.log("✅ Connected to MikroTik successfully!");
    } catch (err) {
        isConnected = false;
        console.error("❌ Router Connection Failed. Retrying in 5s...", err.message);
        setTimeout(connectToRouter, 5000);
    }
}

// --- 4. THE TELEMETRY LOOP ---
async function startTelemetry() {
    setInterval(async () => {
        if (!isConnected) return;

        try {
            // Get active users. Using '.write' is more stable for v6.41
            const activeUsers = await conn.write('/ip/hotspot/active/print');
            let liveNetworkPayload = [];

            activeUsers.forEach(user => {
                const mac = user['mac-address'];
                const bIn = parseInt(user['bytes-in']) || 0;
                const bOut = parseInt(user['bytes-out']) || 0;

                let upMbps = "0.00";
                let downMbps = "0.00";

                if (previousTraffic[mac]) {
                    // Difference in bytes over 3 seconds
                    const deltaIn = bIn - previousTraffic[mac].in;
                    const deltaOut = bOut - previousTraffic[mac].out;
                    // Bits per second / 1,000,000 = Mbps
                    upMbps = ((deltaIn * 8) / 1000000 / 3).toFixed(2);
                    downMbps = ((deltaOut * 8) / 1000000 / 3).toFixed(2);
                }

                previousTraffic[mac] = { in: bIn, out: bOut };

                liveNetworkPayload.push({
                    code: user.user,
                    ip: user.address,
                    mac: mac,
                    uptime: user.uptime,
                    downloadSpeed: Math.max(0, downMbps),
                    uploadSpeed: Math.max(0, upMbps)
                });
            });

            // Push to Firebase (Must match admin.html path)
            await db.ref('cafes/intracore_test/live_network').set(liveNetworkPayload);
            process.stdout.write(`\r📡 Telemetry: ${liveNetworkPayload.length} active devices synced.`);

        } catch (error) {
            console.log("\n⚠️ Telemetry Lag (Router Busy). Recovering...");
            isConnected = false;
            connectToRouter(); // Force a fresh connection if the router hangs
        }
    }, 3000);
}

// --- 5. TOKEN LISTENER (Pushes new vouchers to Router) ---
function startTokenListener() {
    console.log("📡 Listening for new vouchers in Firebase...");
    db.ref('cafes/intracore_test/wifi_vouchers').on('child_added', async (snapshot) => {
        const voucher = snapshot.val();
        
        // Only process if it hasn't been synced to the router yet
        if (voucher.status === 'active' && !voucher.syncedToRouter) {
            try {
                if (!isConnected) return;
                
                await conn.write('/ip/hotspot/user/add', [
                    `=name=${voucher.code}`,
                    `=password=${voucher.code}`,
                    `=profile=${voucher.package}`,
                    `=limit-uptime=${voucher.uptimeLimit}`,
                    `=comment=IntraCore_${voucher.cashier}`
                ]);
                
                // Mark as synced so we don't add it twice
                await snapshot.ref.update({ syncedToRouter: true });
                console.log(`\n🎟️ Voucher ${voucher.code} added to MikroTik!`);
            } catch (err) {
                console.error(`\n❌ Error adding voucher ${voucher.code}:`, err.message);
            }
        }
    });
}

// --- START EVERYTHING ---
async function startApp() {
    await connectToRouter();
    startTelemetry();
    startTokenListener();
}

startApp();