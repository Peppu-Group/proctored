// paystack.js
require('dotenv').config(); 
const axios = require('axios');

const PAYSTACK_SECRET = process.env.PAYSTACK_TEST;

const paystack = axios.create({
  baseURL: 'https://api.paystack.co',
  headers: {
    Authorization: `Bearer ${PAYSTACK_SECRET}`,
    'Content-Type': 'application/json'
  }
});

module.exports = paystack;
