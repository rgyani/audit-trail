import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 500 },  // Quick ramp-up
    { duration: '1m', target: 1200 }, // Scalable Capital target RPS
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<5'],   // Requirement: Minimal gateway overhead
  },
};

export default function () {
  // Use TARGET_URL from environment variable
  const url = __ENV.TARGET_URL || 'http://localhost:4000/graphql';
  
  const payload = JSON.stringify({
    query: 'mutation { placeOrder(symbol: "AAPL", amount: 100) { id } }',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer mock-jwt-token',
    },
  };

  const res = http.post(url, payload, params);

  check(res, {
    'is status 200': (r) => r.status === 200,
  });

  sleep(0.1);
}