
/**
 * Simple Benchmark Script for Turso Plans API
 * Usage: node scripts/benchmark.js
 */

const BASE_URL = 'http://localhost:5173/api/plans'; // Adjust port if needed

async function runBenchmark() {
  console.log('🚀 Starting Benchmark on', BASE_URL);
  
  const iterations = 50;
  const latencies = [];
  let errors = 0;

  const startTotal = performance.now();

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    try {
      const res = await fetch(`${BASE_URL}?page=1&limit=10`);
      if (!res.ok) throw new Error(res.statusText);
      await res.json();
      
      const duration = performance.now() - start;
      latencies.push(duration);
      process.stdout.write('.');
    } catch (e) {
      errors++;
      process.stdout.write('x');
    }
  }

  const endTotal = performance.now();
  const totalTime = (endTotal - startTotal) / 1000;

  console.log('\n\n📊 Benchmark Results');
  console.log('-------------------');
  console.log(`Total Requests: ${iterations}`);
  console.log(`Failed Requests: ${errors}`);
  console.log(`Total Time:     ${totalTime.toFixed(2)}s`);
  console.log('-------------------');
  
  if (latencies.length > 0) {
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const min = Math.min(...latencies);
    const max = Math.max(...latencies);
    
    console.log(`Avg Latency:    ${avg.toFixed(2)}ms`);
    console.log(`Min Latency:    ${min.toFixed(2)}ms`);
    console.log(`Max Latency:    ${max.toFixed(2)}ms`);
  }
}

// Check if fetch is available (Node 18+)
if (typeof fetch === 'undefined') {
  console.error('This script requires Node.js 18+');
} else {
  runBenchmark();
}
