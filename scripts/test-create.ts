
/**
 * Test API Creation Script
 * Usage: 
 *   Local: npm run test:create
 *   Remote: API_URL=https://your-app.vercel.app/api/plans npm run test:create
 */

const API_URL = process.env.API_URL || 'http://localhost:3000/api/plans';

async function testCreate() {
  console.log(`🚀 Testing POST to: ${API_URL}`);
  
  const payload = {
    headcode: `TEST_${Date.now().toString().slice(-4)}`,
    ma_ct: "CT001",
    ten_ct: "Test Project Integration",
    ten_hang_muc: "Test Item via Script",
    ma_nha_may: "NM_TEST_01",
    dvt: "m3",
    so_luong_ipo: 100.5
  };

  console.log('📦 Payload:', payload);

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'TestScript/1.0'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    
    console.log('------------------------------------------------');
    console.log(`📡 Status: ${res.status} ${res.statusText}`);
    console.log('📄 Response:', JSON.stringify(data, null, 2));
    console.log('------------------------------------------------');

    if (!res.ok) {
        console.error('❌ Test Failed');
        process.exit(1);
    } else {
        console.log('✅ Test Passed');
    }

  } catch (err: any) {
    console.error('❌ Connection Error:', err.message);
    if (err.message.includes('fetch')) {
        console.log('Tip: Ensure your development server is running (npm run dev) or use a valid remote API_URL.');
    }
  }
}

// Check if fetch is available (Node 18+)
if (typeof fetch === 'undefined') {
    console.error('❌ Error: This script requires Node.js 18+');
    process.exit(1);
}

testCreate();
