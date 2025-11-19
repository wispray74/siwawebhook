const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

// Middleware untuk menyimpan raw body
app.use(express.json({ verify: (req, res, buf, encoding) => {
    if (buf && buf.length) {
        req.rawBody = buf.toString(encoding || 'utf8');
    }
}}));

// 🔑 Konfigurasi environment
const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY;
const UNIVERSE_ID = process.env.UNIVERSE_ID;
const MESSAGING_TOPIC = process.env.MESSAGING_TOPIC || 'SiwaDonationBroadcast';

if (!ROBLOX_API_KEY || !UNIVERSE_ID) {
    console.error('❌ Environment variables ROBLOX_API_KEY dan UNIVERSE_ID wajib diatur!');
    console.error('   Silakan set di Railway atau file .env');
    process.exit(1);
}

const PUBLISH_API_URL = `https://apis.roblox.com/messaging-service/v1/universes/${UNIVERSE_ID}/topics/${encodeURIComponent(MESSAGING_TOPIC)}`;

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🚀 Siwa Donation Webhook Server');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📋 Configuration:');
console.log('  • Universe ID:', UNIVERSE_ID);
console.log('  • Messaging Topic:', MESSAGING_TOPIC);
console.log('  • API Endpoint:', PUBLISH_API_URL);
console.log('  • API Key:', ROBLOX_API_KEY.substring(0, 8) + '...');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// ✅ Helper function untuk extract username dari message
function extractUsername(message, donatorName) {
    if (!message) return donatorName;
    
    // Format 1: [Username] message
    const bracketMatch = message.match(/^\[(\w+)\]/);
    if (bracketMatch) {
        return bracketMatch[1];
    }
    
    // Format 2: @Username message
    const atMatch = message.match(/^@(\w+)/);
    if (atMatch) {
        return atMatch[1];
    }
    
    // Format 3: Username: message
    const colonMatch = message.match(/^(\w+):/);
    if (colonMatch) {
        return colonMatch[1];
    }
    
    // Default: gunakan nama donator
    return donatorName;
}

// ✅ Helper function untuk format Rupiah
function formatRupiah(amount) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(amount);
}

// ✅ Helper function untuk kirim ke Roblox MessagingService
async function sendToRoblox(donationData) {
    const robloxRequest = {
        message: JSON.stringify(donationData)
    };

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📤 Mengirim ke Roblox MessagingService:');
    console.log('  • Username:', donationData.username);
    console.log('  • Display Name:', donationData.displayName);
    console.log('  • Amount:', formatRupiah(donationData.amount));
    console.log('  • Source:', donationData.source);
    console.log('  • Message:', donationData.message || '(no message)');
    console.log('  • Timestamp:', new Date(donationData.timestamp * 1000).toLocaleString('id-ID'));

    try {
        const response = await axios.post(PUBLISH_API_URL, robloxRequest, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ROBLOX_API_KEY
            },
            timeout: 10000 // 10 detik timeout
        });

        console.log('✅ Sukses kirim ke Roblox!');
        console.log('  • Status:', response.status);
        console.log('  • Response:', JSON.stringify(response.data));
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        return { success: true, status: response.status, data: response.data };
    } catch (error) {
        console.error('❌ Gagal kirim ke Roblox MessagingService');
        
        if (error.response) {
            console.error('  • HTTP Status:', error.response.status);
            console.error('  • Response:', JSON.stringify(error.response.data, null, 2));
            
            if (error.response.status === 401) {
                console.error('  ⚠️  API Key tidak valid atau expired!');
            } else if (error.response.status === 403) {
                console.error('  ⚠️  API Key tidak punya permission untuk universe ini!');
            } else if (error.response.status === 404) {
                console.error('  ⚠️  Universe ID atau Topic tidak ditemukan!');
            }
        } else if (error.request) {
            console.error('  • No response received');
            console.error('  ⚠️  Tidak bisa connect ke Roblox API (timeout/network issue)');
        } else {
            console.error('  • Error:', error.message);
        }
        
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        throw error;
    }
}

// 📥 Endpoint: Saweria Webhook
app.post('/saweria-webhook', async (req, res) => {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📩 [SAWERIA] Webhook diterima');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Raw Payload:', JSON.stringify(req.body, null, 2));

    const payload = req.body;

    if (!payload) {
        console.error('❌ Payload kosong atau tidak valid');
        return res.status(400).json({ 
            success: false, 
            error: 'Payload tidak ditemukan' 
        });
    }

    // Hanya proses event donasi
    if (payload.type !== 'donation') {
        console.log('ℹ️  Diabaikan: bukan event donasi (type:', payload.type, ')');
        return res.status(200).json({ 
            success: true, 
            message: 'OK - Ignored non-donation event',
            type: payload.type 
        });
    }

    const donatorName = payload.donator_name || 'Anonymous';
    const amountRaw = payload.amount_raw || 0;
    const message = payload.message || '';
    const donatorEmail = payload.donator_email || '';

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💰 Detail Donasi Saweria:');
    console.log('  • Donator:', donatorName);
    console.log('  • Amount:', formatRupiah(amountRaw));
    console.log('  • Message:', message || '(no message)');
    console.log('  • Email:', donatorEmail || '(no email)');

    const robloxUsername = extractUsername(message, donatorName);
    console.log('  • Extracted Username:', robloxUsername);

    const donationData = {
        username: robloxUsername,
        displayName: donatorName,
        amount: Math.floor(amountRaw),
        timestamp: Math.floor(Date.now() / 1000),
        source: 'Saweria',
        message: message,
        email: donatorEmail
    };

    try {
        const result = await sendToRoblox(donationData);
        return res.status(200).json({
            success: true,
            message: 'Saweria donation processed successfully',
            data: {
                username: robloxUsername,
                amount: amountRaw,
                source: 'Saweria'
            },
            robloxResponse: result.data
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: 'Failed to forward to Roblox',
            details: error.response?.data || error.message
        });
    }
});

// 📥 Endpoint: SocialBuzz Webhook
app.post('/socialbuzz-webhook', async (req, res) => {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📩 [SOCIALBUZZ] Webhook diterima');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Raw Payload:', JSON.stringify(req.body, null, 2));

    const payload = req.body;

    if (!payload) {
        console.error('❌ Payload kosong atau tidak valid');
        return res.status(400).json({ 
            success: false, 
            error: 'Payload tidak ditemukan' 
        });
    }

    // SocialBuzz biasanya mengirim data dengan format berbeda
    // Sesuaikan field names dengan format actual dari SocialBuzz
    const donatorName = payload.supporter_name || payload.name || payload.donator_name || 'Anonymous';
    const amountRaw = payload.amount || payload.donation_amount || payload.amount_raw || 0;
    const message = payload.message || payload.supporter_message || payload.note || '';
    const donatorEmail = payload.supporter_email || payload.email || '';

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💰 Detail Donasi SocialBuzz:');
    console.log('  • Supporter:', donatorName);
    console.log('  • Amount:', formatRupiah(amountRaw));
    console.log('  • Message:', message || '(no message)');
    console.log('  • Email:', donatorEmail || '(no email)');

    const robloxUsername = extractUsername(message, donatorName);
    console.log('  • Extracted Username:', robloxUsername);

    const donationData = {
        username: robloxUsername,
        displayName: donatorName,
        amount: Math.floor(amountRaw),
        timestamp: Math.floor(Date.now() / 1000),
        source: 'SocialBuzz',
        message: message,
        email: donatorEmail
    };

    try {
        const result = await sendToRoblox(donationData);
        return res.status(200).json({
            success: true,
            message: 'SocialBuzz donation processed successfully',
            data: {
                username: robloxUsername,
                amount: amountRaw,
                source: 'SocialBuzz'
            },
            robloxResponse: result.data
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: 'Failed to forward to Roblox',
            details: error.response?.data || error.message
        });
    }
});

// 🏥 Health check endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        service: 'Siwa Donation Webhook',
        version: '1.0.0',
        description: 'Multi-Platform Donation Webhook for Roblox',
        platforms: [
            { name: 'Saweria', endpoint: '/saweria-webhook' },
            { name: 'SocialBuzz', endpoint: '/socialbuzz-webhook' }
        ],
        configuration: {
            universeId: UNIVERSE_ID,
            messagingTopic: MESSAGING_TOPIC,
            hasApiKey: !!ROBLOX_API_KEY
        },
        endpoints: {
            saweria: `${req.protocol}://${req.get('host')}/saweria-webhook`,
            socialbuzz: `${req.protocol}://${req.get('host')}/socialbuzz-webhook`,
            test: `${req.protocol}://${req.get('host')}/test`,
            debug: `${req.protocol}://${req.get('host')}/debug`
        },
        usage: {
            saweria: 'Configure this URL in your Saweria webhook settings',
            socialbuzz: 'Configure this URL in your SocialBuzz webhook settings',
            format: 'Send donation message with format: [RobloxUsername] Your message here'
        }
    });
});

// 🧪 Endpoint test manual
app.post('/test', async (req, res) => {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🧪 [TEST] Test endpoint dipanggil');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const source = req.body.source || 'Test';
    const testPayload = {
        username: req.body.username || 'TestUser123',
        displayName: req.body.displayName || 'Test Donator',
        amount: parseInt(req.body.amount) || 25000,
        timestamp: Math.floor(Date.now() / 1000),
        source: source,
        message: req.body.message || 'Test donation from webhook server'
    };

    console.log('📤 Payload test yang akan dikirim:');
    console.log(JSON.stringify(testPayload, null, 2));

    try {
        const result = await sendToRoblox(testPayload);
        res.json({
            success: true,
            message: 'Test donation sent successfully',
            status: result.status,
            sentPayload: testPayload,
            robloxResponse: result.data
        });
    } catch (error) {
        console.error('❌ Test gagal:', error.message);
        res.status(500).json({
            success: false,
            error: 'Test failed',
            message: error.response?.data || error.message,
            sentPayload: testPayload
        });
    }
});

// 🔍 Debug info endpoint
app.get('/debug', (req, res) => {
    res.json({
        server: 'Siwa Donation Webhook',
        version: '1.0.0',
        configuration: {
            universeId: UNIVERSE_ID,
            messagingTopic: MESSAGING_TOPIC,
            apiUrl: PUBLISH_API_URL,
            hasApiKey: !!ROBLOX_API_KEY,
            apiKeyPrefix: ROBLOX_API_KEY ? ROBLOX_API_KEY.substring(0, 8) + '...' : '❌ NOT SET'
        },
        supportedPlatforms: ['Saweria', 'SocialBuzz'],
        messageFormats: [
            '[RobloxUsername] Your message',
            '@RobloxUsername Your message',
            'RobloxUsername: Your message'
        ],
        environment: {
            nodeVersion: process.version,
            platform: process.platform,
            uptime: process.uptime(),
            memory: process.memoryUsage()
        }
    });
});

// 📊 Stats endpoint
app.get('/stats', (req, res) => {
    res.json({
        uptime: process.uptime(),
        uptimeFormatted: new Date(process.uptime() * 1000).toISOString().substr(11, 8),
        memory: {
            rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
            heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
            heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB`
        },
        platform: process.platform,
        nodeVersion: process.version
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        availableEndpoints: {
            root: '/',
            saweria: '/saweria-webhook',
            socialbuzz: '/socialbuzz-webhook',
            test: '/test',
            debug: '/debug',
            stats: '/stats'
        }
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

// ▶️ Jalankan server
app.listen(port, () => {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Siwa Donation Webhook Server by Archie is running!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🌐 Port: ${port}`);
    console.log(`📡 Saweria:    http://localhost:${port}/saweria-webhook`);
    console.log(`📡 SocialBuzz: http://localhost:${port}/socialbuzz-webhook`);
    console.log(`🧪 Test:       http://localhost:${port}/test`);
    console.log(`🔍 Debug:      http://localhost:${port}/debug`);
    console.log(`📊 Stats:      http://localhost:${port}/stats`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});
